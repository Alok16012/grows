// Recruitment v2 — manpower requests, interview rounds, offers, auto-assign,
// the recruiter's day list, daily digest, reports, duplicate merge and name clean-up.
import { randomBytes, randomUUID } from "crypto"
import type { Session } from "next-auth"
import prisma from "@/lib/prisma"
import { checkAccess } from "@/lib/permissions"
import { sanitizeSettings, CLOSED_STAGES, JOINED_STAGES, STAGE_RANK, STAGE_LABEL, titleCase, canonicalSource, type RecruitmentSettings } from "@/lib/recruitment"

const KEY = "recruitmentSettings"
export async function getRecSettings(): Promise<RecruitmentSettings> {
    try { const r = await prisma.appSetting.findUnique({ where: { key: KEY } }); return sanitizeSettings(r?.value ? JSON.parse(r.value) : {}) } catch { return sanitizeSettings({}) }
}
export async function saveRecSettings(v: unknown, userId: string) {
    const s = sanitizeSettings(v)
    await prisma.appSetting.upsert({ where: { key: KEY }, update: { value: JSON.stringify(s), updatedBy: userId }, create: { key: KEY, value: JSON.stringify(s), updatedBy: userId } })
    return s
}

// ── Who may do what ──────────────────────────────────────────────────────────
export const canView = (s: Session | null) => checkAccess(s, [], "recruitment.view")
export const canManage = (s: Session | null) => checkAccess(s, [], "recruitment.edit")
export const canApprove = (s: Session | null) => checkAccess(s, [], "recruitment.approve")
export const canRequest = (s: Session | null) => checkAccess(s, [], "recruitment.request") || canApprove(s) || canManage(s)

async function note(userIds: (string | null | undefined)[], title: string, message: string, link: string) {
    const ids = Array.from(new Set(userIds.filter((x): x is string => !!x)))
    if (!ids.length) return
    try {
        const live = await prisma.user.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true } })
        if (live.length) await prisma.notification.createMany({ data: live.map(u => ({ userId: u.id, title, message, type: "recruitment", link })) })
    } catch (e) { console.error("[REC_NOTIFY]", e) }
}
async function usersWith(perm: string) {
    const roles = await prisma.customRole.findMany({ where: { permissions: { has: perm } }, select: { id: true } }).catch(() => [])
    const users = await prisma.user.findMany({ where: { isActive: true, OR: [{ role: "ADMIN" as any }, ...(roles.length ? [{ customRoleId: { in: roles.map(r => r.id) } }] : [])] }, select: { id: true } }).catch(() => [])
    return users.map(u => u.id)
}
async function log(leadId: string, userId: string, content: string, type = "status_change") {
    await prisma.leadActivity.create({ data: { leadId, userId, type, content } }).catch(e => console.error("[REC_LOG]", e))
}
const last10 = (p: string | null | undefined) => String(p ?? "").replace(/\D/g, "").slice(-10)

// ── Manpower requests ────────────────────────────────────────────────────────
async function nextReqNo() {
    const r: { n: number | null }[] = await prisma.$queryRawUnsafe(`SELECT MAX(NULLIF(regexp_replace("reqNo", '\\D', '', 'g'), '')::int) AS n FROM "ManpowerRequest"`)
    return `MR-${String((r[0]?.n ?? 0) + 1).padStart(4, "0")}`
}

/** Seats per request: how many linked candidates joined, and how many are still in the pipeline. */
export async function requestSeats(ids: string[]) {
    if (!ids.length) return new Map<string, { joined: number; inPipeline: number }>()
    const rows = await prisma.lead.groupBy({ by: ["requestId", "status"], where: { requestId: { in: ids } }, _count: { _all: true } })
    const m = new Map<string, { joined: number; inPipeline: number }>()
    for (const r of rows) {
        const e = m.get(r.requestId!) ?? { joined: 0, inPipeline: 0 }
        if (JOINED_STAGES.includes(String(r.status))) e.joined += r._count._all
        else if (!CLOSED_STAGES.includes(String(r.status))) e.inPipeline += r._count._all
        m.set(r.requestId!, e)
    }
    return m
}

export async function listRequests(s: Session, status?: string) {
    const mineOnly = !canApprove(s) && !canManage(s)
    const rows = await prisma.manpowerRequest.findMany({
        where: { ...(mineOnly ? { requestedBy: s.user.id } : {}), ...(status && status !== "ALL" ? (status === "OPEN" ? { status: { in: ["PENDING", "APPROVED"] } } : { status }) : {}) },
        orderBy: [{ createdAt: "desc" }], take: 300,
    })
    const seats = await requestSeats(rows.map(r => r.id))
    const users = await prisma.user.findMany({ where: { id: { in: Array.from(new Set(rows.flatMap(r => [r.requestedBy, r.decidedBy]).filter((x): x is string => !!x))) } }, select: { id: true, name: true } })
    const nameOf = new Map(users.map(u => [u.id, u.name]))
    return rows.map(r => ({ ...r, requestedByName: nameOf.get(r.requestedBy) ?? "—", decidedByName: r.decidedBy ? nameOf.get(r.decidedBy) ?? null : null, seats: seats.get(r.id) ?? { joined: 0, inPipeline: 0 } }))
}

