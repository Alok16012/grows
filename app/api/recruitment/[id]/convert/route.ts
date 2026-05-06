import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { Role } from "@prisma/client"
import bcrypt from "bcryptjs"
import crypto from "crypto"

// POST /api/recruitment/[id]/convert
// Converts a SELECTED/JOINED lead into a full Employee with salary + deployment
export async function POST(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== Role.ADMIN && session.user.role !== Role.MANAGER && session.user.role !== Role.HR_MANAGER)) {
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
            otRatePerHour, canteenRatePerDay, complianceType,
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

        // ── Generate Employee ID ───────────────────────────────────────────────
        const allEmpIds = await prisma.employee.findMany({ select: { employeeId: true } })
            .then(r => new Set(r.map(e => e.employeeId)))
        const lastEmployee = await prisma.employee.findFirst({
            orderBy: { createdAt: "desc" }, select: { employeeId: true }
        })
        let nextNum = 1
        if (lastEmployee?.employeeId) {
            const m = lastEmployee.employeeId.match(/\d+$/)
            if (m) nextNum = parseInt(m[0]) + 1
        }
        let finalId = `EMP-${String(nextNum).padStart(4, "0")}`
        while (allEmpIds.has(finalId)) {
            nextNum++
            finalId = `EMP-${String(nextNum).padStart(4, "0")}`
        }

        // ── Resolve name — form overrides lead ────────────────────────────────
        const nameParts = lead.candidateName.trim().split(/\s+/)
        const firstName = formFirstName?.trim() || nameParts[0]
        const lastName  = formLastName?.trim()  || nameParts.slice(1).join(" ") || ""

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
                    role: "INSPECTION_BOY",
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
                phone:         formPhone?.trim() || lead.phone,
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
                // Personal
                dateOfBirth:   dateOfBirth ? new Date(dateOfBirth) : null,
                aadharNumber:  aadharNumber  || null,
                panNumber:     panNumber     || null,
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
                bankIFSC:          bankIFSC          || null,
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
            },
        })

        // ── Salary structure ──────────────────────────────────────────────────
        const basic = parseFloat(basicSalary || 0)
        const daAmt = parseFloat(da || 0)
        if (basic > 0) {
            const hra    = (basic + daAmt) * 0.05
            const wash   = parseFloat(washing || 0)
            const conv   = parseFloat(conveyance || 0)
            const lww    = parseFloat(leaveWithWages || 0)
            const other  = parseFloat(otherAllowance || 0)
            const ctcM   = basic + daAmt + hra + wash + conv + lww + other
            const cType  = String(complianceType || "OR").toUpperCase() === "CALL" ? "CALL" : "OR"
            await prisma.employeeSalary.create({
                data: {
                    employeeId:       employee.id,
                    basic, da: daAmt, washing: wash, conveyance: conv,
                    leaveWithWages:   lww,
                    otherAllowance:   other,
                    otRatePerHour:    parseFloat(otRatePerHour || 170),
                    canteenRatePerDay: parseFloat(canteenRatePerDay || 55),
                    hra, ctcMonthly: ctcM, ctcAnnual: ctcM * 12,
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
