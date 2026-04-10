import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"

// ─── Growus Salary Formula (from Internal Calculation.xlsx) ───────────────────
export function calcGrowusPayroll(sal: {
    basic: number; da: number; washing: number; conveyance: number
    leaveWithWages: number; otherAllowance: number
    otRatePerHour: number; canteenRatePerDay: number
}, att: {
    monthDays: number; workedDays: number; otDays: number
    canteenDays: number; penalty: number; advance: number
    otherDeductions: number; productionIncentive: number; lwf: number
}) {
    const { basic, da, washing, conveyance, leaveWithWages, otherAllowance, otRatePerHour, canteenRatePerDay } = sal
    const { monthDays, workedDays, otDays, canteenDays, penalty, advance, otherDeductions, productionIncentive, lwf } = att

    // Full month components
    const hraFull = (basic + da) * 0.05
    const bonusFull = 7000 / 12

    const grossFullMonth = basic + da + hraFull + washing + conveyance + leaveWithWages + bonusFull + otherAllowance

    // Prorated earned (ROUND to 0 decimal)
    const r = (x: number) => Math.round(x / monthDays * workedDays)
    const basicEarned   = r(basic)
    const daEarned      = r(da)
    const hraEarned     = r(hraFull)
    const washingEarned = r(washing)
    const convEarned    = r(conveyance)
    const lwwEarned     = r(leaveWithWages)
    const bonusEarned   = r(bonusFull)
    const otherEarned   = r(otherAllowance)

    // OT pay: ROUND(170 × OT_DAYS × 4, 0)
    const otPay = Math.round(otRatePerHour * otDays * 4)

    const grossEarned = basicEarned + daEarned + hraEarned + washingEarned + convEarned +
        lwwEarned + bonusEarned + otherEarned + otPay + (productionIncentive || 0)

    // ─── Deductions ───────────────────────────────────────────────────────────
    // PF: IF(workedDays>26, 1800, ROUND(15000/26*workedDays*12%, 0))
    const pfEmployee = workedDays > 26
        ? 1800
        : Math.round((15000 / 26) * workedDays * 0.12)

    // ESIC: ROUNDUP((grossEarned - washingEarned - bonusEarned) * 0.75%, 0)
    const esiEmployee = Math.ceil((grossEarned - washingEarned - bonusEarned) * 0.0075)

    // PT slab (Maharashtra)
    const pt = grossEarned > 10000 ? 200 : (grossEarned > 7500 ? 175 : 0)

    // Canteen
    const canteen = canteenDays * canteenRatePerDay

    const totalDeductions = pfEmployee + esiEmployee + pt + (lwf || 0) + (otherDeductions || 0) + canteen + (penalty || 0) + (advance || 0)
    const netSalary = grossEarned - totalDeductions

    // ─── Employer Contributions ───────────────────────────────────────────────
    // Employer PF = 15000 * 13% = 1950 (fixed)
    const pfEmployer = Math.round(15000 * 0.13)

    // Employer ESIC: ROUNDUP((grossFullMonth - washing - bonusFull) * 3.25%, 0)
    const esiEmployer = Math.ceil((grossFullMonth - washing - bonusFull) * 0.0325)

    // CTC = fullGross + empPF + empESIC
    const ctc = grossFullMonth + pfEmployer + esiEmployer

    return {
        // Full month
        basicFull: basic, daFull: da, hraFull, washingFull: washing,
        conveyanceFull: conveyance, lwwFull: leaveWithWages, bonusFull,
        otherFull: otherAllowance, grossFullMonth,
        // Earned
        basicSalary: basicEarned, da: daEarned, hra: hraEarned,
        washing: washingEarned, conveyance: convEarned, lwwEarned,
        bonus: bonusEarned, allowances: otherEarned,
        otDays, overtimePay: otPay, productionIncentive: productionIncentive || 0,
        grossSalary: grossEarned,
        // Deductions
        pfEmployee, esiEmployee, pfEmployer, esiEmployer,
        pt, lwf: lwf || 0, canteenDays, canteen,
        penalty: penalty || 0, advance: advance || 0,
        otherDeductions: otherDeductions || 0,
        totalDeductions, netSalary, ctc,
    }
}

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
            include: { employeeSalary: true }
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
            }, att)

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
