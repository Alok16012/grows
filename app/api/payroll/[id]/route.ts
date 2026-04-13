import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const payroll = await prisma.payroll.findUnique({
            where: { id: params.id },
            include: {
                employee: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        employeeId: true,
                        designation: true,
                        photo: true,
                        basicSalary: true,
                        branch: { select: { name: true } },
                        department: { select: { name: true } },
                    },
                },
            },
        })

        if (!payroll) return new NextResponse("Not found", { status: 404 })
        return NextResponse.json(payroll)
    } catch (error) {
        console.error("[PAYROLL_GET_ID]", error)
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
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { allowances, tds, otherDeductions, overtimePay, remarks, status } = body

        const existing = await prisma.payroll.findUnique({ where: { id: params.id } })
        if (!existing) return new NextResponse("Not found", { status: 404 })

        const updateData: Record<string, unknown> = {}

        if (allowances !== undefined) updateData.allowances = allowances
        if (tds !== undefined) updateData.tds = tds
        if (otherDeductions !== undefined) updateData.otherDeductions = otherDeductions
        if (overtimePay !== undefined) updateData.overtimePay = overtimePay
        if (remarks !== undefined) updateData.remarks = remarks

        if (status !== undefined) {
            if (!["DRAFT", "PROCESSED", "PAID"].includes(status)) {
                return new NextResponse("Invalid status", { status: 400 })
            }
            updateData.status = status
            if (status === "PROCESSED") {
                updateData.processedAt = new Date()
                updateData.processedBy = session.user.id
            }
            if (status === "PAID") {
                updateData.paidAt = new Date()
                updateData.paidBy = session.user.id
            }
        }

        // Recalculate if financial fields changed
        const newAllowances = allowances !== undefined ? allowances : existing.allowances
        const newOvertimePay = overtimePay !== undefined ? overtimePay : existing.overtimePay
        const newTds = tds !== undefined ? tds : existing.tds
        const newOtherDeductions = otherDeductions !== undefined ? otherDeductions : existing.otherDeductions

        const grossSalary = existing.basicSalary + existing.hra + newAllowances + newOvertimePay
        const esiEmployee = grossSalary <= 21000 ? Math.round(grossSalary * 0.0075) : 0
        const esiEmployer = grossSalary <= 21000 ? Math.round(grossSalary * 0.0325) : 0
        const totalDeductions = existing.pfEmployee + esiEmployee + newTds + newOtherDeductions
        const netSalary = grossSalary - totalDeductions

        updateData.grossSalary = Math.round(grossSalary)
        updateData.esiEmployee = esiEmployee
        updateData.esiEmployer = esiEmployer
        updateData.totalDeductions = totalDeductions
        updateData.netSalary = Math.round(netSalary)

        const payroll = await prisma.payroll.update({
            where: { id: params.id },
            data: updateData,
            include: {
                employee: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        employeeId: true,
                        designation: true,
                        photo: true,
                        branch: { select: { name: true } },
                        department: { select: { name: true } },
                    },
                },
            },
        })

        return NextResponse.json(payroll)
    } catch (error) {
        console.error("[PAYROLL_PUT]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const existing = await prisma.payroll.findUnique({ where: { id: params.id } })
        if (!existing) return new NextResponse("Not found", { status: 404 })
        if (existing.status !== "DRAFT") {
            return new NextResponse("Only DRAFT payrolls can be deleted", { status: 400 })
        }

        await prisma.payroll.delete({ where: { id: params.id } })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[PAYROLL_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