export async function createRequest(s: Session, b: any) {
    const position = String(b?.position ?? "").trim()
    const headcount = Math.max(1, Math.min(500, Math.round(Number(b?.headcount) || 1)))
    if (!position) throw new Error("Which position?")
    const site = b?.siteId ? await prisma.site.findUnique({ where: { id: String(b.siteId) }, select: { id: true, name: true } }) : null
    const settings = await getRecSettings()
    const int = (v: unknown) => (v === "" || v == null || !Number.isFinite(Number(v))) ? null : Math.round(Number(v))
    for (let i = 0; i < 4; i++) {
        try {
            const r = await prisma.manpowerRequest.create({
                data: {
                    reqNo: await nextReqNo(), siteId: site?.id ?? null, siteName: site?.name ?? null, position: titleCase(position), headcount,
                    reason: ["NEW", "REPLACEMENT", "TEMPORARY"].includes(b?.reason) ? b.reason : "NEW",
                    neededBy: b?.neededBy ? new Date(b.neededBy) : null, salaryMin: int(b?.salaryMin), salaryMax: int(b?.salaryMax),
                    notes: b?.notes ? String(b.notes).slice(0, 2000) : null, priority: ["LOW", "MEDIUM", "HIGH"].includes(b?.priority) ? b.priority : "MEDIUM",
                    status: settings.requestNeedsApproval ? "PENDING" : "APPROVED", requestedBy: s.user.id,
                    ...(settings.requestNeedsApproval ? {} : { decidedBy: s.user.id, decidedAt: new Date(), decisionNote: "No approval needed (settings)" }),
                },
            })
            if (settings.requestNeedsApproval) await note(await usersWith("recruitment.approve"), "Manpower request to approve", `${r.reqNo}: ${headcount} × ${r.position}${r.siteName ? ` at ${r.siteName}` : ""}`, "/recruitment/manage?tab=requests")
            else if (settings.autoCreateJob) await makeJobFromRequest(r.id, s.user.id)
            return r
        } catch (e: any) { if (e?.code !== "P2002") throw e }
    }
    throw new Error("Busy — try again")
}

async function makeJobFromRequest(id: string, userId: string) {
    const r = await prisma.manpowerRequest.findUnique({ where: { id } })
    if (!r || r.jobId) return r?.jobId ?? null
    const job = await prisma.jobPosting.create({
        data: {
            title: r.position, openings: r.headcount, siteId: r.siteId, siteName: r.siteName, jobLocation: r.siteName, salaryMin: r.salaryMin, salaryMax: r.salaryMax,
            deadline: r.neededBy, priority: r.priority, description: r.notes, status: "DRAFT", createdBy: userId,
        },
    })
    await prisma.manpowerRequest.update({ where: { id }, data: { jobId: job.id } })
    return job.id
}

export async function actOnRequest(s: Session, id: string, action: string, b: any) {
    const r = await prisma.manpowerRequest.findUnique({ where: { id } })
    if (!r) throw new Error("Not found")
    const mine = r.requestedBy === s.user.id
    const now = new Date()
    if (action === "approve" || action === "reject") {
        if (!canApprove(s)) throw new Error("Needs Recruitment → Approve")
        if (r.status !== "PENDING") throw new Error("Already decided")
        if (action === "reject" && !String(b?.note ?? "").trim()) throw new Error("Say why it is rejected")
        const u = await prisma.manpowerRequest.update({ where: { id }, data: { status: action === "approve" ? "APPROVED" : "REJECTED", decidedBy: s.user.id, decidedAt: now, decisionNote: b?.note ? String(b.note).slice(0, 1000) : null } })
        if (action === "approve" && (await getRecSettings()).autoCreateJob) await makeJobFromRequest(id, s.user.id)
        await note([r.requestedBy], action === "approve" ? "Manpower request approved" : "Manpower request rejected", `${r.reqNo}: ${r.headcount} × ${r.position}${r.siteName ? ` at ${r.siteName}` : ""}${b?.note ? ` — ${String(b.note).slice(0, 120)}` : ""}`, "/recruitment/manage?tab=requests")
        return u
    }
    if (action === "cancel") {
        if (!(mine || canApprove(s))) throw new Error("Only the requester or an approver can cancel")
        if (!["PENDING", "APPROVED"].includes(r.status)) throw new Error("Already closed")
        return prisma.manpowerRequest.update({ where: { id }, data: { status: "CANCELLED", closedAt: now, decisionNote: b?.note ? String(b.note).slice(0, 1000) : r.decisionNote } })
    }
    if (action === "fill") {
        if (!(canManage(s) || canApprove(s))) throw new Error("Needs Recruitment → Edit")
        return prisma.manpowerRequest.update({ where: { id }, data: { status: "FILLED", closedAt: now } })
    }
    if (action === "reopen") {
        if (!(canManage(s) || canApprove(s))) throw new Error("Needs Recruitment → Edit")
        return prisma.manpowerRequest.update({ where: { id }, data: { status: "APPROVED", closedAt: null } })
    }
    if (action === "makeJob") {
        if (!(canManage(s) || canApprove(s))) throw new Error("Needs Recruitment → Edit")
        if (r.status !== "APPROVED") throw new Error("Approve it first")
        await makeJobFromRequest(id, s.user.id)
        return prisma.manpowerRequest.findUnique({ where: { id } })
    }
    throw new Error("Unknown action")
}

