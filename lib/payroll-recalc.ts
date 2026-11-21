// Recalculate DRAFT payroll rows from the attendance they already hold.
//
// Each payroll row keeps the attendance it was worked out from (month days,
// days worked, OT days, canteen, penalty, advance, other deductions,
// incentive, LWF). After a change to Calculation Settings, a salary structure,
// an increment or the PF / pension / ESIC switches, the affected DRAFT rows
// are worked out again here — no need to re-upload attendance. Locked
// (PROCESSED / PAID) rows are never touched. Same engine and inputs as
// Process Payroll; TDS entered on a row and arrears already added are kept.
import prisma from "@/lib/prisma"
import { syncOtRatesToStructures } from "@/lib/payroll-ot-sync"
import { manualOtResolver } from "@/lib/payroll-manual-ot"
import { postedSites } from "@/lib/attendance-guard"
import { calcGrowusPayroll } from "@/lib/payroll-calc"
import { rulesForPeriod, otHoursOf } from "@/lib/payroll-rules"
import { getRulesResolver } from "@/lib/payroll-rules-server"
import { revisionsForMonth } from "@/lib/salary-revision"
import { statutoryResolver } from "@/lib/employee-statutory"

type YM = { month: number; year: number }
const key = (p: YM) => p.year * 12 + p.month

export type RecalcResult = { rows: number; months: string[]; otRates?: number }

/**
 * Recalculate DRAFT rows from `from` onward (only these employees, if given).
 * Never throws: the save that triggered it must not fail because of this.
 */
export async function recalcDraftPayroll(opts: { from: YM; employeeIds?: string[] }): Promise<RecalcResult> {
    // Salary Master OT rates follow the site OT rules first (never throws).
    const otRates = await syncOtRatesToStructures({ employeeIds: opts.employeeIds })
    const r = await recalcRows(opts)
    return otRates ? { ...r, otRates } : r
}

async function recalcRows(opts: { from: YM; employeeIds?: string[] }): Promise<RecalcResult> {
    try {
        const fromKey = key(opts.from)
        const rows = await prisma.payroll.findMany({
            where: {
                status: "DRAFT",
                OR: [{ year: { gt: opts.from.year } }, { year: opts.from.year, month: { gte: opts.from.month } }],
                ...(opts.employeeIds ? { employeeId: { in: opts.employeeIds } } : {}),
            },
            select: {
                id: true, employeeId: true, month: true, year: true, payrollRunId: true,
                workingDays: true, presentDays: true, otDays: true, canteenDays: true, canteenAmount: true,
                penalty: true, advance: true, otherDeductions: true, productionIncentive: true, lwf: true,
                tds: true, arrears: true, siteId: true,
                employee: { select: { gender: true, isHandicap: true, basicSalary: true, employeeSalary: true } },
            },
        })
        const due = rows.filter(r => key(r) >= fromKey)
        if (!due.length) return { rows: 0, months: [] }

        const ids = Array.from(new Set(due.map(r => r.employeeId)))
        const [rulesAt, statutoryAt, posted, manualOt] = await Promise.all([getRulesResolver(), statutoryResolver(ids), postedSites(ids), manualOtResolver()])
        const monthKeys = Array.from(new Set(due.map(r => `${r.year}-${r.month}`)))
        const inForce = new Map<string, Awaited<ReturnType<typeof revisionsForMonth>>>()
        for (const k of monthKeys) {
            const [y, m] = k.split("-").map(Number)
            inForce.set(k, await revisionsForMonth(ids, { month: m, year: y }))
        }

        const updates = due.map(row => {
            const p = { month: row.month, year: row.year }
            const rules = rulesForPeriod(rulesAt(p), row.month, row.year)
            // The structure in force that month; else the live row (as Process Payroll does).
            const sal: any = inForce.get(`${row.year}-${row.month}`)?.get(row.employeeId) ?? row.employee.employeeSalary
            const calc = calcGrowusPayroll({
                basic: sal?.basic ?? row.employee.basicSalary ?? 0, da: sal?.da ?? 0, hra: sal?.hra ?? 0,
                washing: sal?.washing ?? 0, conveyance: sal?.conveyance ?? 0, leaveWithWages: sal?.leaveWithWages ?? 0,
                otherAllowance: sal?.otherAllowance ?? 0, bonus: sal?.bonus ?? undefined,
                otRatePerHour: sal?.otRatePerHour ?? rules.defaults.otRatePerHour,
                canteenRatePerDay: sal?.canteenRatePerDay ?? rules.defaults.canteenRatePerDay,
                complianceType: sal?.complianceType ?? "OR", isHandicap: row.employee.isHandicap ?? false,
                siteId: row.siteId ?? posted.get(row.employeeId) ?? null,
                employeeId: row.employeeId,
                ...statutoryAt(row.employeeId, p),
            }, {
                monthDays: row.workingDays, workedDays: row.presentDays, otDays: row.otDays,
                canteenDays: row.canteenDays, canteenAmount: row.canteenAmount, penalty: row.penalty,
                advance: row.advance, otherDeductions: row.otherDeductions, productionIncentive: row.productionIncentive,
                lwf: row.lwf, gender: row.employee.gender ?? "Male", month: row.month,
                otAmount: manualOt(row.employeeId, p),
            }, rules)
            const tds = row.tds || 0, arrears = row.arrears || 0
            return prisma.payroll.update({
                where: { id: row.id },
                data: {
                    ...calc,
                    overtimeHrs: otHoursOf(rules.ot, row.otDays || 0),
                    lwpDays: Math.max(row.workingDays - row.presentDays, 0),
                    totalDeductions: calc.totalDeductions + tds,
                    netSalary: Math.round(calc.netSalary - tds + arrears),
                },
            })
        })
        // Status stays DRAFT; written in batches (one round trip each).
        for (let i = 0; i < updates.length; i += 200) await prisma.$transaction(updates.slice(i, i + 200))

        // Month totals on Payroll History follow the rows.
        const runIds = Array.from(new Set(due.map(r => r.payrollRunId).filter((x): x is string => !!x)))
        for (const runId of runIds) {
            const t = await prisma.payroll.aggregate({ where: { payrollRunId: runId }, _sum: { grossSalary: true, netSalary: true, pfEmployer: true, esiEmployer: true, lwf: true, tds: true } })
            await prisma.payrollRun.update({
                where: { id: runId },
                data: {
                    totalGross: t._sum.grossSalary ?? 0, totalNet: t._sum.netSalary ?? 0,
                    totalPfEmployer: t._sum.pfEmployer ?? 0, totalEsiEmployer: t._sum.esiEmployer ?? 0,
                    totalLwf: t._sum.lwf ?? 0, totalTds: t._sum.tds ?? 0,
                },
            }).catch(() => {})
        }
        const months = monthKeys.map(k => { const [y, m] = k.split("-"); return `${m}/${y}` })
        return { rows: due.length, months }
    } catch (e) {
        console.error("[PAYROLL_RECALC]", e)
        return { rows: 0, months: [] }
    }
}
