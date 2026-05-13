import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

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
    if (!session || !checkAccess(session, ["MANAGER", "HR_MANAGER"], "payroll.view")) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    const body = await req.json()
    const {
        basic, da, washing, conveyance, leaveWithWages, otherAllowance,
        otRatePerHour, canteenRatePerDay, status,
        complianceType, hra: hraInput, bonus: bonusInput,
    } = body

    const isCALL = complianceType === "CALL"
    const hra = isCALL ? 0 : (Number(hraInput) || 0)
    const bonus = isCALL ? 0 : (Number(bonusInput) || 0)
    const grossFull = Number(basic) + Number(da) + hra + Number(washing) + Number(conveyance) +
        Number(leaveWithWages) + bonus + Number(otherAllowance)
    const empPF = isCALL ? 0 : Math.round(15000 * 0.13)
    const empESIC = (isCALL || grossFull > 21000) ? 0 : Math.ceil((grossFull - Number(washing) - bonus) * 0.0325)
    const ctcMonthly = grossFull + empPF + empESIC

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
            bonus,
            ctcMonthly,
            ctcAnnual: ctcMonthly * 12,
            status: status || "APPROVED",
            complianceType: complianceType === "CALL" ? "CALL" : "OR",
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
            bonus,
            ctcMonthly,
            ctcAnnual: ctcMonthly * 12,
            status: status || "APPROVED",
            complianceType: complianceType === "CALL" ? "CALL" : "OR",
        }
    })

    return NextResponse.json(sal)
}
