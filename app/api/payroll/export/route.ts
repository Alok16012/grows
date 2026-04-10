import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const month = parseInt(searchParams.get("month") ?? "")
    const year  = parseInt(searchParams.get("year")  ?? "")

    if (!month || !year) return new NextResponse("month and year required", { status: 400 })

    const payrolls = await prisma.payroll.findMany({
        where: { month, year },
        include: {
            employee: {
                select: {
                    employeeId: true, firstName: true, lastName: true,
                    designation: true,
                    branch: { select: { name: true } }
                }
            }
        },
        orderBy: { employee: { firstName: "asc" } }
    })

    // Build rows in Growus Excel column order
    const rows = payrolls.map((p, i) => ({
        SR: i + 1,
        EMPCODE: p.employee.employeeId,
        NAME: `${p.employee.firstName} ${p.employee.lastName}`,
        "MONTH DAYS": p.workingDays,
        LOP: p.workingDays - p.presentDays,
        DAYS: p.presentDays,
        "OT DAYS": p.otDays,
        "OT HRS (Calc)": p.otDays * 4,
        // Full month
        "BASIC (Full)": p.basicFull,
        "DA (Full)": p.daFull,
        "HRA (Full)": Math.round(p.hraFull),
        "WASHING (Full)": p.washingFull,
        "CONVEYANCE (Full)": p.conveyanceFull,
        "LWW (Full)": p.lwwFull,
        "BONUS (Full)": Math.round(p.bonusFull),
        "GROSS (Full Month)": Math.round(p.grossFullMonth),
        // Earned
        "BASIC (Earned)": p.basicSalary,
        "DA (Earned)": p.da,
        "HRA (Earned)": p.hra,
        "WASHING (Earned)": p.washing,
        "CONVEYANCE (Earned)": p.conveyance,
        "BONUS (Earned)": p.bonus,
        "OT PAY": p.overtimePay,
        "PROD INCENTIVE": p.productionIncentive,
        "GROSS (Earned)": p.grossSalary,
        // Deductions
        PF: p.pfEmployee,
        ESIC: p.esiEmployee,
        PT: p.pt,
        LWF: p.lwf,
        "CANTEEN DAYS": p.canteenDays,
        CANTEEN: p.canteen,
        PENALTY: p.penalty,
        ADVANCE: p.advance,
        "OTHER DEDUCTIONS": p.otherDeductions,
        NET: p.netSalary,
        // Employer
        "CO CONTRI PF": p.pfEmployer,
        "CO CONTRI ESIC": p.esiEmployer,
        CTC: Math.round(p.ctc),
        DESIGNATION: p.employee.designation ?? "",
        BRANCH: p.employee.branch.name,
    }))

    return NextResponse.json(rows)
}
