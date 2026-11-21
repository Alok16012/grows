// Per-employee statutory switches: PF Applicable, PF Pension (EPS) Applicable,
// ESIC Applicable. Stored in their own table (scripts/employee-statutory.sql);
// an employee with no row — or every employee, before that SQL has run — is
// treated as all three applicable, which is exactly how payroll behaved before
// the switches existed. So nothing changes for anyone until a box is unticked.
import prisma from "@/lib/prisma"
import { isMissingTableErr } from "@/lib/asset-workflow"

export type StatutoryFlags = {
    pfApplicable: boolean
    pensionApplicable: boolean
    esicApplicable: boolean
}

export const DEFAULT_STATUTORY: StatutoryFlags = { pfApplicable: true, pensionApplicable: true, esicApplicable: true }

export const STATUTORY_MISSING_MESSAGE =
    "PF / pension / ESIC switches aren't set up yet — run scripts/employee-statutory.sql in the Supabase SQL editor."

/** Flags for many employees at once. Missing employees (or a missing table) are absent from the map → use DEFAULT_STATUTORY. */
export async function statutoryFlagsFor(employeeIds: string[]): Promise<Map<string, StatutoryFlags>> {
    const out = new Map<string, StatutoryFlags>()
    if (!employeeIds.length) return out
    try {
        const rows = await prisma.employeeStatutory.findMany({
            where: { employeeId: { in: employeeIds } },
            select: { employeeId: true, pfApplicable: true, pensionApplicable: true, esicApplicable: true },
        })
        for (const r of rows) out.set(r.employeeId, { pfApplicable: r.pfApplicable, pensionApplicable: r.pensionApplicable, esicApplicable: r.esicApplicable })
    } catch (e) {
        if (!isMissingTableErr(e)) throw e
    }
    return out
}

/** One employee's flags, and whether the table exists yet. */
export async function statutoryFlagsOf(employeeId: string): Promise<{ installed: boolean; flags: StatutoryFlags }> {
    try {
        const r = await prisma.employeeStatutory.findUnique({ where: { employeeId } })
        return { installed: true, flags: r ? { pfApplicable: r.pfApplicable, pensionApplicable: r.pensionApplicable, esicApplicable: r.esicApplicable } : { ...DEFAULT_STATUTORY } }
    } catch (e) {
        if (isMissingTableErr(e)) return { installed: false, flags: { ...DEFAULT_STATUTORY } }
        throw e
    }
}

/** Reads the three booleans from a request body; anything not a boolean is ignored. */
export function parseStatutory(body: unknown): Partial<StatutoryFlags> {
    const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
    const out: Partial<StatutoryFlags> = {}
    if (typeof b.pfApplicable === "boolean") out.pfApplicable = b.pfApplicable
    if (typeof b.pensionApplicable === "boolean") out.pensionApplicable = b.pensionApplicable
    if (typeof b.esicApplicable === "boolean") out.esicApplicable = b.esicApplicable
    // No PF means no EPS either — pension is part of the PF scheme.
    if (out.pfApplicable === false) out.pensionApplicable = false
    return out
}

// ─── Dated changes (Payroll → Calculation Settings → Change control) ─────────
// A change to the switches applies from a month (the open payroll month or the
// next). Months before it keep what was in force then. The EmployeeStatutory
// row above is the starting point for months before an employee's first change.

type YMx = { month: number; year: number }
const ymk = (p: YMx) => p.year * 12 + p.month

