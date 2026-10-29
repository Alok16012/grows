import prisma from "./prisma"

// Inspection.approvedBy holds the approver's user id with no relation to User,
// so list screens resolve the names in one batch here. Rows without an approver
// (pending, rejected, approved before this was recorded) get null.
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
