import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { pendingTitles } from "@/lib/policy-signoff"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { buildLoginEmail, NO_PASSWORD } from "@/lib/credentials"
import { generateEmployeeCode } from "@/lib/employee-code"

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
        return NextResponse.json(record)
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
        if (!checkAccess(session, ["ADMIN", "MANAGER", "HR_MANAGER"], "onboarding.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { status, notes, assignedTo, action, rejectionReason } = body

        // Handle approve / reject actions
        const onboardingRecord = await prisma.onboardingRecord.findUnique({
            where: { id: params.id },
            select: { employeeId: true, employee: { select: { employeeId: true } } },
        })
        if (!onboardingRecord) return new NextResponse("Not found", { status: 404 })

        if (action === "approve") {
            // KYC has to actually be on file before someone becomes an employee.
            // The joining forms ask for these, but they upload the files after the
            // record is created, so a failed or skipped upload could still leave a
            // profile with no documents — and the onboarding checklist items
            // ("Collect Aadhar Card") are only text, they check nothing.
            // Every joining route now offers all four, so all four are required.
            const REQUIRED_DOCS = ["AADHAAR", "PAN", "PHOTO", "BANK_DETAILS"] as const
            const held = await prisma.employeeDocument.findMany({
                where: { employeeId: onboardingRecord.employeeId },
                select: { type: true },
            })
            // Types are stored inconsistently cased ("PHOTO" vs "Photo").
            const heldTypes = new Set(held.map(d => d.type.toUpperCase()))
            const missing = REQUIRED_DOCS.filter(t => !heldTypes.has(t))
            // Policies for the employee's designation that are still unsigned —
            // e.g. HR corrected the designation after the joiner submitted.
            const emp = await prisma.employee.findUnique({ where: { id: onboardingRecord.employeeId }, select: { designation: true } })
            const pendingPolicies = await pendingTitles(onboardingRecord.employeeId, emp?.designation)
            // `force` lets HR approve a record that predates this check, or one
            // whose documents were collected on paper, rather than being stuck.
            // Unsigned policies then stay pending on the employee's profile.
            if ((missing.length > 0 || pendingPolicies.length > 0) && !body.force) {
                const label: Record<string, string> = {
                    AADHAAR: "Aadhaar card", PAN: "PAN card", PHOTO: "Passport photo",
                    BANK_DETAILS: "Bank passbook / cancelled cheque",
                }
                const parts: string[] = []
                if (missing.length) parts.push(`not on file: ${missing.map(m => label[m]).join(", ")}`)
                if (pendingPolicies.length) parts.push(`policies not signed: ${pendingPolicies.join(", ")}`)
                return NextResponse.json({
                    error: missing.length ? "Missing documents" : "Policies not signed",
                    missing,
                    pendingPolicies,
                    canForce: true,
                    message: `Cannot approve — ${parts.join("; ")}.`,
                }, { status: 400 })
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