/** Approved requests become FILLED once enough linked candidates have joined. */
export async function closeFilledRequests() {
    const open = await prisma.manpowerRequest.findMany({ where: { status: "APPROVED" }, select: { id: true, headcount: true } })
    const seats = await requestSeats(open.map(o => o.id))
    let n = 0
    for (const o of open) if ((seats.get(o.id)?.joined ?? 0) >= o.headcount) { await prisma.manpowerRequest.update({ where: { id: o.id }, data: { status: "FILLED", closedAt: new Date() } }); n++ }
    return n
}

// ── Stage changes (board drag, drawer, interviews, offers) ───────────────────
export async function setStage(leadId: string, status: string, userId: string, why?: string) {
    const prev = await prisma.lead.findUnique({ where: { id: leadId }, select: { status: true } })
    if (!prev || String(prev.status) === status) return
    await prisma.lead.update({ where: { id: leadId }, data: { status: status as any, stageChangedAt: new Date() } })
    await log(leadId, userId, `Status: ${STAGE_LABEL[String(prev.status)] ?? prev.status} → ${STAGE_LABEL[status] ?? status}${why ? ` (${why})` : ""}`)
}

// ── Interview rounds ─────────────────────────────────────────────────────────
export async function addInterview(s: Session, leadId: string, b: any) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, candidateName: true, position: true, status: true } })
    if (!lead) throw new Error("Candidate not found")
    const when = b?.scheduledAt ? new Date(b.scheduledAt) : null
    if (!when || isNaN(when.getTime())) throw new Error("Pick the interview date and time")
    const last = await prisma.leadInterview.findFirst({ where: { leadId }, orderBy: { round: "desc" }, select: { round: true } })
    const round = (last?.round ?? 0) + 1
    const iv = await prisma.leadInterview.create({
        data: {
            leadId, round, title: String(b?.title || (round === 1 ? "HR round" : round === 2 ? "Technical round" : `Round ${round}`)).slice(0, 80), scheduledAt: when,
            mode: b?.mode ? String(b.mode).slice(0, 40) : null, location: b?.location ? String(b.location).slice(0, 200) : null,
            interviewerId: typeof b?.interviewerId === "string" && b.interviewerId ? b.interviewerId : null, createdBy: s.user.id,
        },
    })
    await prisma.lead.update({ where: { id: leadId }, data: { interviewDate: when, interviewMode: iv.mode, interviewerId: iv.interviewerId } })
    if (STAGE_RANK[String(lead.status)] < STAGE_RANK.INTERVIEW_SCHEDULED || String(lead.status) === "INTERVIEW_DONE") await setStage(leadId, "INTERVIEW_SCHEDULED", s.user.id, iv.title)
    await log(leadId, s.user.id, `${iv.title} scheduled for ${when.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}`, "meeting")
    if (iv.interviewerId && iv.interviewerId !== s.user.id) await note([iv.interviewerId], "Interview assigned to you", `${lead.candidateName} (${lead.position}) — ${iv.title}, ${when.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}`, "/recruitment/manage?tab=interviews")
    return iv
}

