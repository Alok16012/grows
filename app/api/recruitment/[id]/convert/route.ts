import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { findEmployeeDuplicates, duplicateMessage } from "@/lib/employee-dedupe"
import prisma from "@/lib/prisma"
import {
    collectErrors, validationResponse,
    validatePhone, validateEmail, validateAadhaar, validatePAN,
    validateIFSC, validateBankAccount, validatePincode, validateUAN,
    validateESIC, validatePFNumber, validateDateOfBirth, validateAmount,
    normalizePhone, normalizeUpper, digitsOnly,
} from "@/lib/validation"
import { Role } from "@prisma/client"
import bcrypt from "bcryptjs"
import crypto from "crypto"

// POST /api/recruitment/[id]/convert
// Converts a SELECTED/JOINED lead into a full Employee with salary + deployment
export async function POST(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session || !checkAccess(session, [Role.MANAGER, Role.HR_MANAGER], "recruitment.manage")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const lead = await prisma.lead.findUnique({ where: { id: params.id } })
        if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 })
        if (lead.convertedEmployeeId) {
            return NextResponse.json({ alreadyConverted: true, employeeId: lead.convertedEmployeeId })
        }

        const body = await req.json()
        const {
            // Employment
            siteId, departmentId, designation, dateOfJoining, employmentType, salaryType, managerId,
            // Salary
            basicSalary, da, washing, conveyance, leaveWithWages, otherAllowance,
            otRatePerHour, canteenRatePerDay, complianceType, hra: hraInput, bonus: bonusInput,
            // Deployment
            deployRole, deployShift, deployStartDate,
            // Personal — explicit overrides (from form)
            firstName: formFirstName, middleName, lastName: formLastName,
            email: formEmail, phone: formPhone, alternatePhone,
            dateOfBirth, gender: formGender, aadharNumber, panNumber,
            address, city: formCity, state, pincode,
            permanentAddress, permanentCity, permanentState, permanentPincode,
            // Bank
            bankName, bankBranch, bankAccountNumber, bankIFSC,
            // Notes
            notes,
            // Compliance / Identity
            nameAsPerAadhar, fathersName, bloodGroup, maritalStatus,
            nationality, religion, caste,
            // Statutory
            uan, pfNumber, esiNumber, labourCardNo,
            // Emergency
            emergencyContact1Name, emergencyContact1Phone,
            emergencyContact2Name, emergencyContact2Phone,
            // Safety
            safetyGoggles, safetyGloves, safetyHelmet,
            safetyMask, safetyJacket, safetyEarMuffs, safetyShoes,
        } = body

        // ── Validate the KYC the operator typed ───────────────────────────────
        // This is the handoff where a candidate's identity/bank data becomes an
        // employee record, so it is the last point where bad values can be
        // stopped. Only the form-supplied values are checked — falling back to
        // the lead's own phone/email must keep working for legacy leads.
        const errors = collectErrors({
            phone: validatePhone(formPhone),
            email: validateEmail(formEmail),
            alternatePhone: validatePhone(alternatePhone),
            dateOfBirth: validateDateOfBirth(dateOfBirth),
            aadharNumber: validateAadhaar(aadharNumber),
            panNumber: validatePAN(panNumber),
            bankAccountNumber: validateBankAccount(bankAccountNumber),
            bankIFSC: validateIFSC(bankIFSC),
            pincode: validatePincode(pincode),
            permanentPincode: validatePincode(permanentPincode),
            uan: validateUAN(uan),
            pfNumber: validatePFNumber(pfNumber),
            esiNumber: validateESIC(esiNumber),
            emergencyContact1Phone: validatePhone(emergencyContact1Phone),
            emergencyContact2Phone: validatePhone(emergencyContact2Phone),
            basicSalary: validateAmount(basicSalary, "Basic salary"),
        })
        // The convert modal reads this body with res.json() and toasts `error`.
        if (errors) return NextResponse.json(validationResponse(errors), { status: 400 })

        // ── Employee ID (temporary until onboarding approval) ──────────────────
        // A converted candidate is in ONBOARDING status — they don't get a real
        // EMP-NNNN code until their onboarding is approved. Until then they carry
        // a PENDING-xxxx placeholder (swapped for the real code on approval).
        const finalId = `PENDING-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`

        // ── Resolve name — form overrides lead ────────────────────────────────
        const nameParts = lead.candidateName.trim().split(/\s+/)
        const firstName = formFirstName?.trim() || nameParts[0]
        const lastName  = formLastName?.trim()  || nameParts.slice(1).join(" ") || ""

        // Block converting a candidate whose Aadhaar / PAN / mobile / email
        // already belongs to an existing employee.
        const dupConflicts = await findEmployeeDuplicates({
            aadharNumber,
            panNumber,
            phone: formPhone?.trim() || lead.phone,
            email: formEmail?.trim() || lead.email,
            bankAccountNumber,
        })
        if (dupConflicts.length > 0) {
            return NextResponse.json({ error: duplicateMessage(dupConflicts), conflicts: dupConflicts }, { status: 409 })
        }

        // ── Create / reuse User account ───────────────────────────────────────
        const resolvedEmail = formEmail?.trim() || lead.email || `${lead.phone}@cims.local`
        let userId: string
        const existingUser = await prisma.user.findUnique({ where: { email: resolvedEmail } })
        if (existingUser) {
            userId = existingUser.id
        } else {
            const hash = await bcrypt.hash(lead.phone || "123456", 8)
            const newUser = await prisma.user.create({
                data: {
                    name: `${firstName} ${lastName}`.trim(),
                    email: resolvedEmail,
                    password: hash,
                    role: "INSPECTION_BOY", // default; admin can change after onboarding
                }
            })
            userId = newUser.id
        }

        const onboardingToken = crypto.randomUUID().replace(/-/g, "")

        // ── Create Employee with all fields ───────────────────────────────────
        const employee = await prisma.employee.create({
            data: {
                employeeId:    finalId,
                firstName,
                lastName,
                middleName:    middleName   || null,
                phone:         normalizePhone(formPhone?.trim() || lead.phone),
                email:         resolvedEmail !== `${lead.phone}@cims.local` ? resolvedEmail : (lead.email || null),
                alternatePhone: alternatePhone || null,
                designation:   designation || lead.position || null,
                gender:        formGender  || lead.gender  || null,
                departmentId:  departmentId || null,
                dateOfJoining: dateOfJoining ? new Date(dateOfJoining) : new Date(),
                status:        "ONBOARDING",
                employmentType: employmentType || "Full-time",
                salaryType:    salaryType || "Monthly",
                basicSalary:   basicSalary ? parseFloat(basicSalary) : 0,
                managerId:     managerId  || null,
                notes:         notes      || null,
                onboardingToken,
                userId,
                createdBy:     session.user.id,
                // Personal
                dateOfBirth:   dateOfBirth ? new Date(dateOfBirth) : null,
                aadharNumber:  aadharNumber ? digitsOnly(aadharNumber)  : null,
                panNumber:     panNumber    ? normalizeUpper(panNumber) : null,
                address:       address       || null,
                city:          formCity      || lead.city || null,
                state:         state         || null,
                pincode:       pincode       || null,
                permanentAddress:  permanentAddress  || null,
                permanentCity:     permanentCity     || null,
                permanentState:    permanentState    || null,
                permanentPincode:  permanentPincode  || null,
                // Bank
                bankName:          bankName          || null,
                bankBranch:        bankBranch        || null,
                bankAccountNumber: bankAccountNumber || null,
                bankIFSC:          bankIFSC ? normalizeUpper(bankIFSC) : null,
                // Compliance / Identity
                nameAsPerAadhar:   nameAsPerAadhar   || null,
                fathersName:       fathersName        || null,
                bloodGroup:        bloodGroup         || null,
                maritalStatus:     maritalStatus      || null,
                nationality:       nationality        || "Indian",
                religion:          religion           || null,
                caste:             caste              || null,
                // Statutory
                uan:               uan                || null,
                pfNumber:          pfNumber           || null,
                esiNumber:         esiNumber          || null,
                labourCardNo:      labourCardNo       || null,
                // Emergency
                emergencyContact1Name:  emergencyContact1Name  || null,
                emergencyContact1Phone: emergencyContact1Phone || null,
                emergencyContact2Name:  emergencyContact2Name  || null,
                emergencyContact2Phone: emergencyContact2Phone || null,
                // Safety
                safetyGoggles:  !!safetyGoggles,
                safetyGloves:   !!safetyGloves,
                safetyHelmet:   !!safetyHelmet,
                safetyMask:     !!safetyMask,
                safetyJacket:   !!safetyJacket,
                safetyEarMuffs: !!safetyEarMuffs,
                safetyShoes:    !!safetyShoes,
                // Carry the candidate's profile photo over to the employee
                photo:          lead.profileUrl || null,
            },
        })

        // ── Salary structure ──────────────────────────────────────────────────
        const basic = parseFloat(basicSalary || 0)
        const daAmt = parseFloat(da || 0)
        if (basic > 0) {
            const cType  = String(complianceType || "OR").toUpperCase() === "CALL" ? "CALL" : "OR"
            const isCALL = cType === "CALL"
            const hra    = isCALL ? 0 : (parseFloat(hraInput || 0) || 0)
            const bonus  = isCALL ? 0 : (parseFloat(bonusInput || 0) || 0)
            const wash   = parseFloat(washing || 0)
            const conv   = parseFloat(conveyance || 0)
            const lww    = parseFloat(leaveWithWages || 0)
            const other  = parseFloat(otherAllowance || 0)
            const ctcM   = basic + daAmt + hra + wash + conv + lww + bonus + other
            await prisma.employeeSalary.create({
                data: {
                    employeeId:       employee.id,
                    basic, da: daAmt, washing: wash, conveyance: conv,
                    leaveWithWages:   lww,
                    otherAllowance:   other,
                    otRatePerHour:    parseFloat(otRatePerHour || 170),
                    canteenRatePerDay: parseFloat(canteenRatePerDay || 55),
                    hra, bonus, ctcMonthly: ctcM, ctcAnnual: ctcM * 12,
                    complianceType:   cType,
                    status:           "APPROVED",
                    proposedBy:       session.user.id,
                    approvedBy:       session.user.id,
                },
            })
        }

        // ── Site deployment ───────────────────────────────────────────────────
        const targetSiteId = siteId || lead.siteId
        if (targetSiteId) {
            await prisma.deployment.create({
                data: {
                    employeeId: employee.id,
                    siteId:     targetSiteId,
                    startDate:  deployStartDate ? new Date(deployStartDate) : (dateOfJoining ? new Date(dateOfJoining) : new Date()),
                    isActive:   true,
                    ...(deployShift ? { shift: deployShift } : {}),
                    ...(deployRole  ? { role:  deployRole  } : {}),
                },
            })
        }

        // ── Mark lead as converted ────────────────────────────────────────────
        await prisma.lead.update({
            where: { id: params.id },
            data: {
                convertedEmployeeId: employee.id,
                status: "JOINED",
            },
        })

        await prisma.leadActivity.create({
            data: {
                leadId:  params.id,
                userId:  session.user.id,
                type:    "status_change",
                content: `Lead converted to Employee (${finalId}). Employee account created and activated.`,
            },
        })

        // ── Create Onboarding Record ──────────────────────────────────────────
        const existingOnboarding = await prisma.onboardingRecord.findUnique({ where: { employeeId: employee.id } })
        if (!existingOnboarding) {
            await prisma.onboardingRecord.create({
                data: {
                    employeeId: employee.id,
                    status: "IN_PROGRESS",
                    startedAt: new Date(),
                    tasks: {
                        create: [
                            { title: "Collect Aadhar Card",              category: "Documents",    order: 1,  status: "PENDING", isRequired: true, employeeId: employee.id },
                            { title: "Collect PAN Card",                 category: "Documents",    order: 2,  status: "PENDING", isRequired: true, employeeId: employee.id },
                            { title: "Collect Bank Details",             category: "Documents",    order: 3,  status: "PENDING", isRequired: true, employeeId: employee.id },
                            { title: "Collect Passport Photo",           category: "Documents",    order: 4,  status: "PENDING", isRequired: true, employeeId: employee.id },
                            { title: "Sign Offer Letter",                category: "Documents",    order: 5,  status: "PENDING", isRequired: true, employeeId: employee.id },
                            { title: "Issue ID Card",                    category: "Welcome Kit",  order: 6,  status: "PENDING", isRequired: true, employeeId: employee.id },
                            { title: "Safety Training",                  category: "Training",     order: 7,  status: "PENDING", isRequired: true, employeeId: employee.id },
                            { title: "Add to Attendance System",         category: "IT Setup",     order: 8,  status: "PENDING", isRequired: true, employeeId: employee.id },
                        ],
                    },
                },
            })
        }

        return NextResponse.json({
            success: true,
            employeeId: employee.id,
            employeeCode: finalId,
            onboardingToken,
        })
    } catch (err) {
        console.error("[LEAD_CONVERT]", err)
        return NextResponse.json({ error: (err as Error).message || "Conversion failed" }, { status: 500 })
    }
}
