// Keep the OT rate in each salary structure (Salary Master → OT Rate / Hour)
// equal to the rate the employee's site OT rule gives (Calculation Settings →
// OT Rule by Site), so what HR sees is what payroll pays.
//
// Runs after every change that can move it — OT settings, a salary structure,
// an increment (via recalcDraftPayroll) — and when payroll is processed.
// Uses the settings in force for the open payroll month and each person's
// current posting. Rules that don't set a rate leave the structure alone:
//   Fixed with no rate          → the structure's own rate is the rate
//   Manual rate with none typed → the structure's own rate
//   Manual monthly amount       → paid as an amount, no rate
import prisma from "@/lib/prisma"
import { postedSites } from "@/lib/attendance-guard"
import { otRatePerHourFor, otRuleFor, type OtPart, type PayrollRules } from "@/lib/payroll-rules"
import { getPayrollRules } from "@/lib/payroll-rules-server"

const BACKUP_KEY = "otRateSyncBackup"

/** The rate the site rule sets for this structure, or null when the rule leaves it to the structure. */
export function ruleOtRate(rules: PayrollRules, siteId: string | null | undefined, employeeId: string, s: {
    basic: number; da: number; hra: number; washing: number; conveyance: number; leaveWithWages: number
    bonus: number; otherAllowance: number; complianceType: string | null; otRatePerHour: number
}): number | null {
    const { formula: f, siteRate } = otRuleFor(rules.ot, siteId)
    if (!f) return null
    if (f.kind === "MANUAL_AMOUNT") return null
    if (f.kind === "MANUAL_RATE" && !rules.ot.manualRates?.[employeeId]) return null
    if (f.kind === "FIXED" && !siteRate && !(f.fixedRate && f.fixedRate > 0)) return null
    // Same full-month amounts as the payroll engine (contract staff: HRA / bonus per settings).
    const isCall = s.complianceType === "CALL"
    const parts: Record<OtPart, number> = {
        basic: s.basic || 0, da: s.da || 0,
        hra: isCall && !rules.call.hra ? 0 : Math.max(s.hra || 0, 0),
        washing: s.washing || 0, conveyance: s.conveyance || 0, leaveWithWages: s.leaveWithWages || 0,
        bonus: isCall && !rules.call.bonus ? 0 : Math.max(s.bonus || 0, 0),
        otherAllowance: s.otherAllowance || 0,
    }
    const r = otRatePerHourFor(rules.ot, siteId, parts, s.otRatePerHour, employeeId)
    return Number.isFinite(r) ? Math.round(r * 100) / 100 : null
}

/** Writes the site-rule OT rate into the salary structures that differ. Never throws. */
export async function syncOtRatesToStructures(opts: { employeeIds?: string[] } = {}): Promise<number> {
    try {
        if (opts.employeeIds && !opts.employeeIds.length) return 0
        const { rules } = await getPayrollRules()
        const hasRules = Object.keys(rules.ot.sites ?? {}).length > 0 || rules.ot.defaultRule !== "FIXED"
            || rules.ot.formulas?.find(f => f.id === rules.ot.defaultRule)?.fixedRate
        if (!hasRules) return 0 // nothing sets a rate: every structure keeps its own
        const sals = await prisma.employeeSalary.findMany({
            where: opts.employeeIds ? { employeeId: { in: opts.employeeIds } } : {},
            select: { id: true, employeeId: true, basic: true, da: true, hra: true, washing: true, conveyance: true, leaveWithWages: true, bonus: true, otherAllowance: true, complianceType: true, otRatePerHour: true },
        })
        if (!sals.length) return 0
        const posted = await postedSites(sals.map(s => s.employeeId))
        const changes = sals.flatMap(s => {
            const rate = ruleOtRate(rules, posted.get(s.employeeId) ?? null, s.employeeId, s)
            return rate !== null && Math.abs(rate - (s.otRatePerHour ?? 0)) >= 0.005 ? [{ id: s.id, rate }] : []
        })
        if (!changes.length) return 0
        // Keep the rates being replaced (last 10 runs) so a change can be undone.
        try {
            const old = new Map(sals.map(x => [x.id, x]))
            const row = await prisma.appSetting.findUnique({ where: { key: BACKUP_KEY } })
            const runs: unknown[] = row?.value ? JSON.parse(row.value) : []
            runs.unshift({ at: new Date().toISOString(), changes: changes.map(c => ({ employeeId: old.get(c.id)!.employeeId, from: old.get(c.id)!.otRatePerHour, to: c.rate })) })
            const value = JSON.stringify(runs.slice(0, 10))
            await prisma.appSetting.upsert({ where: { key: BACKUP_KEY }, update: { value, updatedBy: "ot-sync" }, create: { key: BACKUP_KEY, value, updatedBy: "ot-sync" } })
        } catch (e) { console.error("[OT_RATE_SYNC_BACKUP]", e) }
        for (let i = 0; i < changes.length; i += 200) {
            await prisma.$transaction(changes.slice(i, i + 200).map(c => prisma.employeeSalary.update({ where: { id: c.id }, data: { otRatePerHour: c.rate } })))
        }
        return changes.length
    } catch (e) {
        console.error("[OT_RATE_SYNC]", e)
        return 0
    }
}