export async function updateInterview(s: Session, id: string, b: any) {
    const iv = await prisma.leadInterview.findUnique({ where: { id }, include: { lead: { select: { id: true, status: true, candidateName: true, assignedTo: true } } } })
    if (!iv) throw new Error("Interview not found")
    if (!(canManage(s) || iv.interviewerId === s.user.id)) throw new Error("Only the interviewer or a recruiter can update this")
    const data: any = {}
    if (b?.status && ["SCHEDULED", "DONE", "NO_SHOW", "CANCELLED"].includes(b.status)) { data.status = b.status; if (b.status === "DONE") data.completedAt = new Date() }
    if (b?.result !== undefined) data.result = ["PASS", "FAIL", "HOLD"].includes(b.result) ? b.result : null
    if (b?.feedback !== undefined) data.feedback = b.feedback ? String(b.feedback).slice(0, 3000) : null
    if (b?.scores && typeof b.scores === "object") { const sc: Record<string, number> = {}; for (const [k, v] of Object.entries(b.scores)) { const n = Number(v); if (n >= 1 && n <= 5) sc[String(k).slice(0, 40)] = Math.round(n) } data.scores = sc }
    if (b?.scheduledAt) { const d = new Date(b.scheduledAt); if (!isNaN(d.getTime())) { data.scheduledAt = d; if (!data.status) data.status = "SCHEDULED" } }
    if (b?.interviewerId !== undefined) data.interviewerId = b.interviewerId || null
    const u = await prisma.leadInterview.update({ where: { id }, data })
    if (data.status === "DONE") {
        await prisma.lead.update({ where: { id: iv.leadId }, data: { interviewResult: u.result, interviewFeedback: u.feedback } })
        if (["INTERVIEW_SCHEDULED", "INTERESTED", "CONTACTED", "NEW_LEAD"].includes(String(iv.lead.status))) await setStage(iv.leadId, "INTERVIEW_DONE", s.user.id, `${u.title}${u.result ? `: ${u.result.toLowerCase()}` : ""}`)
        else await log(iv.leadId, s.user.id, `${u.title} done${u.result ? ` — ${u.result.toLowerCase()}` : ""}`, "meeting")
        if (iv.lead.assignedTo && iv.lead.assignedTo !== s.user.id) await note([iv.lead.assignedTo], "Interview feedback in", `${iv.lead.candidateName} — ${u.title}: ${u.result ? u.result.toLowerCase() : "done"}`, "/recruitment")
    } else if (data.status === "NO_SHOW") await log(iv.leadId, s.user.id, `${u.title}: candidate did not come`, "meeting")
    return u
}

export async function listInterviews(s: Session, from: Date, to: Date, mine: boolean) {
    const rows = await prisma.leadInterview.findMany({
        where: { scheduledAt: { gte: from, lt: to }, ...(mine || !canView(s) ? { interviewerId: s.user.id } : {}) },
        orderBy: { scheduledAt: "asc" }, take: 500,
        include: { lead: { select: { id: true, candidateName: true, phone: true, position: true, status: true, assignee: { select: { name: true } } } } },
    })
    const users = await prisma.user.findMany({ where: { id: { in: Array.from(new Set(rows.map(r => r.interviewerId).filter((x): x is string => !!x))) } }, select: { id: true, name: true } })
    const nameOf = new Map(users.map(u => [u.id, u.name]))
    return rows.map(r => ({ ...r, interviewerName: r.interviewerId ? nameOf.get(r.interviewerId) ?? "—" : null }))
}

// ── Offer → personal join link ───────────────────────────────────────────────
export async function makeOffer(s: Session, leadId: string, b: any) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, status: true, position: true, siteId: true, offerToken: true, convertedEmployeeId: true } })
    if (!lead) throw new Error("Candidate not found")
    if (lead.convertedEmployeeId) throw new Error("Already joined")
    const salary = Number(b?.salary)
    const date = b?.joiningDate ? new Date(b.joiningDate) : null
    const siteId = typeof b?.siteId === "string" && b.siteId ? b.siteId : lead.siteId
    const u = await prisma.lead.update({
        where: { id: leadId },
        data: {
            offeredSalary: Number.isFinite(salary) && salary > 0 ? salary : null, offerDesignation: String(b?.designation || lead.position).slice(0, 100),
            offerJoiningDate: date && !isNaN(date.getTime()) ? date : null, siteId, offeredAt: new Date(), offerToken: lead.offerToken ?? randomBytes(12).toString("base64url"),
        },
    })
    if (STAGE_RANK[String(lead.status)] < STAGE_RANK.OFFERED) await setStage(leadId, "OFFERED", s.user.id, `₹${u.offeredSalary ?? "—"}`)
    else await log(leadId, s.user.id, `Offer updated: ${u.offerDesignation}, ₹${u.offeredSalary ?? "—"}`)
    return u
}

/** For the join form: what an offer link pre-fills. */
export async function offerPrefill(token: string) {
    const l = await prisma.lead.findUnique({ where: { offerToken: token }, select: { id: true, candidateName: true, phone: true, email: true, offerDesignation: true, position: true, siteId: true, offerJoiningDate: true, assignedTo: true, createdBy: true, convertedEmployeeId: true } })
    if (!l || l.convertedEmployeeId) return null
    const [firstName, ...rest] = l.candidateName.trim().split(/\s+/)
    return { firstName, lastName: rest.length ? rest[rest.length - 1] : "", middleName: rest.length > 1 ? rest.slice(0, -1).join(" ") : "", phone: l.phone, email: l.email, designation: l.offerDesignation || l.position, siteId: l.siteId, dateOfJoining: l.offerJoiningDate ? l.offerJoiningDate.toISOString().slice(0, 10) : null, hrId: l.assignedTo || l.createdBy }
}

