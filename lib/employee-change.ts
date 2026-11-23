// Change approval for employee data.
// A change to a field in the approval list — by the employee (My Profile /
// My Onboarding) or by HR (employee form) — is held as a request; someone else
// approves it, and only then is it written. With approval.selfAllFields every
// field the employee changes themself is held, and with approval.selfDocs their
// uploaded documents too (Onboarding → Approvals). Settings: peopleSettings.approval.
import prisma from "@/lib/prisma"
import { getPeopleSettings } from "@/lib/people-quality-server"
import { Q_FIELD } from "@/lib/people-quality"
import { notifyApprovers } from "@/lib/hr-notify"
import { maskValue } from "@/lib/access"
import { isPhotoDoc } from "@/lib/employee-photo"

/** A held change. Documents use field "doc:<TYPE>" with the new file in fileUrl. */
export type Change = { field: string; label: string; from: string | null; to: string | null; fileUrl?: string | null }

export { APPROVABLE_FIELDS } from "@/lib/employee-change-fields"
import { APPROVABLE_FIELDS } from "@/lib/employee-change-fields"
const LABEL = new Map(APPROVABLE_FIELDS.map(f => [f.key, f.label]))
const EXTRA_LABEL: Record<string, string> = {
    middleName: "Middle name", gender: "Gender", bloodGroup: "Blood group", maritalStatus: "Marital status", marriageDate: "Marriage date",
    nationality: "Nationality", religion: "Religion", caste: "Caste", alternatePhone: "Alternate mobile",
    address: "Current address", city: "City", state: "State", pincode: "Pincode",
    permanentAddress: "Permanent address", permanentCity: "Permanent city", permanentState: "Permanent state", permanentPincode: "Permanent pincode",
    labourCardNo: "Labour card no.", emergencyContact1Name: "Emergency contact 1 name", emergencyContact1Phone: "Emergency contact 1 phone",
    emergencyContact2Name: "Emergency contact 2 name", emergencyContact2Phone: "Emergency contact 2 phone",
}
export const fieldLabel = (f: string) => LABEL.get(f) ?? Q_FIELD.get(f)?.label ?? EXTRA_LABEL[f] ?? f.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase())
export const SENSITIVE = new Set(["bankAccountNumber", "panNumber", "aadharNumber", "uan", "pfNumber", "esiNumber"])
const DATE = new Set(["dateOfBirth", "marriageDate"])
export const isDocChange = (c: { field: string }) => c.field.startsWith("doc:")

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
    let fields: string[]
    if (who.source === "SELF") {
        if (!ap.joinersToo && emp.status === "ONBOARDING") return { data, held: [] as Change[] }
        fields = ap.selfAllFields ? Object.keys(data) : ap.selfService ? ap.fields : []
    } else {
        fields = ap.hrChanges && !(who.isAdmin && ap.adminBypass) ? ap.fields : []
    }
    if (!fields.length) return { data, held: [] as Change[] }
    const held: Change[] = []
    const rest: Record<string, unknown> = { ...data }
    for (const f of fields) {
        if (!(f in data)) continue
        const from = norm(f, emp[f]), to = norm(f, data[f])
        if (from === to) { delete rest[f]; continue }
        held.push({ field: f, label: fieldLabel(f), from, to })
        delete rest[f]
    }
    return { data: rest, held }
}

/** Should an employee's own document upload wait for approval? */
export async function holdsDocuments(emp: { status?: string | null }) {
    const ap = (await getPeopleSettings()).approval
    return ap.selfDocs && (ap.joinersToo || emp.status !== "ONBOARDING")
}

/** The employee's own open request: field → new value, for showing what they typed. */
export async function pendingSelfChanges(employeeId: string): Promise<Change[]> {
    const r = await prisma.employeeChangeRequest.findFirst({ where: { employeeId, status: "PENDING", source: "SELF" }, select: { changes: true } }).catch(() => null)
    return (r?.changes as Change[] | undefined) ?? []
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
    const self = input.source === "SELF"
    await notifyApprovers(self ? ["onboarding.approve", "employees.edit"] : ["employees.edit"], {
        title: self ? "Employee update to approve" : "Employee change to approve",
        message: `${input.requesterName} changed ${input.changes.map(c => c.label).join(", ")} for ${emp?.firstName ?? ""} ${emp?.lastName ?? ""} (${emp?.employeeId ?? ""})`,
        type: "employee", link: self ? "/onboarding?tab=approvals" : "/employees/changes",
    }, input.requestedBy)
    return req
}

