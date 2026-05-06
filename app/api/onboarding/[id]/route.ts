import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

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
        if (!checkAccess(session, ["ADMIN", "MANAGER", "HR_MANAGER"], "onboarding.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { status, notes, assignedTo, action, rejectionReason } = body

        // Handle approve / reject actions
        const onboardingRecord = await prisma.onboardingRecord.findUnique({
            where: { id: params.id },
            select: { employeeId: true },
        })
        if (!onboardingRecord) return new NextResponse("Not found", { status: 404 })

        if (action === "approve") {
            await prisma.employee.update({
                where: { id: onboardingRecord.employeeId },
                data: { isKycVerified: true, kycRejectionNote: null, status: "ACTIVE" },
            })
            const record = await prisma.onboardingRecord.update({
                where: { id: params.id },
                data: { status: "COMPLETED", completedAt: new Date(), notes: notes || null },
            })
            return NextResponse.json(record)
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
