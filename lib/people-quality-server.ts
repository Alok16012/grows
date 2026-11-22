import prisma from "@/lib/prisma"
import { employeeScope, hiddenFields, type Access } from "@/lib/access"
import { postedSites } from "@/lib/attendance-guard"
import { checkEmployee, dupKey, Q_FIELDS, sanitizePeopleSettings, type PeopleSettings } from "@/lib/people-quality"
import { getPayrollRules } from "@/lib/payroll-rules-server"
import { esicEligibilityBase, rulesForToday } from "@/lib/payroll-rules"
import { statutoryFlagsFor } from "@/lib/employee-statutory"

const KEY = "peopleSettings"

export async function getPeopleSettings(): Promise<PeopleSettings> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: KEY } })
        return sanitizePeopleSettings(row?.value ? JSON.parse(row.value) : {})
    } catch { return sanitizePeopleSettings({}) }
}

export async function savePeopleSettings(input: unknown, userId: string): Promise<PeopleSettings> {
    const s = sanitizePeopleSettings(input)
    const value = JSON.stringify(s)
    await prisma.appSetting.upsert({ where: { key: KEY }, update: { value, updatedBy: userId }, create: { key: KEY, value, updatedBy: userId } })
    return s
}

/** Computed, not columns. */
const VIRTUAL = new Set(["salaryStructure"])
const SELECT = Object.fromEntries([...Q_FIELDS.filter(f => !VIRTUAL.has(f.key)).map(f => [f.key, true]), ["id", true], ["employeeId", true], ["firstName", true], ["lastName", true], ["status", true], ["isKycVerified", true], ["isHandicap", true]]) as Record<string, true>

/**
 * Salary structure present, and whether payroll would skip ESIC for them —
 * the same test as lib/payroll-calc (limit, basis, CALL rule, the employee's
 * ESIC switch) on the full-month structure. No structure → unknown (ESIC stays required).
 */
async function payrollFacts(emps: { id: string; isHandicap?: boolean | null }[]) {
    const ids = emps.map(e => e.id)
    const [sal, flags, { rules: stored }] = await Promise.all([
        prisma.employeeSalary.findMany({ where: { employeeId: { in: ids } }, select: { employeeId: true, basic: true, da: true, hra: true, washing: true, conveyance: true, leaveWithWages: true, bonus: true, otherAllowance: true, complianceType: true } }),
        statutoryFlagsFor(ids),
        getPayrollRules(),
    ])
    const rules = rulesForToday(stored)
    const salOf = new Map(sal.map(s => [s.employeeId, s]))
    const out = new Map<string, { hasSalary: boolean; esicNotNeeded: boolean | null }>()
    for (const e of emps) {
        const s = salOf.get(e.id)
        if (!s || !(Number(s.basic) > 0)) { out.set(e.id, { hasSalary: false, esicNotNeeded: null }); continue }
        const n = (x: unknown) => Number(x) || 0
        const isCALL = s.complianceType === "CALL"
        const gross = n(s.basic) + n(s.da) + n(s.hra) + n(s.washing) + n(s.conveyance) + n(s.leaveWithWages) + (isCALL && !rules.call.bonus ? 0 : n(s.bonus)) + n(s.otherAllowance)
        const limit = e.isHandicap ? rules.esic.handicapLimit : rules.esic.eligibilityLimit
        const base = esicEligibilityBase(rules.esic, { basic: n(s.basic), da: n(s.da), gross })
        const eligible = rules.esic.enabled && (!isCALL || rules.call.esic) && flags.get(e.id)?.esicApplicable !== false && base <= limit
        out.set(e.id, { hasSalary: true, esicNotNeeded: !eligible })
    }
    return out
}

