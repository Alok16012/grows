import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        const body = await req.json()
        const { type, employeeId, documentId, status, rejectionReason, salaryData } = body

        if (!type || !employeeId) {
            return new NextResponse("Missing type or employeeId", { status: 400 })
        }

        const employee = await prisma.employee.findUnique({ where: { id: employeeId } })
        if (!employee) return new NextResponse("Employee not found", { status: 404 })

        switch (type) {
            case "KYC":
                // Overall KYC / General Info Verification
                if (status === "REJECTED" && !rejectionReason) {
                    return new NextResponse("Rejection reason required", { status: 400 })
                }
                const updatedKyc = await prisma.employee.update({
                    where: { id: employeeId },
                    data: {
                        isKycVerified: status === "VERIFIED",
                        kycRejectionNote: status === "REJECTED" ? rejectionReason : null
                    }
                })
                return NextResponse.json({ success: true, employee: updatedKyc })

            case "DOCUMENT":
                // Verify individual Document
                if (!documentId || !status) return new NextResponse("documentId and status required", { status: 400 })
                if (status === "REJECTED" && !rejectionReason) return new NextResponse("Rejection reason required", { status: 400 })
                
                const updatedDoc = await prisma.employeeDocument.update({
                    where: { id: documentId },
                    data: {
                        status: status, // VERIFIED or REJECTED
                        rejectionReason: status === "REJECTED" ? rejectionReason : null,
                        verifiedBy: session.user.id
                    }
                })
                return NextResponse.json({ success: true, document: updatedDoc })

            case "SALARY":
                // Create or Update Employee Salary CTC
                if (!salaryData || !salaryData.ctcAnnual) return new NextResponse("Invalid salary data", { status: 400 })
                
                const upsertedSalary = await prisma.employeeSalary.upsert({
                    where: { employeeId: employeeId },
                    create: {
                        employeeId: employeeId,
                        ctcAnnual: parseFloat(salaryData.ctcAnnual),
                        ctcMonthly: parseFloat(salaryData.ctcAnnual) / 12,
                        basic: parseFloat(salaryData.basic || 0),
                        hra: parseFloat(salaryData.hra || 0),
                        specialAllowance: parseFloat(salaryData.specialAllowance || 0),
                        status: "APPROVED",
                        proposedBy: session.user.id,
                        approvedBy: session.user.id,
                    },
                    update: {
                        ctcAnnual: parseFloat(salaryData.ctcAnnual),
                        ctcMonthly: parseFloat(salaryData.ctcAnnual) / 12,
                        basic: parseFloat(salaryData.basic || 0),
                        hra: parseFloat(salaryData.hra || 0),
                        specialAllowance: parseFloat(salaryData.specialAllowance || 0),
                        status: "APPROVED",
                        approvedBy: session.user.id,
                    }
                })
                return NextResponse.json({ success: true, salary: upsertedSalary })

            case "ACTIVATE":
                // Finalize Employee
                const finalEmployee = await prisma.employee.update({
                    where: { id: employeeId },
                    data: {
                        status: "ACTIVE",
                        dateOfJoining: new Date(),
                    }
                })

                // Auto-complete OnboardingRecord too
                await prisma.onboardingRecord.update({
                    where: { employeeId: employeeId },
                    data: {
                        status: "COMPLETED",
                        completedAt: new Date()
                    }
                })

                return NextResponse.json({ success: true, employee: finalEmployee })

            default:
                return new NextResponse("Invalid action type", { status: 400 })
        }
    } catch (error) {
        console.error("[ONBOARDING_VERIFY_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
