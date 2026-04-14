import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { calcGrowusPayroll } from "@/lib/payroll-calc"

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session || (session.user.role !== Role.ADMIN && session.user.role !== Role.MANAGER)) {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        const body = await req.json()
        const { month, year, branchId, attendance } = body
        // attendance: Array<{ employeeId, monthDays, workedDays, otDays, canteenDays,
        //                      penalty, advance, otherDeductions, productionIncentive, lwf }>

        if (!month || !year) return new NextResponse("Month and Year required", { status: 400 })

        // Get or create payroll run
        let run = await prisma.payrollRun.findUnique({ where: { month_year: { month, year } } })
        if (run && run.status !== "DRAFT") {
            return new NextResponse(`Payroll ${month}/${year} is ${run.status} — cannot recalculate.`, { status: 400 })
        }
        if (!run) {
            run = await prisma.payrollRun.create({
                data: { month, year, processedBy: session.user.id, status: "DRAFT" }
            })
        }

        const whereClause: Record<string, unknown> = { status: "ACTIVE" }
        if (branchId) whereClause.branchId = branchId

        const employees = await prisma.employee.findMany({
            where: whereClause,
            include: { employeeSalary: true },
        })

        if (!employees.length) return new NextResponse("No active employees found", { status: 404 })

        const defaultMonthDays = new Date(year, month, 0).getDate()
        let totalGross = 0, totalNet = 0, totalPfE = 0, totalEsiE = 0

        const upserts = employees.map(async emp => {
            const sal = emp.employeeSalary
            if (!sal || sal.status !== "APPROVED") return null

            const attInput = (attendance as any[])?.find((a: any) => a.employeeId === emp.id) ?? {}
            const att = {
                monthDays:           attInput.monthDays          ?? defaultMonthDays,
                workedDays:          attInput.workedDays         ?? defaultMonthDays,
                otDays:              Number(attInput.otDays)     || 0,
                canteenDays:         Number(attInput.canteenDays)|| 0,
                penalty:             Number(attInput.penalty)    || 0,
                advance:             Number(attInput.advance)    || 0,
                otherDeductions:     Number(attInput.otherDeductions) || 0,
                productionIncentive: Number(attInput.productionIncentive) || 0,
                lwf:                 Number(attInput.lwf)        || 0,
            }

            const calc = calcGrowusPayroll({
                basic: sal.basic, da: sal.da, washing: sal.washing,
                conveyance: sal.conveyance, leaveWithWages: sal.leaveWithWages,
                otherAllowance: sal.otherAllowance, otRatePerHour: sal.otRatePerHour,
                canteenRatePerDay: sal.canteenRatePerDay,
                complianceType: sal.complianceType ?? "OR",
            }, {
                ...att,
                gender: emp.gender ?? "Male",
            })

            totalGross += calc.grossSalary
            totalNet   += calc.netSalary
            totalPfE   += calc.pfEmployer
            totalEsiE  += calc.esiEmployer

            return prisma.payroll.upsert({
                where: { employeeId_month_year: { employeeId: emp.id, month, year } },
                create: {
                    employeeId: emp.id, payrollRunId: run.id, month, year,
                    ...calc,
                    workingDays: att.monthDays, presentDays: att.workedDays,
                    lwpDays: att.monthDays - att.workedDays,
                    overtimeHrs: att.otDays * 4,
                    status: "DRAFT", processedBy: session.user.id,
                },
                update: {
                    payrollRunId: run.id,
                    ...calc,
                    workingDays: att.monthDays, presentDays: att.workedDays,
                    lwpDays: att.monthDays - att.workedDays,
                    overtimeHrs: att.otDays * 4,
                    processedBy: session.user.id,
                }
            })
        })

        const results = await Promise.all(upserts)
        const processedCount = results.filter(Boolean).length

        await prisma.payrollRun.update({
            where: { id: run.id },
            data: { totalGross, totalNet, totalPfEmployer: totalPfE, totalEsiEmployer: totalEsiE }
        })

        return NextResponse.json({ success: true, processedCount, runId: run.id })
    } catch (error) {
        console.error("[PAYROLL_CALCULATE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
