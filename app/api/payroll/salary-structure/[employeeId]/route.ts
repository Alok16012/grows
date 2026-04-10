import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(_req: Request, { params }: { params: { employeeId: string } }) {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })

    const sal = await prisma.employeeSalary.findUnique({
        where: { employeeId: params.employeeId }
    })
    return NextResponse.json(sal)
}

export async function POST(req: Request, { params }: { params: { employeeId: string } }) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    const body = await req.json()
    const {
        basic, da, washing, conveyance, leaveWithWages, otherAllowance,
        otRatePerHour, canteenRatePerDay, status
    } = body

    // Auto-calculate HRA for reference
    const hra = (Number(basic) + Number(da)) * 0.05
    const ctcMonthly = Number(basic) + Number(da) + hra + Number(washing) + Number(conveyance) +
        Number(leaveWithWages) + Number(otherAllowance) + (7000 / 12) +
        Math.round(15000 * 0.13) + Math.ceil(((Number(basic) + Number(da) + hra + Number(washing) + Number(conveyance) + Number(leaveWithWages) + Number(otherAllowance) + (7000 / 12)) - Number(washing) - (7000 / 12)) * 0.0325)

    const sal = await prisma.employeeSalary.upsert({
        where: { employeeId: params.employeeId },
        create: {
            employeeId: params.employeeId,
            basic: Number(basic) || 0,
            da: Number(da) || 0,
            washing: Number(washing) || 0,
            conveyance: Number(conveyance) || 0,
            leaveWithWages: Number(leaveWithWages) || 0,
            otherAllowance: Number(otherAllowance) || 0,
            otRatePerHour: Number(otRatePerHour) || 170,
            canteenRatePerDay: Number(canteenRatePerDay) || 55,
            hra,
            ctcMonthly,
            ctcAnnual: ctcMonthly * 12,
            status: status || "APPROVED",
            proposedBy: session.user.id,
            approvedBy: session.user.id,
        },
        update: {
            basic: Number(basic) || 0,
            da: Number(da) || 0,
            washing: Number(washing) || 0,
            conveyance: Number(conveyance) || 0,
            leaveWithWages: Number(leaveWithWages) || 0,
            otherAllowance: Number(otherAllowance) || 0,
            otRatePerHour: Number(otRatePerHour) || 170,
            canteenRatePerDay: Number(canteenRatePerDay) || 55,
            hra,
            ctcMonthly,
            ctcAnnual: ctcMonthly * 12,
            status: status || "APPROVED",
        }
    })

    return NextResponse.json(sal)
}
