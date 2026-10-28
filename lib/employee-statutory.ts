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