/**
 * The join form was submitted — find the candidate it belongs to (offer link,
 * else an open candidate with the same mobile) so we update that record
 * instead of creating a second one.
 */
export async function findLeadForJoin(offerToken: string | null | undefined, phone: string) {
    if (offerToken) { const l = await prisma.lead.findUnique({ where: { offerToken }, select: { id: true, convertedEmployeeId: true } }); if (l && !l.convertedEmployeeId) return l.id }
    const p = last10(phone)
    if (p.length !== 10) return null
    const rows: { id: string }[] = await prisma.$queryRawUnsafe(`SELECT id FROM "Lead" WHERE right(regexp_replace(phone, '\\D', '', 'g'), 10) = $1 AND "convertedEmployeeId" IS NULL AND status::text NOT IN ('REJECTED','DROPPED') ORDER BY "updatedAt" DESC LIMIT 1`, p)
    return rows[0]?.id ?? null
}

// ── Auto-assign ──────────────────────────────────────────────────────────────
export async function pickRecruiter(settings?: RecruitmentSettings): Promise<string | null> {
    const s = settings ?? await getRecSettings()
    if (!s.autoAssign || !s.recruiterIds.length) return null
    const live = (await prisma.user.findMany({ where: { id: { in: s.recruiterIds }, isActive: true }, select: { id: true } })).map(u => u.id)
    const ids = s.recruiterIds.filter(id => live.includes(id))
    if (!ids.length) return null
    if (s.assignMode === "least_open") {
        const counts = await prisma.lead.groupBy({ by: ["assignedTo"], where: { assignedTo: { in: ids }, status: { notIn: CLOSED_STAGES as any } }, _count: { _all: true } })
        const c = new Map(counts.map(x => [x.assignedTo, x._count._all]))
        return ids.reduce((best, id) => (c.get(id) ?? 0) < (c.get(best) ?? 0) ? id : best, ids[0])
    }
    const rr = await prisma.appSetting.findUnique({ where: { key: "recruitmentRR" } }).catch(() => null)
    const lastIdx = ids.indexOf(rr?.value ?? "")
    const next = ids[(lastIdx + 1) % ids.length]
    await prisma.appSetting.upsert({ where: { key: "recruitmentRR" }, update: { value: next }, create: { key: "recruitmentRR", value: next } }).catch(() => {})
    return next
}

/** Give every open candidate without a recruiter to one (auto-assign rules). */
export async function assignUnassigned(userId: string) {
    const s = await getRecSettings()
    if (!s.recruiterIds.length) throw new Error("Pick the recruiters first (Settings)")
    const rows = await prisma.lead.findMany({ where: { assignedTo: null, status: { notIn: CLOSED_STAGES as any } }, select: { id: true }, orderBy: { createdAt: "asc" }, take: 2000 })
    const forced = { ...s, autoAssign: true }
    const per = new Map<string, number>()
    for (const r of rows) {
        const to = await pickRecruiter(forced)
        if (!to) break
        await prisma.lead.update({ where: { id: r.id }, data: { assignedTo: to } })
        per.set(to, (per.get(to) ?? 0) + 1)
    }
    for (const [to, n] of Array.from(per.entries())) await note([to], "New candidates for you", `${n} candidate(s) were assigned to you.`, "/recruitment")
    void userId
    return { assigned: rows.length, recruiters: per.size }
}

// ── My day / stuck ───────────────────────────────────────────────────────────
function stuckWhere(s: RecruitmentSettings, now: Date) {
    return Object.entries(s.stuckDays).filter(([, d]) => d > 0).map(([status, d]) => ({ status: status as any, stageChangedAt: { lt: new Date(now.getTime() - d * 86_400_000) } }))
}
const IST = 330 * 60_000
function istDayEnd(now: Date) { const t = new Date(now.getTime() + IST); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1) - IST) }
function istDayStart(now: Date) { return new Date(istDayEnd(now).getTime() - 86_400_000) }