/** The changes as a viewer may see them (sensitive values masked without KYC / bank access). */
export function viewChanges(changes: Change[], canSeeSensitive: boolean): Change[] {
    return changes.map(c => SENSITIVE.has(c.field) && !canSeeSensitive ? { ...c, from: maskValue(c.from), to: maskValue(c.to) } : c)
}

/**
 * Approve or reject a request. `only` (approve) applies just those fields; the
 * others are turned down with the note.
 */
export async function decideChangeRequest(id: string, approve: boolean, actor: { id: string; name: string; isAdmin: boolean }, note?: string | null, only?: string[] | null) {
    const r = await prisma.employeeChangeRequest.findUnique({ where: { id } })
    if (!r) throw new Error("Request not found")
    if (r.status !== "PENDING") throw new Error("This request is already decided")
    if (r.requestedBy === actor.id && !actor.isAdmin) throw new Error("Someone else has to approve your own change")
    if (!approve && !(note && note.trim().length >= 3)) throw new Error("Give a reason for rejecting")
    const changes = r.changes as Change[]
    const picked = approve && only ? changes.filter(c => only.includes(c.field)) : approve ? changes : []
    const dropped = changes.filter(c => !picked.includes(c))
    if (approve && !picked.length) throw new Error("Tick at least one change to approve")
    if (approve && dropped.length && !(note && note.trim().length >= 3)) throw new Error("Give a reason for the changes you didn't tick")
    if (picked.length) {
        const data: Record<string, unknown> = {}
        for (const c of picked.filter(c => !isDocChange(c))) data[c.field] = DATE.has(c.field) ? (c.to ? new Date(c.to) : null) : c.to
        for (const c of picked.filter(isDocChange)) {
            const type = c.field.slice(4)
            if (!c.fileUrl) continue
            await prisma.employeeDocument.deleteMany({ where: { employeeId: r.employeeId, type } })
            await prisma.employeeDocument.create({ data: { employeeId: r.employeeId, type, fileName: c.to ?? type, fileUrl: c.fileUrl, status: "VERIFIED", verifiedBy: actor.name } })
            if (isPhotoDoc(type, c.to)) data.photo = c.fileUrl
        }
        if (Object.keys(data).length) {
            const emp = await prisma.employee.update({ where: { id: r.employeeId }, data, select: { userId: true, firstName: true, lastName: true } })
            if (("firstName" in data || "lastName" in data) && emp.userId) await prisma.user.update({ where: { id: emp.userId }, data: { name: `${emp.firstName} ${emp.lastName}`.trim() } }).catch(() => {})
        }
    }
    const fullNote = dropped.length && picked.length ? `Not approved: ${dropped.map(c => c.label).join(", ")}${note ? ` — ${note}` : ""}` : note ?? null
    const updated = await prisma.employeeChangeRequest.update({ where: { id }, data: { status: approve ? "APPROVED" : "REJECTED", decidedBy: actor.id, decidedAt: new Date(), decisionNote: fullNote } })
    const msg = approve
        ? `${r.requestNo}: ${picked.map(c => c.label).join(", ")} updated${dropped.length ? `. Not changed: ${dropped.map(c => c.label).join(", ")}${note ? ` — ${note}` : ""}` : ""}`
        : `${r.requestNo}: ${changes.map(c => c.label).join(", ")} not changed — ${note}`
    await prisma.notification.create({ data: {
        userId: r.requestedBy, title: approve ? (dropped.length ? "Profile update partly approved" : "Profile update approved ✓") : "Profile update rejected",
        message: msg, type: "employee", link: r.source === "SELF" ? "/profile" : "/employees/changes",
    } }).catch(() => {})
    return updated
}
