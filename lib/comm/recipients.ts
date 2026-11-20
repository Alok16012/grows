import prisma from "@/lib/prisma"
import { notify, type NotifyOpts, type Recipient } from "@/lib/comm/engine"

// Helpers for raising Communication Center events from the modules.

/** Employees as recipients (mobile, email, app login), in the order given. */
export async function employeeRecipients(ids: string[], perPerson?: Map<string, Record<string, unknown>>): Promise<Recipient[]> {
    const uniq = Array.from(new Set(ids.filter(Boolean)))
    if (!uniq.length) return []
    const rows = await prisma.employee.findMany({ where: { id: { in: uniq } }, select: { id: true, firstName: true, lastName: true, phone: true, email: true, userId: true } })
    const byId = new Map(rows.map(r => [r.id, r]))
    return uniq.map(id => byId.get(id)).filter((e): e is NonNullable<typeof e> => !!e).map(e => ({
        type: "employee" as const, id: e.id, name: `${e.firstName} ${e.lastName ?? ""}`.trim(),
        phone: e.phone, email: e.email, userId: e.userId, data: perPerson?.get(e.id),
    }))
}

/** A login as a recipient — through its employee record when it has one. */
export async function userRecipients(userIds: string[]): Promise<Recipient[]> {
    const uniq = Array.from(new Set(userIds.filter(Boolean)))
    if (!uniq.length) return []
    const [emps, users] = await Promise.all([
        prisma.employee.findMany({ where: { userId: { in: uniq } }, select: { id: true, userId: true } }),
        prisma.user.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true, email: true } }),
    ])
    const viaEmp = await employeeRecipients(emps.map(e => e.id))
    const covered = new Set(viaEmp.map(r => r.userId))
    return [
        ...viaEmp,
        ...users.filter(u => !covered.has(u.id)).map(u => ({ type: "employee" as const, id: null, name: u.name ?? "", email: u.email, userId: u.id })),
    ]
}

/**
 * Raises an event and never throws: a message failing must not fail the
 * action (approving a leave, paying salaries…) that caused it. Returns how
 * many messages were queued so the page can keep a big batch moving.
 */
export async function commNotify(event: string, recipients: Recipient[] | Promise<Recipient[]>, data: Record<string, unknown>, opts: NotifyOpts = {}): Promise<number> {
    try {
        const list = await recipients
        if (!list.length) return 0
        const r = await notify(event, list, data, { budgetMs: 3000, ...opts })
        return r.queued
    } catch (e) {
        console.error("[COMM_NOTIFY]", event, e)
        return 0
    }
}

export const fmtDay = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
export const fmtRange = (a: Date, b: Date) => (fmtDay(a) === fmtDay(b) ? fmtDay(a) : `${fmtDay(a)} – ${fmtDay(b)}`)
export const fmtInr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`