export async function myDay(s: Session, everyone: boolean) {
    const settings = await getRecSettings()
    const now = new Date(), end = istDayEnd(now), start = istDayStart(now)
    const all = everyone && (canApprove(s) || s.user.role === "ADMIN")
    const mine = all ? {} : { assignedTo: s.user.id }
    const sel = { id: true, candidateName: true, phone: true, position: true, status: true, stageChangedAt: true, assignee: { select: { name: true } } }
    const [followUps, interviews, stuck, unassigned, offers, newToday] = await Promise.all([
        prisma.leadFollowUp.findMany({ where: { status: "PENDING", scheduledAt: { lt: end }, lead: mine }, orderBy: { scheduledAt: "asc" }, take: 100, include: { lead: { select: sel } } }),
        prisma.leadInterview.findMany({ where: { status: "SCHEDULED", scheduledAt: { gte: start, lt: end }, ...(all ? {} : { OR: [{ interviewerId: s.user.id }, { lead: { assignedTo: s.user.id } }] }) }, orderBy: { scheduledAt: "asc" }, take: 100, include: { lead: { select: sel } } }),
        prisma.lead.findMany({ where: { ...mine, OR: stuckWhere(settings, now) }, orderBy: { stageChangedAt: "asc" }, take: 150, select: sel }),
        canManage(s) ? prisma.lead.count({ where: { assignedTo: null, status: { notIn: CLOSED_STAGES as any } } }) : Promise.resolve(0),
        prisma.lead.findMany({ where: { ...mine, status: "OFFERED" as any, convertedEmployeeId: null }, orderBy: { offeredAt: "asc" }, take: 100, select: { ...sel, offeredAt: true, offerJoiningDate: true, offerToken: true } }),
        prisma.lead.count({ where: { ...mine, createdAt: { gte: start } } }),
    ])
    return { settings: { stuckDays: settings.stuckDays }, followUps, interviews, stuck, unassigned, offers, newToday, everyone: all }
}

/** Daily in-app note to each recruiter: stuck candidates, follow-ups and interviews today. */
export async function recruitmentDaily(now = new Date()) {
    const s = await getRecSettings()
    const filled = await closeFilledRequests().catch(e => { console.error("[REC_FILLED]", e); return 0 })
    if (!s.dailyDigest) return { filled, notified: 0 }
    const end = istDayEnd(now), start = istDayStart(now)
    const [stuck, fus, ivs] = await Promise.all([
        prisma.lead.groupBy({ by: ["assignedTo"], where: { assignedTo: { not: null }, OR: stuckWhere(s, now) }, _count: { _all: true } }),
        prisma.leadFollowUp.findMany({ where: { status: "PENDING", scheduledAt: { lt: end } }, select: { lead: { select: { assignedTo: true } } } }),
        prisma.leadInterview.findMany({ where: { status: "SCHEDULED", scheduledAt: { gte: start, lt: end } }, select: { interviewerId: true, lead: { select: { assignedTo: true } } } }),
    ])
    const per = new Map<string, { stuck: number; fu: number; iv: number }>()
    const bump = (id: string | null | undefined, k: "stuck" | "fu" | "iv", n = 1) => { if (!id) return; const e = per.get(id) ?? { stuck: 0, fu: 0, iv: 0 }; e[k] += n; per.set(id, e) }
    for (const r of stuck) bump(r.assignedTo, "stuck", r._count._all)
    for (const f of fus) bump(f.lead.assignedTo, "fu")
    for (const i of ivs) bump(i.interviewerId ?? i.lead.assignedTo, "iv")
    let notified = 0
    for (const [id, e] of Array.from(per.entries())) {
        const parts = [e.iv ? `${e.iv} interview(s) today` : null, e.fu ? `${e.fu} follow-up(s) due` : null, e.stuck ? `${e.stuck} candidate(s) stuck` : null].filter(Boolean)
        if (!parts.length) continue
        await note([id], "Your recruitment day", parts.join(" · "), "/recruitment/manage")
        notified++
    }
    return { filled, notified }
}

