// Server-side loading/saving of the configurable payroll rules.
// Kept separate from lib/payroll-rules.ts so client bundles never pull Prisma.
//
// Calculation Settings are DATED: each save becomes a version that applies
// from a chosen month (Payroll → Calculation Settings → "Apply from"). Months
// before it keep the version that was in force then, so re-processing or
// re-filing an old month never picks up a later change. The original single
// settings row (key "payrollRules") is the starting version for all months
// before the first dated one.
import prisma from "./prisma"
import { loadManualOtRates } from "./payroll-manual-ot-rates"
import {
    DEFAULT_PAYROLL_RULES,
    PAYROLL_RULES_SETTING_KEY,
    PayrollRules,
    sanitizePayrollRules,
} from "./payroll-rules"
import { openPayrollMonth, ymKey, type YM } from "./payroll-change-control"

const VERSIONS_KEY = "payrollRulesVersions"

export type RulesVersion = { fromYear: number; fromMonth: number; rules: PayrollRules; savedBy: string | null; savedAt: string; note?: string | null }

// Prod migrations don't always run on this project (DIRECT_URL isn't configured
// on Vercel), so like app/api/settings we self-heal the AppSetting table before
// touching it. Idempotent, matches migration 20260601100000.
async function ensureAppSettingTable() {
    await (prisma as any).$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AppSetting" (
      "key"       TEXT NOT NULL,
      "value"     TEXT NOT NULL DEFAULT '',
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedBy" TEXT,
      CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
    );
  `)
}

async function withTable<T>(op: () => Promise<T>): Promise<T> {
    try {
        return await op()
    } catch (e: any) {
        if (e?.code === "P2021") {
            await ensureAppSettingTable()
            return await op()
        }
        throw e
    }
}

async function readSetting(key: string): Promise<string | null> {
    const row = await withTable<any>(() => (prisma as any).appSetting.findUnique({ where: { key } }))
    return row?.value ?? null
}
async function writeSetting(key: string, value: string, userId: string) {
    await withTable(() => (prisma as any).appSetting.upsert({ where: { key }, update: { value, updatedBy: userId }, create: { key, value, updatedBy: userId } }))
}

/** The starting rules (before any dated version) and the dated versions, oldest first. */
export async function loadRulesHistory(): Promise<{ base: PayrollRules; baseCustomized: boolean; versions: RulesVersion[] }> {
    let base = DEFAULT_PAYROLL_RULES, baseCustomized = false, versions: RulesVersion[] = []
    try {
        const b = await readSetting(PAYROLL_RULES_SETTING_KEY)
        if (b) { base = sanitizePayrollRules(JSON.parse(b)); baseCustomized = true }
        const v = await readSetting(VERSIONS_KEY)
        if (v) {
            versions = (JSON.parse(v) as RulesVersion[])
                .filter(x => Number.isInteger(x?.fromYear) && Number.isInteger(x?.fromMonth))
                .map(x => ({ ...x, rules: sanitizePayrollRules(x.rules) }))
                .sort((a, b) => ymKey({ year: a.fromYear, month: a.fromMonth }) - ymKey({ year: b.fromYear, month: b.fromMonth }))
        }
    } catch (e) {
        console.error("[PAYROLL_RULES_LOAD]", e)
    }
    return { base, baseCustomized, versions }
}

/** The version in force for a month (null = the starting rules). */
function versionFor(versions: RulesVersion[], p: YM): RulesVersion | null {
    let hit: RulesVersion | null = null
    for (const v of versions) if (ymKey({ year: v.fromYear, month: v.fromMonth }) <= ymKey(p)) hit = v
    return hit
}

// Returns the company's payroll rules for a payroll month (default: the open
// payroll month), falling back to the verified Growus defaults when nothing is
// stored or the stored JSON is unreadable. Payroll must never fail because of
// a bad settings row.
export async function getPayrollRules(period?: YM): Promise<{ rules: PayrollRules; customized: boolean; from: YM | null }> {
    const [{ base, baseCustomized, versions }, manual] = await Promise.all([loadRulesHistory(), loadManualOtRates()])
    const p = period ?? await openPayrollMonth()
    const v = versionFor(versions, p)
    return v ? { rules: withManual(v.rules, manual), customized: true, from: { year: v.fromYear, month: v.fromMonth } } : { rules: withManual(base, manual), customized: baseCustomized, from: null }
}

/** Manual OT rates per employee (lib/payroll-manual-ot-rates) win over anything a settings version holds. */
function withManual(rules: PayrollRules, manual: Record<string, number>): PayrollRules {
    return { ...rules, ot: { ...rules.ot, manualRates: { ...(rules.ot.manualRates ?? {}), ...manual } } }
}

/** Save rules as the version that applies from `from` (replacing a version already starting that month). */
export async function savePayrollRules(input: unknown, userId: string, from: YM, note?: string | null): Promise<PayrollRules> {
    const clean = sanitizePayrollRules(input)
    const rules = { ...clean, ot: { ...clean.ot, manualRates: {} } }
    const { versions } = await loadRulesHistory()
    const next = versions.filter(v => !(v.fromYear === from.year && v.fromMonth === from.month))
    next.push({ fromYear: from.year, fromMonth: from.month, rules, savedBy: userId, savedAt: new Date().toISOString(), note: note ?? null })
    next.sort((a, b) => ymKey({ year: a.fromYear, month: a.fromMonth }) - ymKey({ year: b.fromYear, month: b.fromMonth }))
    await writeSetting(VERSIONS_KEY, JSON.stringify(next), userId)
    return rules
}

/** "Reset to defaults" = the verified defaults as the version from `from`. */
export async function resetPayrollRules(userId: string, from: YM): Promise<PayrollRules> {
    return savePayrollRules(DEFAULT_PAYROLL_RULES, userId, from, "Reset to defaults")
}

/** Remove a version that hasn't started yet (starts in or after the open payroll month). */
export async function deletePayrollRulesVersion(from: YM, userId: string): Promise<string | null> {
    const open = await openPayrollMonth()
    if (ymKey(from) < ymKey(open)) return "That version is already in use by a past payroll month and can't be removed."
    const { versions } = await loadRulesHistory()
    const next = versions.filter(v => !(v.fromYear === from.year && v.fromMonth === from.month))
    if (next.length === versions.length) return "Version not found."
    await writeSetting(VERSIONS_KEY, JSON.stringify(next), userId)
    return null
}

/** Rules for many months at once (one read): p => the version in force that month. */
export async function getRulesResolver(): Promise<(p: YM) => PayrollRules> {
    const [{ base, versions }, manual] = await Promise.all([loadRulesHistory(), loadManualOtRates()])
    return (p: YM) => withManual(versionFor(versions, p)?.rules ?? base, manual)
}
