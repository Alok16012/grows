// Join link — duplicate / rejoin check and HR alerts for the public /join form.
import prisma from "@/lib/prisma"
import { findEmployeeDuplicates } from "@/lib/employee-dedupe"
import { notifyApprovers } from "@/lib/hr-notify"
import { signoffReady, statusFor } from "@/lib/policy-signoff"
import { sanitizeJoinSettings, JOIN_DUP_FIELDS, type JoinSettings } from "@/lib/join-settings"

const KEY = "joinSettings"
export const ONBOARDING_APPROVERS = ["onboarding.approve"]
const LEFT = new Set(["RESIGNED", "TERMINATED", "INACTIVE"])

export async function getJoinSettings(): Promise<JoinSettings> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: KEY } })
        return sanitizeJoinSettings(row?.value ? JSON.parse(row.value) : {})
    } catch { return sanitizeJoinSettings({}) }
}

export async function saveJoinSettings(input: unknown, userId: string): Promise<JoinSettings> {
    // Merge so a partial save (one section) keeps the rest.
    const cur = await getJoinSettings()
    const s = sanitizeJoinSettings({ ...cur, ...(input as object) })
    const value = JSON.stringify(s)
    await prisma.appSetting.upsert({ where: { key: KEY }, update: { value, updatedBy: userId }, create: { key: KEY, value, updatedBy: userId } })
    return s
}

type Note = { title: string; message: string; type: string; link?: string }
export async function notifyUsers(userIds: (string | null | undefined)[], note: Note) {
    const ids = Array.from(new Set(userIds.filter((x): x is string => !!x)))
    if (!ids.length) return
    try {
        const live = await prisma.user.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true } })
        if (live.length) await prisma.notification.createMany({ data: live.map(u => ({ userId: u.id, ...note })) })
    } catch (e) { console.error("[JOIN_NOTIFY]", e) }
}

export type JoinMatch = {
    employee: { id: string; employeeId: string; name: string; status: string; dateOfLeaving: Date | null }
    fields: string[]
    left: boolean
}

/**
 * Does this form match an employee already on record? Mobile and email always;
 * Aadhaar / PAN / bank / UAN as the settings say. Returns the first person matched.
 */
export async function findJoinMatch(b: { phone?: string; email?: string; aadharNumber?: string; panNumber?: string; bankAccountNumber?: string; uan?: string }, s: JoinSettings): Promise<JoinMatch | null> {
    const on = new Set(s.duplicates.fields)
    const conflicts = await findEmployeeDuplicates({
        phone: b.phone, email: b.email,
        aadharNumber: on.has("aadhar") ? b.aadharNumber : undefined,
        panNumber: on.has("pan") ? b.panNumber : undefined,
        bankAccountNumber: on.has("bankAccount") ? b.bankAccountNumber : undefined,
    })
    const hits = new Map<string, string[]>()
    for (const c of conflicts) hits.set(c.employee.id, [...(hits.get(c.employee.id) ?? []), c.field === "phone" ? "Mobile" : c.field === "email" ? "Email" : JOIN_DUP_FIELDS[c.field as keyof typeof JOIN_DUP_FIELDS] ?? c.label])
    const uan = String(b.uan ?? "").replace(/\D/g, "")
    if (on.has("uan") && uan.length === 12) {
        const u = await prisma.employee.findFirst({ where: { uan: { contains: uan } }, select: { id: true } })
        if (u) hits.set(u.id, [...(hits.get(u.id) ?? []), "UAN"])
    }
    if (!hits.size) return null
    const emps = await prisma.employee.findMany({ where: { id: { in: Array.from(hits.keys()) } }, select: { id: true, employeeId: true, firstName: true, lastName: true, status: true, dateOfLeaving: true } })
    // Prefer an ex-employee (rejoin), else whoever matched most fields.
    emps.sort((a, b) => Number(LEFT.has(String(b.status))) - Number(LEFT.has(String(a.status))) || (hits.get(b.id)!.length - hits.get(a.id)!.length))
    const e = emps[0]
    if (!e) return null
    return {
        employee: { id: e.id, employeeId: e.employeeId, name: `${e.firstName} ${e.lastName ?? ""}`.trim(), status: String(e.status), dateOfLeaving: e.dateOfLeaving },
        fields: hits.get(e.id)!, left: LEFT.has(String(e.status)),
    }
}

/** The public message. Same wording whoever matched, so the form reveals nothing about the other record. */
export const DUPLICATE_MESSAGE = "These details are already registered with us. Please don't register again — HR has been told and will contact you to continue."

/**
 * Tell HR about a blocked form. An ex-employee coming back also gets a
 * "Rejoin request" lead (at most one a week per person) so it sits in the
 * recruiter's pipeline, linked to the old record.
 */