// ── Reports ──
// Stage dates before this were backfilled from the last edit, so days-to-join counts only joins recorded from here on.
const TRACK_FROM = new Date("2026-11-22T00:00:00+05:30")
export async function recruitmentReport(from: Date, to: Date) {
    const range = { gte: from, lte: to }
    const [added, offers, joined, ivDone, sources, funnel, openReqs] = await Promise.all([
        prisma.lead.groupBy({ by: ["assignedTo"], where: { createdAt: range }, _count: { _all: true } }),
        prisma.lead.groupBy({ by: ["assignedTo"], where: { offeredAt: range }, _count: { _all: true } }),
        prisma.lead.findMany({ where: { status: { in: JOINED_STAGES as any }, stageChangedAt: range }, select: { assignedTo: true, source: true, createdAt: true, stageChangedAt: true } }),
        prisma.leadInterview.findMany({ where: { status: "DONE", completedAt: range }, select: { result: true, lead: { select: { assignedTo: true } } } }),
        prisma.lead.groupBy({ by: ["source"], where: { createdAt: range }, _count: { _all: true } }),
        prisma.lead.groupBy({ by: ["status"], where: { createdAt: range }, _count: { _all: true } }),
        prisma.manpowerRequest.findMany({ where: { status: "APPROVED" }, select: { id: true, siteName: true, position: true, headcount: true } }),
    ])
    const ids = Array.from(new Set([...added, ...offers].map(r => r.assignedTo).concat(joined.map(j => j.assignedTo), ivDone.map(i => i.lead.assignedTo)).filter((x): x is string => !!x)))
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    const nameOf = new Map(users.map(u => [u.id, u.name]))
    const rec = new Map<string, { userId: string | null; name: string; added: number; interviews: number; passed: number; offers: number; joined: number; daysToJoin: number[] }>()
    const row = (id: string | null) => { const k = id ?? "none"; let e = rec.get(k); if (!e) { e = { userId: id, name: id ? nameOf.get(id) ?? "—" : "No recruiter", added: 0, interviews: 0, passed: 0, offers: 0, joined: 0, daysToJoin: [] }; rec.set(k, e) } return e }
    for (const a of added) row(a.assignedTo).added += a._count._all
    for (const o of offers) row(o.assignedTo).offers += o._count._all
    for (const i of ivDone) { const e = row(i.lead.assignedTo); e.interviews++; if (i.result === "PASS") e.passed++ }
    for (const j of joined) { const e = row(j.assignedTo); e.joined++; const dd = j.stageChangedAt && j.stageChangedAt >= TRACK_FROM ? (j.stageChangedAt.getTime() - j.createdAt.getTime()) / 86_400_000 : 0; if (dd > 0.05) e.daysToJoin.push(dd) }
    const avg = (a: number[]) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 : null
    const joinedBySource = new Map<string, number>()
    for (const j of joined) joinedBySource.set(canonicalSource(j.source), (joinedBySource.get(canonicalSource(j.source)) ?? 0) + 1)
    const srcMap = new Map<string, number>()
    for (const sRow of sources) srcMap.set(canonicalSource(sRow.source), (srcMap.get(canonicalSource(sRow.source)) ?? 0) + sRow._count._all)
    const seats = await requestSeats(openReqs.map(r => r.id))
    const bySite = new Map<string, { site: string; asked: number; joined: number; inPipeline: number }>()
    for (const r of openReqs) { const k = r.siteName ?? "No site"; const e = bySite.get(k) ?? { site: k, asked: 0, joined: 0, inPipeline: 0 }; e.asked += r.headcount; e.joined += seats.get(r.id)?.joined ?? 0; e.inPipeline += seats.get(r.id)?.inPipeline ?? 0; bySite.set(k, e) }
    return {
        recruiters: Array.from(rec.values()).map(({ daysToJoin, ...r }) => ({ ...r, avgDaysToJoin: avg(daysToJoin), conversion: r.added ? Math.round(r.joined / r.added * 100) : null })).sort((a, b) => b.joined - a.joined || b.added - a.added),
        sources: Array.from(srcMap.entries()).map(([source, n]) => ({ source, added: n, joined: joinedBySource.get(source) ?? 0 })).sort((a, b) => b.added - a.added),
        funnel: funnel.map(f => ({ status: String(f.status), n: f._count._all })),
        avgDaysToJoin: avg(joined.filter(j => j.stageChangedAt && j.stageChangedAt >= TRACK_FROM).map(j => (j.stageChangedAt!.getTime() - j.createdAt.getTime()) / 86_400_000).filter(d => d > 0.05)),
        totals: { added: added.reduce((s, a) => s + a._count._all, 0), interviews: ivDone.length, offers: offers.reduce((s, a) => s + a._count._all, 0), joined: joined.length },
        openSeats: Array.from(bySite.values()).sort((a, b) => (b.asked - b.joined) - (a.asked - a.joined)),
    }
}

// ── Clean-up: duplicates and names ───────────────────────────────────────────
type DupRow = { id: string; candidateName: string; phone: string; status: string; source: string; position: string; createdAt: Date; updatedAt: Date; convertedEmployeeId: string | null; assignedTo: string | null }
function pickKeep(rows: DupRow[]) {
    return [...rows].sort((a, b) => (STAGE_RANK[b.status] ?? 0) - (STAGE_RANK[a.status] ?? 0) || Number(!!b.convertedEmployeeId) - Number(!!a.convertedEmployeeId) || b.updatedAt.getTime() - a.updatedAt.getTime())[0]
}
export async function duplicateGroups() {
    const rows: (DupRow & { k: string })[] = await prisma.$queryRawUnsafe(`
        SELECT id, "candidateName", phone, status::text AS status, source, position, "createdAt", "updatedAt", "convertedEmployeeId", "assignedTo", right(regexp_replace(phone, '\\D', '', 'g'), 10) AS k
          FROM "Lead" WHERE right(regexp_replace(phone, '\\D', '', 'g'), 10) IN (
            SELECT right(regexp_replace(phone, '\\D', '', 'g'), 10) FROM "Lead" WHERE length(regexp_replace(phone, '\\D', '', 'g')) >= 10 GROUP BY 1 HAVING count(*) > 1)
         ORDER BY k, "createdAt"`)
    const groups = new Map<string, DupRow[]>()
    for (const r of rows) { const { k, ...rest } = r; groups.set(k, [...(groups.get(k) ?? []), rest]) }
    return Array.from(groups.entries()).map(([phone, list]) => {
        const keep = pickKeep(list)
        // Two different people converted to two different employees on one number: leave them alone.
        const emps = new Set(list.map(l => l.convertedEmployeeId).filter(Boolean))
        return { phone, keepId: keep.id, conflict: emps.size > 1, rows: list.map(l => ({ ...l, keep: l.id === keep.id })) }
    })
}

