import prisma from "./prisma"

// Inspection.approvedBy holds the reviewer's user id — who approved it, or who
// rejected it — with no relation to User, so screens resolve the names in one
// batch here. Rows without one (pending, sent back, rejected before rejections
// were recorded) get null.
export async function withApproverNames<T extends { approvedBy?: string | null }>(
    rows: T[],
): Promise<(T & { approvedByName: string | null })[]> {
    const ids = Array.from(new Set(rows.map(r => r.approvedBy).filter((v): v is string => !!v)))
    const users = ids.length
        ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
        : []
    const names = new Map(users.map(u => [u.id, u.name]))
    return rows.map(r => ({ ...r, approvedByName: r.approvedBy ? names.get(r.approvedBy) ?? null : null }))
}

// "YYYY-MM-DD" in India time → the instant that day starts / ends. Inspections
// are filtered on submittedAt, and a day means the IST calendar day the
// Submitted column shows. Anything that isn't a plain date gives null.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export function istDayStart(d: string | null): Date | null {
    return d && DATE_RE.test(d) ? new Date(`${d}T00:00:00.000+05:30`) : null
}
export function istDayEnd(d: string | null): Date | null {
    return d && DATE_RE.test(d) ? new Date(`${d}T23:59:59.999+05:30`) : null
}

/**
 * A search box entry that is a date, as "YYYY-MM-DD", else null. Takes the
 * day-first form the Submitted column shows (30/10/2026, 30-10-2026, 30.10.26)
 * and ISO (2026-10-30). Without a year (30/10) it means this year in India time.
 */
export function searchDate(q: string): string | null {
    const s = q.trim()
    let d: number, m: number, y: number
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
    const dmy = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(s)
    if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3] }
    else if (dmy) {
        d = +dmy[1]; m = +dmy[2]
        y = dmy[3] ? (dmy[3].length === 2 ? 2000 + +dmy[3] : +dmy[3])
            : new Date(Date.now() + 5.5 * 3600 * 1000).getUTCFullYear()
    } else return null
    // Reject impossible dates (31/02, 13/13) instead of rolling them over.
    const t = new Date(Date.UTC(y, m - 1, d))
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}