export async function alertBlockedJoin(m: JoinMatch, form: { firstName?: string; lastName?: string; phone?: string; designation?: string; siteId?: string; dateOfJoining?: string; hrId?: string }, s: JoinSettings) {
    const who = `${[form.firstName, form.lastName].filter(Boolean).join(" ") || "Someone"}`
    const site = form.siteId ? (await prisma.site.findUnique({ where: { id: form.siteId }, select: { name: true } }))?.name ?? null : null
    if (m.left && s.duplicates.rejoinAlert) {
        const recent = await prisma.lead.findFirst({ where: { source: "Rejoin request", convertedEmployeeId: m.employee.id, createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }, select: { id: true } })
        if (recent) return
        const owner = form.hrId && await prisma.user.findUnique({ where: { id: form.hrId }, select: { id: true } }) ? form.hrId : null
        if (owner) {
            await prisma.lead.create({
                data: {
                    candidateName: m.employee.name, phone: String(form.phone ?? "").replace(/\D/g, "").slice(-10) || "0000000000",
                    position: form.designation?.trim() || "Not Specified", source: "Rejoin request", status: "NEW_LEAD" as any,
                    priority: "HIGH", score: "WARM", siteId: form.siteId || null, createdBy: owner, assignedTo: owner, convertedEmployeeId: m.employee.id,
                    notes: `Ex-employee ${m.employee.employeeId} (${m.employee.status.toLowerCase()}${m.employee.dateOfLeaving ? `, left ${m.employee.dateOfLeaving.toISOString().slice(0, 10)}` : ""}) applied again through the join link. Matched on ${m.fields.join(", ")}. Wants: ${form.designation || "—"}${site ? ` at ${site}` : ""}${form.dateOfJoining ? `, joining ${form.dateOfJoining}` : ""}. Reactivate the old record instead of making a new one.`,
                } as any,
            }).catch(e => console.error("[JOIN_REJOIN_LEAD]", e))
        }
        const note = { title: "Ex-employee wants to rejoin", message: `${m.employee.name} (${m.employee.employeeId}, ${m.employee.status.toLowerCase()}) filled the join form again${form.designation ? ` for ${form.designation}` : ""}${site ? ` at ${site}` : ""}. Reactivate the old record instead of making a new one.`, type: "onboarding", link: `/employees/profile/${m.employee.id}` }
        if (s.alerts.recruiter) await notifyUsers([form.hrId], note)
        if (s.alerts.approvers) await notifyApprovers(ONBOARDING_APPROVERS, note, form.hrId ?? undefined)
        return
    }
    // Someone already on record (active / onboarding) registering again.
    const note = { title: "Join form blocked — already registered", message: `${who} tried to register again; the ${m.fields.join(", ")} match ${m.employee.name} (${m.employee.employeeId.startsWith("PENDING-") ? "waiting in onboarding" : m.employee.employeeId}). No new record was made.`, type: "onboarding", link: m.employee.status === "ONBOARDING" ? "/onboarding" : `/employees/profile/${m.employee.id}` }
    if (s.alerts.recruiter) await notifyUsers([form.hrId], note)
}

/** A new form went through: tell the recruiter and the approvers. */
export async function alertNewJoiner(e: { name: string; designation?: string | null; siteId?: string | null; hrId?: string | null }, s: JoinSettings) {
    if (!s.alerts.recruiter && !s.alerts.approvers) return
    const site = e.siteId ? (await prisma.site.findUnique({ where: { id: e.siteId }, select: { name: true } }))?.name ?? null : null
    const note = { title: "New joiner — waiting for approval", message: `${e.name}${e.designation ? `, ${e.designation}` : ""}${site ? ` at ${site}` : ""} filled the join form. Check the documents and approve in Onboarding.`, type: "onboarding", link: "/onboarding" }
    if (s.alerts.recruiter) await notifyUsers([e.hrId], note)
    if (s.alerts.approvers) await notifyApprovers(ONBOARDING_APPROVERS, note, e.hrId ?? undefined)
}

/**
 * How many joining (Onboarding-category) policies this person still has to sign.
 * A join form only counts as received once this is 0 — the record is saved on
 * the Documents step, before the Policies step, so an applicant who closes the
 * page there would otherwise reach HR unsigned.
 */
export async function joinPoliciesPending(employeeId: string, designation: string | null | undefined): Promise<number> {
    if (!(await signoffReady())) return 0
    const list = await statusFor(employeeId, designation, "onboarding")
    return list.filter(p => p.status !== "SIGNED").length
}

/** Last joining policy signed on the join/onboarding link → now tell HR the form is in. */
export async function alertJoinerCompleted(employeeId: string) {
    const emp = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { firstName: true, middleName: true, lastName: true, designation: true, managerId: true, status: true, employeeId: true,
            deployments: { where: { isActive: true }, select: { siteId: true }, take: 1 } },
    })
    // Only self-registered joiners still waiting for approval (PENDING-xxxx code).
    if (!emp || emp.status !== "ONBOARDING" || !emp.employeeId.startsWith("PENDING-")) return
    if (await joinPoliciesPending(employeeId, emp.designation)) return
    await alertNewJoiner({
        name: [emp.firstName, emp.middleName, emp.lastName].filter(Boolean).join(" "),
        designation: emp.designation, siteId: emp.deployments[0]?.siteId ?? null, hrId: emp.managerId,
    }, await getJoinSettings())
}

/** Daily: forms waiting for approval longer than the setting → one reminder to approvers. */
export async function remindWaitingJoiners(now = new Date()) {
    const s = await getJoinSettings()
    if (!s.alerts.waitingAfterHours) return 0
    const n = await prisma.onboardingRecord.count({ where: { status: "IN_PROGRESS", createdAt: { lt: new Date(now.getTime() - s.alerts.waitingAfterHours * 3600_000) } } })
    if (n) await notifyApprovers(ONBOARDING_APPROVERS, { title: "Joiners waiting for approval", message: `${n} joining form(s) have been waiting more than ${s.alerts.waitingAfterHours} hours for approval.`, type: "onboarding", link: "/onboarding" })
    return n
}