const FILL_FIELDS = ["email", "city", "experience", "currentCompany", "qualification", "skills", "expectedSalary", "currentSalary", "resumeUrl", "profileUrl", "gender", "dateOfBirth", "siteId", "assignedTo", "convertedEmployeeId", "jobId", "requestId", "notes"] as const

export async function mergeDuplicates(userId: string, phones?: string[]) {
    const groups = (await duplicateGroups()).filter(g => !g.conflict && (!phones || phones.includes(g.phone)))
    let merged = 0
    for (const g of groups) {
        const keepId = g.keepId
        const removeIds = g.rows.filter(r => !r.keep).map(r => r.id)
        await prisma.$transaction(async tx => {
            const keep = await tx.lead.findUnique({ where: { id: keepId } })
            const others = await tx.lead.findMany({ where: { id: { in: removeIds } }, include: { activities: true, documents: true, followUps: true, interviews: true } })
            const fill: any = {}
            for (const f of FILL_FIELDS) if ((keep as any)?.[f] == null) { const v = others.map(o => (o as any)[f]).find(x => x != null && x !== ""); if (v != null) fill[f] = v }
            if (Object.keys(fill).length) await tx.lead.update({ where: { id: keepId }, data: fill })
            await tx.leadActivity.updateMany({ where: { leadId: { in: removeIds } }, data: { leadId: keepId } })
            await tx.leadDocument.updateMany({ where: { leadId: { in: removeIds } }, data: { leadId: keepId } })
            await tx.leadFollowUp.updateMany({ where: { leadId: { in: removeIds } }, data: { leadId: keepId } })
            await tx.leadInterview.updateMany({ where: { leadId: { in: removeIds } }, data: { leadId: keepId } })
            for (const o of others) await tx.leadMergeLog.create({ data: { id: randomUUID(), keptId: keepId, removedId: o.id, snapshot: JSON.parse(JSON.stringify(o)), mergedBy: userId } })
            await tx.lead.deleteMany({ where: { id: { in: removeIds } } })
            await tx.leadActivity.create({ data: { leadId: keepId, userId, type: "note", content: `Merged ${others.length} duplicate record(s) with the same mobile: ${others.map(o => `${o.candidateName} (${o.source}, ${STAGE_LABEL[String(o.status)] ?? o.status})`).join("; ")}. Copies kept in the merge log.` } })
        }, { timeout: 30_000 })
        merged += removeIds.length
    }
    return { groups: groups.length, removed: merged }
}

/** Spellings to tidy: positions and sources that differ only in case/spaces, plus known source aliases. */
export async function nameFixes() {
    const [pos, src] = await Promise.all([
        prisma.lead.groupBy({ by: ["position"], _count: { _all: true } }),
        prisma.lead.groupBy({ by: ["source"], _count: { _all: true } }),
    ])
    const plan = (rows: { value: string; n: number }[], canon: (v: string) => string) => {
        const byKey = new Map<string, { value: string; n: number }[]>()
        for (const r of rows) { const k = canon(r.value).toLowerCase().replace(/\s+/g, " ").trim(); byKey.set(k, [...(byKey.get(k) ?? []), r]) }
        const out: { to: string; from: { value: string; n: number }[] }[] = []
        for (const list of Array.from(byKey.values())) {
            const top = canon([...list].sort((a, b) => b.n - a.n)[0].value).replace(/\s+/g, " ").trim()
            const best = top === top.toLowerCase() ? titleCase(top) : top
            const from = list.filter(l => l.value !== best)
            if (from.length) out.push({ to: best, from })
        }
        return out.sort((a, b) => b.from.reduce((s, f) => s + f.n, 0) - a.from.reduce((s, f) => s + f.n, 0))
    }
    return {
        positions: plan(pos.map(p => ({ value: p.position, n: p._count._all })), titleCase),
        sources: plan(src.map(p => ({ value: p.source, n: p._count._all })), v => canonicalSource(v.replace(/\s+/g, " "))),
    }
}
export async function applyNameFixes() {
    const f = await nameFixes()
    let n = 0
    for (const p of f.positions) for (const x of p.from) n += (await prisma.lead.updateMany({ where: { position: x.value }, data: { position: p.to } })).count
    for (const p of f.sources) for (const x of p.from) n += (await prisma.lead.updateMany({ where: { source: x.value }, data: { source: p.to } })).count
    return { updated: n }
}
