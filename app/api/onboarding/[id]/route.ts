import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { buildLoginEmail, defaultPassword } from "@/lib/credentials"
import bcrypt from "bcryptjs"

// Generate the next sequential EMP-NNNN code. Only considers real EMP- codes so
// temporary PENDING-xxxx placeholders (used while onboarding is unapproved)
// never affect the sequence.
async function generateEmployeeCode(): Promise<string> {
    const last = await prisma.employee.findFirst({
        where: { employeeId: { startsWith: "EMP-" } },
        orderBy: { employeeId: "desc" },
        select: { employeeId: true },
    })
    let nextNum = 1
    const match = last?.employeeId?.match(/\d+$/)
    if (match) nextNum = parseInt(match[0]) + 1
    // Guard against a collision (race) by bumping until free.
    for (let i = 0; i < 50; i++) {
        const code = `EMP-${String(nextNum + i).padStart(4, "0")}`
        const exists = await prisma.employee.findUnique({ where: { employeeId: code }, select: { id: true } })
        if (!exists) return code
    }
    return `EMP-${Date.now()}`
}

// Provision a login (User account) for an approved employee if they don't have
// one yet. Returns the credentials or null. Non-fatal on error.
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
            return { email: loginEmail, password: existingUser.plainPassword || "(unchanged)" }
        }
        const plain = defaultPassword({ phone: emp.phone })
        const hashed = await bcrypt.hash(plain, 10)
        const user = await prisma.user.create({
            data: {
                name: `${emp.firstName} ${emp.lastName || ""}`.trim(),
                email: loginEmail,
                password: hashed,
                plainPassword: plain,
                phone: emp.phone || null,
                role: "INSPECTION_BOY",
            },
        })
        await prisma.employee.update({ where: { id: emp.id }, data: { userId: user.id } })
        return { email: loginEmail, password: plain }
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
            // Approval is the moment a pending candidate becomes a real employee:
            //  1. Assign the real EMP-NNNN code (replaces the PENDING-xxxx placeholder).
            //  2. Flip status to ACTIVE so they show up in the Employee Master.
            //  3. Provision a login so they appear in Employee Logins.
            const currentCode = onboardingRecord.employee?.employeeId || ""
            const needsCode = !currentCode || currentCode.startsWith("PENDING-")
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
