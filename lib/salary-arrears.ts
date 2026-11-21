import prisma from "@/lib/prisma"
import { manualOtResolver } from "@/lib/payroll-manual-ot"
import { calcGrowusPayroll } from "@/lib/payroll-calc"
import { rulesForPeriod } from "@/lib/payroll-rules"
import { getRulesResolver } from "@/lib/payroll-rules-server"
import { revisionsForMonth, monthKey } from "@/lib/salary-revision"
import { statutoryResolver } from "@/lib/employee-statutory"
import { isMissingTableErr } from "@/lib/asset-workflow"

// Effective dating for salary: a revision applies from its month; finalized
// months keep their payslip as issued. When a revision is saved for a month
// that is already locked or paid, the month is worked out again with the
// salary now in force — same attendance, same deductions, same rules — and
// the difference is filed as a PENDING arrear for HR to review. Approved
// arrears are paid with the next payroll processed (calculate route).

const FINAL: ("PROCESSED" | "PAID")[] = ["PROCESSED", "PAID"]
const r2 = (n: number) => Math.round(n * 100) / 100
type Snap = { month: number; year: number }

/**
 * Re-checks every finalized month from `from` onward for these employees and
 * files / refreshes PENDING arrears — a handful of queries however many
 * people. Never throws (logs instead): saving a salary must not fail because
 * of this. Returns how many arrears are now pending from this check.
 */
export async function refreshArrears(employeeIds: string[], from: Snap, createdBy: string | null): Promise<number> {
    try {
        const ids = Array.from(new Set(employeeIds.filter(Boolean)))
        if (!ids.length) return 0
        const fromKey = monthKey(from.year, from.month)
        const rows = await prisma.payroll.findMany({
            where: { employeeId: { in: ids }, status: { in: FINAL } },
            select: {
                id: true, employeeId: true, month: true, year: true,
                basicFull: true, daFull: true, hraFull: true, washingFull: true, conveyanceFull: true, lwwFull: true, bonusFull: true, otherFull: true,
                grossSalary: true, netSalary: true, pfEmployee: true, esiEmployee: true, pt: true, arrears: true,
                workingDays: true, presentDays: true, otDays: true, canteenDays: true, canteenAmount: true,
                penalty: true, advance: true, otherDeductions: true, productionIncentive: true, lwf: true,
                siteId: true,
                employee: { select: { gender: true, isHandicap: true, basicSalary: true, employeeSalary: true } },
            },
        })
        const due = rows.filter(r => monthKey(r.year, r.month) >= fromKey)
        if (!due.length) return 0

        const rulesAt = await getRulesResolver()
        const statutoryAt = await statutoryResolver(ids)
        // The structure in force for each month now — one query per month.
        const inForce = new Map<string, Awaited<ReturnType<typeof revisionsForMonth>>>()
        for (const k of Array.from(new Set(due.map(r => `${r.year}-${r.month}`)))) {
            const [y, m] = k.split("-").map(Number)
            inForce.set(k, await revisionsForMonth(ids, { month: m, year: y }))
        }
        // Already settled per month (approved / paid earlier) — one query.
        const settledRows = await prisma.salaryArrear.groupBy({
            by: ["employeeId", "forYear", "forMonth"],
            where: { employeeId: { in: ids }, status: { in: ["APPROVED", "PAID"] } },
            _sum: { amount: true },
        })
        const key = (e: string, y: number, m: number) => `${e}|${y}|${m}`
        const settledBy = new Map(settledRows.map(x => [key(x.employeeId, x.forYear, x.forMonth), x._sum.amount ?? 0]))

        const manualOt = await manualOtResolver()
        const toCreate: any[] = []
        for (const row of due) {
            const sal: any = inForce.get(`${row.year}-${row.month}`)?.get(row.employeeId) ?? row.employee.employeeSalary
            if (!sal) continue
            const rules = rulesForPeriod(rulesAt({ month: row.month, year: row.year }), row.month, row.year)
            const calc = calcGrowusPayroll({
                basic: sal.basic ?? row.employee.basicSalary ?? 0, da: sal.da ?? 0, hra: sal.hra ?? 0,
                washing: sal.washing ?? 0, conveyance: sal.conveyance ?? 0, leaveWithWages: sal.leaveWithWages ?? 0,
                otherAllowance: sal.otherAllowance ?? 0, bonus: sal.bonus ?? undefined,
                otRatePerHour: sal.otRatePerHour ?? rules.defaults.otRatePerHour,
                canteenRatePerDay: sal.canteenRatePerDay ?? rules.defaults.canteenRatePerDay,
                complianceType: sal.complianceType ?? "OR", isHandicap: row.employee.isHandicap ?? false,
                siteId: row.siteId ?? null,
                employeeId: row.employeeId,
                ...statutoryAt(row.employeeId, { month: row.month, year: row.year }),
            }, {
                monthDays: row.workingDays, workedDays: row.presentDays, otDays: row.otDays,
                canteenDays: row.canteenDays, canteenAmount: row.canteenAmount, penalty: row.penalty,
                advance: row.advance, otherDeductions: row.otherDeductions, productionIncentive: row.productionIncentive,
                lwf: row.lwf, gender: row.employee.gender ?? "Male", month: row.month,
                otAmount: manualOt(row.employeeId, { month: row.month, year: row.year }),
            }, rules)

            // Compare like with like: the stored net may include arrears it
            // paid for other months, so take those out first.
            const oldNet = row.netSalary - (row.arrears || 0)
            const netDiff = r2(calc.netSalary - oldNet)
            const settled = settledBy.get(key(row.employeeId, row.year, row.month)) ?? 0
            const remaining = r2(netDiff - settled)
            if (Math.abs(remaining) < 1) continue
            toCreate.push({
                employeeId: row.employeeId, forMonth: row.month, forYear: row.year, status: "PENDING",
                oldGross: row.grossSalary, newGross: calc.grossSalary, oldNet, newNet: calc.netSalary,
                grossDiff: r2(calc.grossSalary - row.grossSalary),
                pfDiff: r2(calc.pfEmployee - row.pfEmployee), esicDiff: r2(calc.esiEmployee - row.esiEmployee),
                ptDiff: r2(calc.pt - row.pt), netDiff, amount: remaining,
                detail: {
                    old: { basic: row.basicFull, da: row.daFull, hra: row.hraFull, washing: row.washingFull, conveyance: row.conveyanceFull, lww: row.lwwFull, bonus: row.bonusFull, other: row.otherFull },
                    new: { basic: sal.basic, da: sal.da, hra: sal.hra, washing: sal.washing, conveyance: sal.conveyance, lww: sal.leaveWithWages, bonus: sal.bonus, other: sal.otherAllowance },
                    days: { month: row.workingDays, worked: row.presentDays },
                    alreadySettled: settled,
                },
                createdBy,
            })
        }
        // Replace the pending arrears of every month looked at, in one go.
        await prisma.$transaction([
            prisma.salaryArrear.deleteMany({
                where: { status: "PENDING", OR: due.map(r => ({ employeeId: r.employeeId, forMonth: r.month, forYear: r.year })) },
            }),
            prisma.salaryArrear.createMany({ data: toCreate }),
        ])
        return toCreate.length
    } catch (e) {
        if (!isMissingTableErr(e)) console.error("[SALARY_ARREARS]", e)
        return 0
    }
}