/** One read for many employees: (employeeId, month) → the switches in force that month. */
export async function statutoryResolver(employeeIds: string[]): Promise<(employeeId: string, p: YMx) => StatutoryFlags> {
    const base = await statutoryFlagsFor(employeeIds)
    let changes: { employeeId: string; fromYear: number; fromMonth: number; pfApplicable: boolean; pensionApplicable: boolean; esicApplicable: boolean }[] = []
    if (employeeIds.length) {
        try {
            changes = await prisma.employeeStatutoryChange.findMany({
                where: { employeeId: { in: employeeIds } },
                select: { employeeId: true, fromYear: true, fromMonth: true, pfApplicable: true, pensionApplicable: true, esicApplicable: true },
                orderBy: [{ fromYear: "asc" }, { fromMonth: "asc" }],
            })
        } catch (e) { if (!isMissingTableErr(e)) throw e }
    }
    const byEmp = new Map<string, typeof changes>()
    for (const c of changes) byEmp.set(c.employeeId, [...(byEmp.get(c.employeeId) ?? []), c])
    return (employeeId, p) => {
        let hit: StatutoryFlags | null = null
        for (const c of byEmp.get(employeeId) ?? []) if (ymk({ year: c.fromYear, month: c.fromMonth }) <= ymk(p)) hit = { pfApplicable: c.pfApplicable, pensionApplicable: c.pensionApplicable, esicApplicable: c.esicApplicable }
        return hit ?? base.get(employeeId) ?? { ...DEFAULT_STATUTORY }
    }
}

/** Switches in force for one payroll month, as a map (same shape as statutoryFlagsFor). */
export async function statutoryFlagsForMonth(employeeIds: string[], p: YMx): Promise<Map<string, StatutoryFlags>> {
    const at = await statutoryResolver(employeeIds)
    return new Map(employeeIds.map(id => [id, at(id, p)]))
}

/** Changes that start after the given month, for "changes on <month>" notes in the UI. */
export async function upcomingStatutoryChanges(employeeIds: string[], after: YMx) {
    if (!employeeIds.length) return new Map<string, { fromYear: number; fromMonth: number; flags: StatutoryFlags }>()
    try {
        const rows = await prisma.employeeStatutoryChange.findMany({
            where: { employeeId: { in: employeeIds }, OR: [{ fromYear: { gt: after.year } }, { fromYear: after.year, fromMonth: { gt: after.month } }] },
            orderBy: [{ fromYear: "asc" }, { fromMonth: "asc" }],
        })
        const out = new Map<string, { fromYear: number; fromMonth: number; flags: StatutoryFlags }>()
        for (const r of rows) if (!out.has(r.employeeId)) out.set(r.employeeId, { fromYear: r.fromYear, fromMonth: r.fromMonth, flags: { pfApplicable: r.pfApplicable, pensionApplicable: r.pensionApplicable, esicApplicable: r.esicApplicable } })
        return out
    } catch (e) {
        if (isMissingTableErr(e)) return new Map()
        throw e
    }
}

/**
 * Save a dated change for many employees: the switches in force at `from`,
 * with `patch` applied, recorded as applying from `from`. Pension stays off
 * for anyone without PF. Returns how many had pension left off for that reason.
 */
export async function saveStatutoryChange(employeeIds: string[], patch: Partial<StatutoryFlags>, from: YMx, userId: string | null, reason?: string | null): Promise<{ saved: number; skippedPension: number }> {
    const at = await statutoryResolver(employeeIds)
    let skippedPension = 0
    const rows = employeeIds.map(id => {
        const cur = at(id, from)
        const next: StatutoryFlags = { ...cur, ...patch }
        if (!next.pfApplicable) { if (patch.pensionApplicable === true) skippedPension++; next.pensionApplicable = false }
        return { id, next }
    })
    for (let i = 0; i < rows.length; i += 300) {
        await prisma.$transaction(rows.slice(i, i + 300).map(({ id, next }) => prisma.employeeStatutoryChange.upsert({
            where: { employeeId_fromYear_fromMonth: { employeeId: id, fromYear: from.year, fromMonth: from.month } },
            create: { employeeId: id, fromYear: from.year, fromMonth: from.month, ...next, changedBy: userId, reason: reason ?? null },
            update: { ...next, changedBy: userId, reason: reason ?? null },
        })))
    }
    return { saved: rows.length, skippedPension }
}
