// Change approval for sensitive employee fields (People → Change requests).
// A change to a field in the approval list — by the employee (My Profile) or by
// HR (employee form) — is held as a request; someone else with Manage
// Employees approves it, and only then is it written. Fields and who may skip
// approval are settings (peopleSettings.approval).
import prisma from "@/lib/prisma"
import { getPeopleSettings } from "@/lib/people-quality-server"
import { Q_FIELD } from "@/lib/people-quality"
import { notifyApprovers } from "@/lib/hr-notify"
import { maskValue } from "@/lib/access"

export type Change = { field: string; label: string; from: string | null; to: string | null }

export { APPROVABLE_FIELDS } from "@/lib/employee-change-fields"
import { APPROVABLE_FIELDS } from "@/lib/employee-change-fields"
const LABEL = new Map(APPROVABLE_FIELDS.map(f => [f.key, f.label]))
export const SENSITIVE = new Set(["bankAccountNumber", "panNumber", "aadharNumber", "uan", "pfNumber", "esiNumber"])
const DATE = new Set(["dateOfBirth"])

const norm = (field: string, v: unknown): string | null => {
    if (v === null || v === undefined) return null
    if (v instanceof Date) return v.toISOString().slice(0, 10)
    const s = String(v).trim()
    if (!s) return null
    return DATE.has(field) ? s.slice(0, 10) : s
}

/**
 * Splits an update into what may be written now and what needs approval.
 * `data` is the update about to be written (already normalised by the caller).
 */
export async function holdForApproval(emp: Record<string, any>, data: Record<string, unknown>, who: { source: "HR" | "SELF"; isAdmin: boolean }) {
    const s = await getPeopleSettings()
    const ap = s.approval
    const needs = who.source === "SELF" ? ap.selfService : (ap.hrChanges && !(who.isAdmin && ap.adminBypass))
    if (!needs) return { data, held: [] as Change[] }
    const held: Change[] = []
    const rest: Record<string, unknown> = { ...data }
    for (const f of ap.fields) {
        if (!(f in data)) continue
        const from = norm(f, emp[f]), to = norm(f, data[f])
        if (from === to) { delete rest[f]; continue }
        held.push({ field: f, label: LABEL.get(f) ?? Q_FIELD.get(f)?.label ?? f, from, to })
        delete rest[f]
    }
    return { data: rest, held }
}

async function nextNo(): Promise<string> {
    const last = await prisma.employeeChangeRequest.findFirst({ orderBy: { createdAt: "desc" }, select: { requestNo: true } })
    return `CR-${String(Number(/(\d+)$/.exec(last?.requestNo ?? "")?.[1] ?? 0) + 1).padStart(4, "0")}`
}

export async function createChangeRequest(input: { employeeId: string; requestedBy: string; requesterName: string; source: "HR" | "SELF"; changes: Change[]; reason?: string | null }) {
    if (!input.changes.length) return null
    // One open request per employee: a new change replaces the same field in it.
    const open = await prisma.employeeChangeRequest.findFirst({ where: { employeeId: input.employeeId, status: "PENDING", source: input.source } })
    let req
    if (open) {
        const merged = [...(open.changes as Change[]).filter(c => !input.changes.some(n => n.field === c.field)), ...input.changes]
        req = await prisma.employeeChangeRequest.update({ where: { id: open.id }, data: { changes: merged as any, reason: input.reason ?? open.reason } })
    } else {
        for (let i = 0; i < 3; i++) {
            try {
                req = await prisma.employeeChangeRequest.create({ data: { requestNo: await nextNo(), employeeId: input.employeeId, requestedBy: input.requestedBy, source: input.source, changes: input.changes as any, reason: input.reason ?? null } })
                break
            } catch (e: any) { if (e?.code !== "P2002" || i === 2) throw e }
        }
    }
    const emp = await prisma.employee.findUnique({ where: { id: input.employeeId }, select: { firstName: true, lastName: true, employeeId: true } })
    await notifyApprovers(["employees.edit"], {
        title: "Employee change to approve",
        message: `${input.requesterName} changed ${input.changes.map(c => c.label).join(", ")} for ${emp?.firstName ?? ""} ${emp?.lastName ?? ""} (${emp?.employeeId ?? ""})`,
        type: "employee", link: "/employees/changes",
    }, input.requestedBy)
    return req
}

/** The changes as a viewer may see them (sensitive values masked without KYC / bank access). */
export function viewChanges(changes: Change[], canSeeSensitive: boolean): Change[] {
    return changes.map(c => SENSITIVE.has(c.field) && !canSeeSensitive ? { ...c, from: maskValue(c.from), to: maskValue(c.to) } : c)
}

export async function decideChangeRequest(id: string, approve: boolean, actor: { id: string; name: string; isAdmin: boolean }, note?: string | null) {
    const r = await prisma.employeeChangeRequest.findUnique({ where: { id } })
    if (!r) throw new Error("Request not found")
    if (r.status !== "PENDING") throw new Error("This request is already decided")
    if (r.requestedBy === actor.id && !actor.isAdmin) throw new Error("Someone else has to approve your own change")
    if (!approve && !(note && note.trim().length >= 3)) throw new Error("Give a reason for rejecting")
    const changes = r.changes as Change[]
    if (approve) {
        const data: Record<string, unknown> = {}
        for (const c of changes) data[c.field] = DATE.has(c.field) ? (c.to ? new Date(c.to) : null) : c.to
        const emp = await prisma.employee.update({ where: { id: r.employeeId }, data, select: { userId: true, firstName: true, lastName: true } })
        if (("firstName" in data || "lastName" in data) && emp.userId) await prisma.user.update({ where: { id: emp.userId }, data: { name: `${emp.firstName} ${emp.lastName}`.trim() } }).catch(() => {})
    }
    const updated = await prisma.employeeChangeRequest.update({ where: { id }, data: { status: approve ? "APPROVED" : "REJECTED", decidedBy: actor.id, decidedAt: new Date(), decisionNote: note ?? null } })
    await prisma.notification.create({ data: {
        userId: r.requestedBy, title: approve ? "Profile change approved ✓" : "Profile change rejected",
        message: `${r.requestNo}: ${changes.map(c => c.label).join(", ")} ${approve ? "updated" : `not changed — ${note}`}`, type: "employee", link: r.source === "SELF" ? "/profile" : "/employees/changes",
    } }).catch(() => {})
    return updated
}