type LogEntry = {
    employeeId: string; effectiveYear: number; effectiveMonth: number; source: "bulk-upload" | "salary-edit" | "increment"
    before: Record<string, unknown> | null; after: Record<string, unknown>; changedBy: string | null
}

/** Records saves of salary revisions (history) in one insert. Never throws. */
export async function logRevisions(entries: LogEntry[]) {
    if (!entries.length) return
    try {
        await prisma.salaryRevisionLog.createMany({
            data: entries.map(e => ({
                employeeId: e.employeeId, effectiveYear: e.effectiveYear, effectiveMonth: e.effectiveMonth,
                action: e.before ? "UPDATE" : "CREATE", source: e.source,
                before: (e.before ?? undefined) as any, after: e.after as any, changedBy: e.changedBy,
            })),
        })
    } catch (e) {
        if (!isMissingTableErr(e)) console.error("[SALARY_REVISION_LOG]", e)
    }
}

const PICK = ["basic", "da", "hra", "washing", "conveyance", "leaveWithWages", "otherAllowance", "bonus", "otRatePerHour", "canteenRatePerDay", "complianceType", "ctcMonthly"] as const
/** The salary figures of a revision / structure row, for the history log. */
export function salaryFigures(r: Record<string, any> | null | undefined): Record<string, unknown> | null {
    if (!r) return null
    return Object.fromEntries(PICK.map(k => [k, r[k] ?? null]))
}
