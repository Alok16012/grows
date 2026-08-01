import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { findEmployeeDuplicates, duplicateMessage } from "@/lib/employee-dedupe"
import { deleteEmployeesAndLogins } from "@/lib/employee-delete"
import { pickPhotoUrl } from "@/lib/employee-photo"
import {
    collectErrors, validationResponse,
    validatePhone, validateEmail, validateAadhaar, validatePAN,
    validateIFSC, validateBankAccount, validatePincode, validateUAN,
    validateESIC, validatePFNumber, validateDateOfBirth, validateAmount,
    normalizePhone, normalizeUpper, digitsOnly,
} from "@/lib/validation"

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        const canViewEmployee = checkAccess(session, ["MANAGER", "HR_MANAGER"], "employees.view")
        const canViewViaRecruitment = checkAccess(session, [], "recruitment.manage") || checkAccess(session, [], "recruitment.view")
        if (!canViewEmployee && !canViewViaRecruitment) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const employee = await prisma.employee.findUnique({
            where: { id: params.id },
            include: {
                branch: true,
                department: true,
                documents: true,
                deployments: { include: { site: true }, orderBy: { createdAt: "desc" } },
                attendances: { orderBy: { date: "desc" }, take: 30 },
                leaves: { orderBy: { createdAt: "desc" } },
                payrolls: { orderBy: [{ year: "desc" }, { month: "desc" }] },
                assets: { include: { asset: true } },
                user: { select: { id: true, role: true, customRoleId: true, email: true, customRole: { select: { id: true, name: true, color: true } } } },
            },
        })

        if (!employee) return new NextResponse("Not Found", { status: 404 })

        // Backfill profile photo from an uploaded Photo document if the
        // `photo` column is empty (onboarding photos come in as "Photo", HR
        // uploads as "PHOTO" — pickPhotoUrl matches both, plus passport-style
        // filenames).
        if (!employee.photo && Array.isArray(employee.documents)) {
            const url = pickPhotoUrl(employee.documents as any)
            if (url) (employee as any).photo = url
        }

        return NextResponse.json(employee)
    } catch (error) {
        console.error("[EMPLOYEE_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function PUT(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        // Editable by HR/employee managers, OR by recruiters managing a joined
        // candidate (they reach this via Recruitment → Joined → employee).
        const canEditEmployee = checkAccess(session, ["MANAGER", "HR_MANAGER"], "employees.view")
        const canEditViaRecruitment = checkAccess(session, [], "recruitment.manage")
        if (!canEditEmployee && !canEditViaRecruitment) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const {
            firstName, lastName, email, phone, alternatePhone,
            dateOfBirth, gender, address, city, state, pincode,
            aadharNumber, panNumber, bankAccountNumber, bankIFSC, bankName,
            photo, designation, departmentId, branchId,
            dateOfJoining, dateOfLeaving, status, employmentType, basicSalary, notes,
            // New fields
            middleName, nameAsPerAadhar, fathersName, bloodGroup, maritalStatus, marriageDate, nationality, religion, caste,
            uan, pfNumber, esiNumber, labourCardNo, labourCardExpDate,
            contractFrom, contractPeriodDays, contractorCode, workOrderNumber, workOrderFrom, workOrderTo, workSkill, natureOfWork, categoryCode, employmentTypeCode,
            emergencyContact1Name, emergencyContact1Phone, emergencyContact2Name, emergencyContact2Phone,
            permanentAddress, permanentCity, permanentState, permanentPincode,
            isBackgroundChecked, backgroundCheckRemark, isMedicalDone, medicalRemark,
            safetyGoggles, safetyGogglesDate, safetyGloves, safetyGlovesDate,
            safetyHelmet, safetyHelmetDate, safetyMask, safetyMaskDate,
            safetyJacket, safetyJacketDate, safetyEarMuffs, safetyEarMuffsDate,
            safetyShoes, safetyShoesDate, bankBranch,
            systemRole, customRoleId,
        } = body

        // Format checks before anything is written. This is a partial update, so
        // only the keys actually present are checked; an empty value is still
        // valid (clearing an optional field must keep working).
        const errors = collectErrors({
            email: validateEmail(email),
            phone: validatePhone(phone),
            alternatePhone: validatePhone(alternatePhone),
            dateOfBirth: validateDateOfBirth(dateOfBirth),
            pincode: validatePincode(pincode),
            permanentPincode: validatePincode(permanentPincode),
            aadharNumber: validateAadhaar(aadharNumber),
            panNumber: validatePAN(panNumber),
            bankAccountNumber: validateBankAccount(bankAccountNumber),
            bankIFSC: validateIFSC(bankIFSC),
            uan: validateUAN(uan),
            pfNumber: validatePFNumber(pfNumber),
            esiNumber: validateESIC(esiNumber),
            emergencyContact1Phone: validatePhone(emergencyContact1Phone),
            emergencyContact2Phone: validatePhone(emergencyContact2Phone),
            basicSalary: validateAmount(basicSalary, "Basic salary"),
        })
        // Callers (EmployeeModal, employee list) read this body with res.text().
        if (errors) return new NextResponse(validationResponse(errors).message, { status: 400 })

        // Block edits that would collide with ANOTHER employee's Aadhaar / PAN /
        // mobile / email / bank account (self is excluded). Only check fields present.
        if (aadharNumber !== undefined || panNumber !== undefined || phone !== undefined || email !== undefined || bankAccountNumber !== undefined) {
            const conflicts = await findEmployeeDuplicates({ aadharNumber, panNumber, phone, email, bankAccountNumber }, params.id)
            if (conflicts.length > 0) {
                return NextResponse.json({ error: duplicateMessage(conflicts), conflicts }, { status: 409 })
            }
        }

        const updateData: Record<string, unknown> = {}
        if (firstName !== undefined) updateData.firstName = firstName
        if (lastName !== undefined) updateData.lastName = lastName
        if (email !== undefined) updateData.email = email
        // Phone / PAN / IFSC / Aadhaar are normalised on write so the same value
        // typed two ways doesn't end up stored two ways.
        if (phone !== undefined) updateData.phone = phone ? normalizePhone(phone) : phone
        if (alternatePhone !== undefined) updateData.alternatePhone = alternatePhone ? normalizePhone(alternatePhone) : alternatePhone
        if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null
        if (gender !== undefined) updateData.gender = gender
        if (address !== undefined) updateData.address = address
        if (city !== undefined) updateData.city = city
        if (state !== undefined) updateData.state = state
        if (pincode !== undefined) updateData.pincode = pincode
        if (aadharNumber !== undefined) updateData.aadharNumber = aadharNumber ? digitsOnly(aadharNumber) : aadharNumber
        if (panNumber !== undefined) updateData.panNumber = panNumber ? normalizeUpper(panNumber) : panNumber
        if (bankAccountNumber !== undefined) updateData.bankAccountNumber = bankAccountNumber
        if (bankIFSC !== undefined) updateData.bankIFSC = bankIFSC ? normalizeUpper(bankIFSC) : bankIFSC
        if (bankName !== undefined) updateData.bankName = bankName
        if (photo !== undefined) updateData.photo = photo
        if (designation !== undefined) updateData.designation = designation
        if (departmentId !== undefined) updateData.departmentId = departmentId || null
        if (branchId !== undefined) updateData.branchId = branchId || null
        if (dateOfJoining !== undefined) updateData.dateOfJoining = dateOfJoining ? new Date(dateOfJoining) : null
        if (dateOfLeaving !== undefined) updateData.dateOfLeaving = dateOfLeaving ? new Date(dateOfLeaving) : null
        if (status !== undefined) updateData.status = status
        if (employmentType !== undefined) updateData.employmentType = employmentType
        if (basicSalary !== undefined) {
            // Guard against NaN/Infinity — Prisma rejects them on a numeric column.
            const n = typeof basicSalary === "number" ? basicSalary : parseFloat(basicSalary)
            updateData.basicSalary = Number.isFinite(n) ? n : 0
        }
        if (notes !== undefined) updateData.notes = notes
        // New fields
        if (middleName !== undefined) updateData.middleName = middleName || null
        if (nameAsPerAadhar !== undefined) updateData.nameAsPerAadhar = nameAsPerAadhar || null
        if (fathersName !== undefined) updateData.fathersName = fathersName || null
        if (bloodGroup !== undefined) updateData.bloodGroup = bloodGroup || null
        if (maritalStatus !== undefined) updateData.maritalStatus = maritalStatus || null
        if (marriageDate !== undefined) updateData.marriageDate = marriageDate ? new Date(marriageDate) : null
        if (nationality !== undefined) updateData.nationality = nationality || null
        if (religion !== undefined) updateData.religion = religion || null
        if (caste !== undefined) updateData.caste = caste || null
        if (uan !== undefined) updateData.uan = uan || null
        if (pfNumber !== undefined) updateData.pfNumber = pfNumber || null
        if (esiNumber !== undefined) updateData.esiNumber = esiNumber || null
        if (labourCardNo !== undefined) updateData.labourCardNo = labourCardNo || null
        if (labourCardExpDate !== undefined) updateData.labourCardExpDate = labourCardExpDate ? new Date(labourCardExpDate) : null
        if (contractFrom !== undefined) updateData.contractFrom = contractFrom ? new Date(contractFrom) : null
        if (contractPeriodDays !== undefined) {
            const d = parseInt(String(contractPeriodDays), 10)
            updateData.contractPeriodDays = Number.isFinite(d) ? d : null
        }
        if (contractorCode !== undefined) updateData.contractorCode = contractorCode || null
        if (workOrderNumber !== undefined) updateData.workOrderNumber = workOrderNumber || null
        if (workOrderFrom !== undefined) updateData.workOrderFrom = workOrderFrom ? new Date(workOrderFrom) : null
        if (workOrderTo !== undefined) updateData.workOrderTo = workOrderTo ? new Date(workOrderTo) : null
        if (workSkill !== undefined) updateData.workSkill = workSkill || null
        if (natureOfWork !== undefined) updateData.natureOfWork = natureOfWork || null
        if (categoryCode !== undefined) updateData.categoryCode = categoryCode || null
        if (employmentTypeCode !== undefined) updateData.employmentTypeCode = employmentTypeCode || null
        if (emergencyContact1Name !== undefined) updateData.emergencyContact1Name = emergencyContact1Name || null
        if (emergencyContact1Phone !== undefined) updateData.emergencyContact1Phone = emergencyContact1Phone || null
        if (emergencyContact2Name !== undefined) updateData.emergencyContact2Name = emergencyContact2Name || null
        if (emergencyContact2Phone !== undefined) updateData.emergencyContact2Phone = emergencyContact2Phone || null
        if (permanentAddress !== undefined) updateData.permanentAddress = permanentAddress || null
        if (permanentCity !== undefined) updateData.permanentCity = permanentCity || null
        if (permanentState !== undefined) updateData.permanentState = permanentState || null
        if (permanentPincode !== undefined) updateData.permanentPincode = permanentPincode || null
        if (isBackgroundChecked !== undefined) updateData.isBackgroundChecked = isBackgroundChecked ?? false
        if (backgroundCheckRemark !== undefined) updateData.backgroundCheckRemark = backgroundCheckRemark || null
        if (isMedicalDone !== undefined) updateData.isMedicalDone = isMedicalDone ?? false
        if (medicalRemark !== undefined) updateData.medicalRemark = medicalRemark || null
        if (safetyGoggles !== undefined) updateData.safetyGoggles = safetyGoggles ?? false
        if (safetyGogglesDate !== undefined) updateData.safetyGogglesDate = safetyGogglesDate ? new Date(safetyGogglesDate) : null
        if (safetyGloves !== undefined) updateData.safetyGloves = safetyGloves ?? false
        if (safetyGlovesDate !== undefined) updateData.safetyGlovesDate = safetyGlovesDate ? new Date(safetyGlovesDate) : null
        if (safetyHelmet !== undefined) updateData.safetyHelmet = safetyHelmet ?? false
        if (safetyHelmetDate !== undefined) updateData.safetyHelmetDate = safetyHelmetDate ? new Date(safetyHelmetDate) : null
        if (safetyMask !== undefined) updateData.safetyMask = safetyMask ?? false
        if (safetyMaskDate !== undefined) updateData.safetyMaskDate = safetyMaskDate ? new Date(safetyMaskDate) : null
        if (safetyJacket !== undefined) updateData.safetyJacket = safetyJacket ?? false
        if (safetyJacketDate !== undefined) updateData.safetyJacketDate = safetyJacketDate ? new Date(safetyJacketDate) : null
        if (safetyEarMuffs !== undefined) updateData.safetyEarMuffs = safetyEarMuffs ?? false
        if (safetyEarMuffsDate !== undefined) updateData.safetyEarMuffsDate = safetyEarMuffsDate ? new Date(safetyEarMuffsDate) : null
        if (safetyShoes !== undefined) updateData.safetyShoes = safetyShoes ?? false
        if (safetyShoesDate !== undefined) updateData.safetyShoesDate = safetyShoesDate ? new Date(safetyShoesDate) : null
        if (bankBranch !== undefined) updateData.bankBranch = bankBranch || null

        const employee = await prisma.employee.update({
            where: { id: params.id },
            data: updateData,
        })

        // Update linked User account (role + email + login-access sync)
        const VALID_ROLES = ["ADMIN", "MANAGER", "HR_MANAGER", "INSPECTION_BOY"]
        if (systemRole || customRoleId !== undefined || email !== undefined || status !== undefined) {
            const empWithUser = await prisma.employee.findUnique({
                where: { id: params.id },
                select: { userId: true },
            })
            if (empWithUser?.userId) {
                const userUpdate: Record<string, unknown> = {}
                if (systemRole && VALID_ROLES.includes(systemRole)) userUpdate.role = systemRole
                if (customRoleId !== undefined) userUpdate.customRoleId = customRoleId || null
                // Sync login email when employee email is updated
                if (email && email.trim() && !email.includes("@cims.local")) {
                    userUpdate.email = email.trim()
                }
                // Employees who have left lose login access; restoring them to
                // ACTIVE / ON_LEAVE restores it. RESIGNED counts as left — it was
                // missing here, so resigned staff kept a working login.
                if (status !== undefined) {
                    userUpdate.isActive = !(status === "TERMINATED" || status === "INACTIVE" || status === "RESIGNED")
                }
                if (Object.keys(userUpdate).length > 0) {
                    await prisma.user.update({ where: { id: empWithUser.userId }, data: userUpdate })
                }
            }
        }

        return NextResponse.json(employee)
    } catch (error) {
        console.error("[EMPLOYEE_PUT]", error)
        // Surface the real reason — a bare "Internal Error" gives the user
        // nothing to act on when a save fails.
        return NextResponse.json(
            { error: "Failed to save employee", details: error instanceof Error ? error.message : String(error) },
            { status: 500 },
        )
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        
        // Use a more inclusive check for deletion permissions
        if (!checkAccess(session, ["ADMIN", "MANAGER", "HR_MANAGER"], "employees.delete")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const employee = await prisma.employee.findUnique({
            where: { id: params.id },
            select: { id: true, userId: true },
        })

        if (!employee) return new NextResponse("Not Found", { status: 404 })

        // Hard delete the employee along with every dependent record and the
        // linked login. See lib/employee-delete for why we purge dependents
        // explicitly instead of trusting DB cascade rules.
        const { deleted, loginsRemoved } = await deleteEmployeesAndLogins([params.id])

        if (deleted === 0) {
            return NextResponse.json(
                { error: "Employee could not be deleted" },
                { status: 500 },
            )
        }

        const loginRemoved = !employee.userId || loginsRemoved > 0
        return NextResponse.json({
            success: true,
            loginRemoved,
            message: employee.userId
                ? (loginRemoved
                    ? "Employee, login account and all associated records deleted successfully"
                    : "Employee deleted, but the login account could not be fully removed")
                : "Employee and all associated records deleted successfully",
        })
    } catch (error) {
        console.error("[EMPLOYEE_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

