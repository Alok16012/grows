import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { buildLoginEmail, NO_PASSWORD } from "@/lib/credentials"
import { generateEmployeeCode } from "@/lib/employee-code"
import { approvalGate } from "@/lib/onboarding-checklist-server"

import { applyAutoRoleSafe } from "@/lib/auto-role-server"
import { accessFrom, maskEmployee, lockedFieldNames, auditLater } from "@/lib/access"

// Provision a login (User account) for an approved employee if they don't have
// one yet. No password is set — the employee signs in with an OTP to their
// mobile and sets an MPIN. Returns the login id or null. Non-fatal on error.
async function ensureLogin(employeeId: string) {
    const emp = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { id: true, userId: true, firstName: true, lastName: true, email: true, phone: true, employeeId: true },
    })
    if (!emp || emp.userId) return null
    try {
        const loginEmail = buildLoginEmail({ email: emp.email, phone: emp.phone, employeeId: emp.employeeId })
        const existingUser = await prisma.user.findUnique({
            where: { email: loginEmail },
            include: { employeeProfile: { select: { id: true } } },
        })
        if (existingUser) {
            if (!existingUser.employeeProfile) {
                await prisma.employee.update({ where: { id: emp.id }, data: { userId: existingUser.id } })
            }
            return { email: loginEmail }
        }
        const user = await prisma.user.create({
            data: {
                name: `${emp.firstName} ${emp.lastName || ""}`.trim(),
                email: loginEmail,
                password: NO_PASSWORD,
                plainPassword: null,
                phone: emp.phone || null,
                // Base role is vestigial — access comes from the custom role an admin assigns.
                role: "MANAGER",
            },
        })
        await prisma.employee.update({ where: { id: emp.id }, data: { userId: user.id } })
        return { email: loginEmail }
    } catch (err) {
        console.error("[ONBOARDING_APPROVE_LOGIN]", err)
        return null
    }
}

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["ADMIN", "MANAGER", "HR_MANAGER"], "onboarding.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const record = await prisma.onboardingRecord.findUnique({
            where: { id: params.id },
            include: {
                tasks: { orderBy: { order: "asc" } },
                employee: {
                    select: {
                        id: true, firstName: true, middleName: true, lastName: true,
                        employeeId: true, designation: true, dateOfJoining: true,
                        dateOfBirth: true, photo: true, gender: true,
                        phone: true, alternatePhone: true, email: true,
                        address: true, city: true, state: true, pincode: true,
                        permanentAddress: true, permanentCity: true, permanentState: true, permanentPincode: true,
                        nameAsPerAadhar: true, fathersName: true, bloodGroup: true,
                        maritalStatus: true, nationality: true, religion: true, caste: true,
                        emergencyContact1Name: true, emergencyContact1Phone: true,
                        emergencyContact2Name: true, emergencyContact2Phone: true,
                        employmentType: true, status: true, basicSalary: true,
                        department: { select: { name: true } },
                        deployments: { where: { isActive: true }, include: { site: { select: { name: true } } }, take: 1 },
                        isKycVerified: true, aadharNumber: true, panNumber: true,
                        uan: true, pfNumber: true, esiNumber: true, labourCardNo: true,
                        bankAccountNumber: true, bankIFSC: true, bankName: true, bankBranch: true,
                        kycRejectionNote: true,
                        safetyGoggles: true, safetyGloves: true, safetyHelmet: true,
                        safetyMask: true, safetyJacket: true, safetyEarMuffs: true, safetyShoes: true,
                        documents: true, employeeSalary: true,
                    },
                },
            },
        })

        if (!record) return new NextResponse("Not found", { status: 404 })
        // KYC review shows ID, bank and salary only to roles allowed to see them.
        const access = accessFrom(session)
        return NextResponse.json({
            ...record,
            employee: record.employee ? maskEmployee(record.employee, access) : record.employee,
            lockedFields: lockedFieldNames(access),
        })
    } catch (error) {
        console.error("[ONBOARDING_ID_GET]", error)
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
        if (!checkAccess(session, ["ADMIN", "MANAGER", "HR_MANAGER"], ["onboarding.edit", "onboarding.approve"])) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { status, notes, assignedTo, action, rejectionReason } = body
        // Approving / rejecting a joiner needs Onboarding → Approve; other changes need Edit.
        const deciding = action === "approve" || action === "reject"
        if (!checkAccess(session, [], deciding ? "onboarding.approve" : "onboarding.edit")) {
            return new NextResponse(deciding ? "You don't have the right to approve joiners" : "You don't have the right to edit onboarding", { status: 403 })
        }

        // Handle approve / reject actions
        const onboardingRecord = await prisma.onboardingRecord.findUnique({
            where: { id: params.id },
            select: { employeeId: true, employee: { select: { employeeId: true } } },
        })
        if (!onboardingRecord) return new NextResponse("Not found", { status: 404 })

        if (action === "approve") {
            // Joining checklist gate (Onboarding → Joining checklist settings): every
            // task marked "before approval" — by default the four KYC documents,
            // joining policies, a site posting and a salary structure — plus a
            // duplicate-KYC check and a sanity check on an old joining date.
            // `force` approves anyway when the settings allow it (approvers, admins
            // only, or nobody) — e.g. documents collected on paper.
            const gate = await approvalGate(onboardingRecord.employeeId)
            // Missing KYC documents are never bypassed unless the setting allows it.
            const docsBlock = gate.docMissing.length > 0 && !gate.docsBypass
            // Duplicate Aadhaar / PAN / mobile / email / bank / UAN: never approved anyway.
            if (gate.dupBlock) {
                return NextResponse.json({ error: "Duplicate employee", reasons: gate.reasons, canForce: false,
                    message: `Cannot approve — ${gate.reasons.join("; ")}. Duplicate details can't be approved: correct them, or use the existing employee (rejoin) instead.` }, { status: 409 })
            }
            if (gate.reasons.length && !body.force) {
                const isAdmin = (session.user as any)?.role === "ADMIN"
                const canForce = !docsBlock && (gate.override === "approvers" || (gate.override === "admins" && isAdmin))
                return NextResponse.json({
                    error: "Checks not passed",
                    reasons: gate.reasons,
                    canForce,
                    message: `Cannot approve yet — ${gate.reasons.join("; ")}.${canForce ? "" : docsBlock ? ` Documents are required: upload ${gate.docMissing.join(", ")} first.` : " Finish these first (approving anyway is switched off in the checklist settings)."}`,
                }, { status: 400 })
            }
            if (gate.reasons.length && body.force) {
                const isAdmin = (session.user as any)?.role === "ADMIN"
                if (docsBlock) return NextResponse.json({ error: "Documents missing", message: `Cannot approve without documents — upload ${gate.docMissing.join(", ")} first.` }, { status: 403 })
                if (gate.override === "none" || (gate.override === "admins" && !isAdmin)) return NextResponse.json({ error: "Approving with open checks is not allowed", message: "Approving with open checks is not allowed for you — finish the checklist first." }, { status: 403 })
                auditLater({ actorId: session.user.id, actorName: session.user.name ?? null, action: "onboarding.approve_override", targetType: "Employee", targetId: onboardingRecord.employeeId, targetName: onboardingRecord.employee?.employeeId ?? null, summary: `Approved with open checks: ${gate.reasons.join("; ")}` })
            }

            // Approval is the moment a pending candidate becomes a real employee:
            //  1. Assign the real EMP-NNNN code (replaces the PENDING-xxxx placeholder).
            //  2. Flip status to ACTIVE so they show up in the Employee Master.
            //  3. Provision a login so they appear in Employee Logins.
            const currentCode = onboardingRecord.employee?.employeeId || ""
            // Treat placeholder (PENDING-) and legacy self-registration (EXT-) codes
            // as "not a real code yet" so approval assigns a clean EMP-NNNN.
            const needsCode = !currentCode || currentCode.startsWith("PENDING-") || currentCode.startsWith("EXT-")
            const newCode = needsCode ? await generateEmployeeCode() : currentCode

            await prisma.employee.update({
                where: { id: onboardingRecord.employeeId },
                data: {
                    isKycVerified: true,
                    kycRejectionNote: null,
                    status: "ACTIVE",
                    ...(needsCode && { employeeId: newCode }),
                },
            })

            const _login = await ensureLogin(onboardingRecord.employeeId)
            // Login role from the designation (People → Masters → Login roles).
            await applyAutoRoleSafe(onboardingRecord.employeeId, { reason: "onboarding approved", actor: { id: session.user.id, name: session.user.name ?? null } })

            const record = await prisma.onboardingRecord.update({
                where: { id: params.id },
                data: { status: "COMPLETED", completedAt: new Date(), notes: notes || null },
            })
            return NextResponse.json({ ...record, _employeeCode: newCode, _login })
        }

        if (action === "reject") {
            await prisma.employee.update({
                where: { id: onboardingRecord.employeeId },
                data: { isKycVerified: false, kycRejectionNote: rejectionReason || "Rejected" },
            })
            const record = await prisma.onboardingRecord.update({
                where: { id: params.id },
                data: { status: "ON_HOLD", notes: rejectionReason || null },
            })
            return NextResponse.json(record)
        }

        // Generic update
        const record = await prisma.onboardingRecord.update({
            where: { id: params.id },
            data: {
                ...(status && { status }),
                ...(notes !== undefined && { notes }),
                ...(assignedTo !== undefined && { assignedTo }),
                ...(status === "COMPLETED" && { completedAt: new Date() }),
            },
        })

        return NextResponse.json(record)
    } catch (error) {
        console.error("[ONBOARDING_ID_PUT]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