/** The whole data-quality picture for the caller's employees (active / onboarding). */
export async function computeQuality(access: Access) {
    const settings = await getPeopleSettings()
    const scope = await employeeScope(access)
    const active = { status: { in: ["ACTIVE", "ONBOARDING"] as any } }
    const emps: any[] = await prisma.employee.findMany({ where: scope ? { AND: [active, scope] } : active, select: SELECT, orderBy: { employeeId: "asc" } })
    const hidden = hiddenFields(access)

    // Duplicates are looked for among everyone in scope's reach: active people, or all ever.
    const uniq = Q_FIELDS.filter(f => f.unique)
    const pool: any[] = settings.duplicatesAmong === "all"
        ? await prisma.employee.findMany({ select: Object.fromEntries([...uniq.map(f => [f.key, true]), ["id", true], ["employeeId", true], ["firstName", true], ["lastName", true], ["status", true]]) as any })
        : emps
    const duplicates: { field: string; label: string; groups: { employees: { id: string; code: string; name: string; status: string }[] }[] }[] = []
    const dupOf = new Map<string, Set<string>>() // employeeId → fields duplicated
    for (const f of uniq) {
        const by = new Map<string, any[]>()
        for (const e of pool) { const k = dupKey(f.key, e[f.key]); if (k) by.set(k, [...(by.get(k) ?? []), e]) }
        const groups = Array.from(by.values()).filter(g => g.length > 1 && g.some(e => emps.some(x => x.id === e.id)))
        if (!groups.length) continue
        duplicates.push({ field: f.key, label: f.label, groups: groups.map(g => ({ employees: g.map(e => ({ id: e.id, code: e.employeeId, name: `${e.firstName} ${e.lastName ?? ""}`.trim(), status: String(e.status) })) })) })
        for (const g of groups) for (const e of g) dupOf.set(e.id, new Set([...(dupOf.get(e.id) ?? []), f.label]))
    }

    const [posted, sites, depts, facts] = await Promise.all([
        postedSites(emps.map(e => e.id)),
        prisma.site.findMany({ select: { id: true, name: true } }),
        prisma.department.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
        payrollFacts(emps),
    ])
    for (const e of emps) {
        const f = facts.get(e.id)
        e.salaryStructure = f?.hasSalary ? "Set" : null
        e.esicNotNeeded = f?.esicNotNeeded ?? null
    }
    const siteName = new Map(sites.map(s => [s.id, s.name]))
    const missingByField: Record<string, number> = {}, invalidByField: Record<string, number> = {}
    const rows = emps.map(e => {
        const { issues, requiredCount, filled } = checkEmployee(e, settings)
        for (const i of issues) (i.kind === "missing" ? missingByField : invalidByField)[i.field] = ((i.kind === "missing" ? missingByField : invalidByField)[i.field] ?? 0) + 1
        const siteId = posted.get(e.id) ?? null
        return {
            id: e.id, code: e.employeeId, name: `${e.firstName} ${e.lastName ?? ""}`.trim(), employmentType: e.employmentType,
            siteId, site: siteId ? siteName.get(siteId) ?? null : null, kycVerified: !!e.isKycVerified,
            pct: requiredCount ? Math.round(filled / requiredCount * 100) : 100,
            // Values only for fields the caller may see (to prefill the fix box).
            esicNotNeeded: e.esicNotNeeded === true,
            values: Object.fromEntries(issues.filter(i => !hidden.has(i.field)).map(i => [i.field, i.kind === "invalid" ? e[i.field] : null])),
            issues: issues.map(i => ({ ...i, locked: hidden.has(i.field) })),
            duplicates: Array.from(dupOf.get(e.id) ?? []),
        }
    })
    const bySiteMap = new Map<string, { site: string; n: number; sum: number; complete: number; issues: number }>()
    for (const r of rows) {
        const k = r.site ?? "No site"
        const c = bySiteMap.get(k) ?? { site: k, n: 0, sum: 0, complete: 0, issues: 0 }
        c.n++; c.sum += r.pct; if (!r.issues.length) c.complete++; c.issues += r.issues.length
        bySiteMap.set(k, c)
    }
    return {
        settings,
        departments: depts,
        locked: Array.from(hidden),
        summary: {
            total: rows.length,
            complete: rows.filter(r => !r.issues.length && !r.duplicates.length).length,
            avgPct: rows.length ? Math.round(rows.reduce((s, r) => s + r.pct, 0) / rows.length) : 100,
            withMissing: rows.filter(r => r.issues.some(i => i.kind === "missing")).length,
            withInvalid: rows.filter(r => r.issues.some(i => i.kind === "invalid")).length,
            duplicateGroups: duplicates.reduce((s, d) => s + d.groups.length, 0),
            kycNotVerified: rows.filter(r => !r.kycVerified).length,
            missingByField, invalidByField,
        },
        bySite: Array.from(bySiteMap.values()).map(s => ({ site: s.site, employees: s.n, avgPct: Math.round(s.sum / s.n), complete: s.complete, issues: s.issues })).sort((a, b) => a.avgPct - b.avgPct),
        employees: rows.sort((a, b) => a.pct - b.pct || b.issues.length - a.issues.length),
        duplicates,
    }
}
