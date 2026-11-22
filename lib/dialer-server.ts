// Call Dialer — server side: settings, phone pairing (device tokens), matching a
// number to a sales lead / candidate / employee, storing synced calls, outcomes,
// click-to-call requests and the performance numbers behind the dashboard.
import crypto from "crypto"
import prisma from "@/lib/prisma"
import { has, type Access } from "@/lib/access"
import { sanitizeSettings, phoneKey, cleanPhone, DEFAULT_OUTCOMES, OPEN_STAGES, STAGES, type DialerSettings, type TargetType, type Stage } from "@/lib/dialer"

const KEY = "dialerSettings"

export async function getDialerSettings(): Promise<DialerSettings> {
    try { const r = await prisma.appSetting.findUnique({ where: { key: KEY } }); return sanitizeSettings(r?.value ? JSON.parse(r.value) : {}) } catch { return sanitizeSettings({}) }
}
export async function saveDialerSettings(v: unknown, userId: string) {
    const s = sanitizeSettings(v)
    await prisma.appSetting.upsert({ where: { key: KEY }, update: { value: JSON.stringify(s), updatedBy: userId }, create: { key: KEY, value: JSON.stringify(s), updatedBy: userId } })
    return s
}

// ─── Who may do what ─────────────────────────────────────────────────────────
// dialer.create = use the dialer (pair a phone, click-to-call, own calls and sales leads)
// dialer.view   = team dashboard, live view and everyone's calls
// dialer.edit   = edit / reassign any sales lead, settings
// dialer.export = download calls / leads
// Recruiters (recruitment.view) and HR (employees.view) can also click-to-call their own people.
export const canUse = (a: Access) => a.isAdmin || has(a, "dialer.create") || has(a, "dialer.view") || has(a, "recruitment.view") || has(a, "employees.view")
export const canSeeTeam = (a: Access) => a.isAdmin || has(a, "dialer.view")
export const canEditAny = (a: Access) => a.isAdmin || has(a, "dialer.edit")
export const canSales = (a: Access) => a.isAdmin || has(a, "dialer.create") || has(a, "dialer.view") || has(a, "dialer.edit")

// ─── Device tokens ───────────────────────────────────────────────────────────
const hash = (t: string) => crypto.createHash("sha256").update(t).digest("hex")

/** Pair a phone to the signed-in login. Returns the raw token once (the phone keeps it); only its hash is stored. */
export async function pairDevice(userId: string, info: { deviceName?: string; appVersion?: string; simNumber?: string }) {
    const token = "gd_" + crypto.randomBytes(32).toString("base64url")
    // One active phone per login: pairing again replaces the old one.
    await prisma.dialerDevice.updateMany({ where: { userId, active: true }, data: { active: false } })
    const d = await prisma.dialerDevice.create({ data: { userId, tokenHash: hash(token), deviceName: info.deviceName?.slice(0, 80) || null, appVersion: info.appVersion?.slice(0, 20) || null, simNumber: info.simNumber ? cleanPhone(info.simNumber).slice(0, 20) : null, lastSeenAt: new Date() } })
    return { token, deviceId: d.id }
}

/** The paired phone behind an `X-Dialer-Token` header, if it is still active and its login is active. */
export async function deviceFrom(req: Request) {
    const t = req.headers.get("x-dialer-token") || ""
    if (!t.startsWith("gd_")) return null
    const d = await prisma.dialerDevice.findUnique({ where: { tokenHash: hash(t) } })
    if (!d || !d.active) return null
    const u = await prisma.user.findUnique({ where: { id: d.userId }, select: { id: true, name: true, isActive: true } })
    if (!u?.isActive) return null
    return { device: d, user: u }
}

// ─── Matching a number ───────────────────────────────────────────────────────
type Match = { type: TargetType; id: string; name: string }
/** For each phoneKey: the sales lead / candidate / employee it belongs to. The caller's own leads and candidates win. */
export async function matchNumbers(keys: string[], userId: string): Promise<Map<string, Match>> {
    const out = new Map<string, Match>()
    const ks = Array.from(new Set(keys.filter(k => k.length >= 6)))
    if (!ks.length) return out
    const put = (k: string, m: Match, force = false) => { if (force || !out.has(k)) out.set(k, m) }
    const sales = await prisma.salesLead.findMany({ where: { phoneKey: { in: ks } }, select: { id: true, contactName: true, company: true, phoneKey: true, assignedTo: true }, orderBy: { updatedAt: "desc" } })
    const cands: { id: string; candidateName: string; k: string; assignedTo: string | null }[] = await prisma.$queryRawUnsafe(
        `SELECT id, "candidateName", right(regexp_replace(phone, '\\D', '', 'g'), 10) AS k, "assignedTo" FROM "Lead" WHERE right(regexp_replace(phone, '\\D', '', 'g'), 10) = ANY($1::text[]) ORDER BY "updatedAt" DESC`, ks)
    const emps: { id: string; name: string; k: string; k2: string | null }[] = await prisma.$queryRawUnsafe(
        `SELECT id, trim("firstName" || ' ' || coalesce("lastName", '')) AS name, right(regexp_replace(phone, '\\D', '', 'g'), 10) AS k, right(regexp_replace(coalesce("alternatePhone", ''), '\\D', '', 'g'), 10) AS k2
         FROM "Employee" WHERE right(regexp_replace(phone, '\\D', '', 'g'), 10) = ANY($1::text[]) OR right(regexp_replace(coalesce("alternatePhone", ''), '\\D', '', 'g'), 10) = ANY($1::text[])`, ks)
    // Lowest priority first, so later "force" puts win.
    for (const e of emps) { if (ks.includes(e.k)) put(e.k, { type: "EMPLOYEE", id: e.id, name: e.name }); if (e.k2 && ks.includes(e.k2)) put(e.k2, { type: "EMPLOYEE", id: e.id, name: e.name }) }
    for (const c of cands) put(c.k, { type: "CANDIDATE", id: c.id, name: c.candidateName }, !out.has(c.k) || out.get(c.k)!.type === "EMPLOYEE" ? true : false)
    for (const s of sales) put(s.phoneKey, { type: "SALES_LEAD", id: s.id, name: s.company ? `${s.contactName} (${s.company})` : s.contactName }, out.get(s.phoneKey)?.type !== "CANDIDATE" || s.assignedTo === userId)
    // The caller's own candidates beat someone else's sales lead.
    for (const c of cands) if (c.assignedTo === userId && out.get(c.k)?.type !== "SALES_LEAD") out.set(c.k, { type: "CANDIDATE", id: c.id, name: c.candidateName })
    return out
}

export async function targetName(type: string, id: string | null | undefined): Promise<string | null> {
    if (!id) return null
    if (type === "SALES_LEAD") { const s = await prisma.salesLead.findUnique({ where: { id }, select: { contactName: true, company: true } }); return s ? (s.company ? `${s.contactName} (${s.company})` : s.contactName) : null }
    if (type === "CANDIDATE") return (await prisma.lead.findUnique({ where: { id }, select: { candidateName: true } }))?.candidateName ?? null
    if (type === "EMPLOYEE") { const e = await prisma.employee.findUnique({ where: { id }, select: { firstName: true, lastName: true } }); return e ? `${e.firstName} ${e.lastName ?? ""}`.trim() : null }
    return null
}

// ─── Click-to-call ───────────────────────────────────────────────────────────
const REQUEST_TTL_MS = 2 * 60_000

export async function createDialRequest(a: Access, b: { phone?: string; targetType?: string; targetId?: string }) {
    const phone = cleanPhone(b.phone)
    if (phoneKey(phone).length < 6) throw new Error("This number doesn't look right")
    const device = await prisma.dialerDevice.findFirst({ where: { userId: a.userId, active: true }, orderBy: { createdAt: "desc" } })
    if (!device) throw new Error("No phone paired yet — open Call Dialer → My phone and pair your phone first")
    const type = (b.targetType && ["SALES_LEAD", "CANDIDATE", "EMPLOYEE"].includes(b.targetType) ? b.targetType : "UNKNOWN") as TargetType
    let name = type !== "UNKNOWN" ? await targetName(type, b.targetId) : null
    let targetId = name ? b.targetId! : null
    let tType: TargetType = name ? type : "UNKNOWN"
    if (!name) { const m = (await matchNumbers([phoneKey(phone)], a.userId)).get(phoneKey(phone)); if (m) { tType = m.type; targetId = m.id; name = m.name } }
    // A new click replaces anything still waiting.
    await prisma.dialRequest.updateMany({ where: { userId: a.userId, status: "PENDING" }, data: { status: "CANCELLED" } })
    const r = await prisma.dialRequest.create({ data: { userId: a.userId, phone, targetType: tType, targetId, targetName: name, deviceId: device.id } })
    const online = !!device.lastSeenAt && Date.now() - device.lastSeenAt.getTime() < 90_000
    return { request: r, deviceName: device.deviceName, online }
}

/** Requests waiting for this phone (newest only — older ones expire). */
export async function pendingFor(userId: string) {
    await prisma.dialRequest.updateMany({ where: { userId, status: "PENDING", createdAt: { lt: new Date(Date.now() - REQUEST_TTL_MS) } }, data: { status: "EXPIRED" } })
    return prisma.dialRequest.findFirst({ where: { userId, status: "PENDING" }, orderBy: { createdAt: "desc" }, select: { id: true, phone: true, targetType: true, targetName: true, createdAt: true } })
}

// ─── Storing synced calls ────────────────────────────────────────────────────
export type IncomingCall = { number: string; direction: string; startedAt: number; durationSec: number }

export async function ingestCalls(userId: string, deviceId: string | null, calls: IncomingCall[]) {
    const s = await getDialerSettings()
    const rows = calls.slice(0, 500).map(c => {
        const phone = cleanPhone(c.number), k = phoneKey(phone)
        const dir = ["OUTGOING", "INCOMING", "MISSED", "REJECTED"].includes(String(c.direction)) ? String(c.direction) : "OUTGOING"
        const startedAt = new Date(Number(c.startedAt))
        const durationSec = Math.max(0, Math.min(6 * 3600, Math.round(Number(c.durationSec) || 0)))
        return { phone, k, dir, startedAt, durationSec }
    }).filter(r => r.k.length >= 6 && !isNaN(r.startedAt.getTime()) && r.startedAt.getTime() > Date.now() - 40 * 86400_000 && r.startedAt.getTime() < Date.now() + 3600_000)
        .filter(r => s.syncIncoming || r.dir === "OUTGOING")
    if (!rows.length) return { saved: 0, skipped: calls.length, needOutcome: [] as { id: string; name: string }[] }
    const matches = await matchNumbers(rows.map(r => r.k), userId)
    // Open click-to-call requests to tie a call to the record it was dialled from.
    const reqs = await prisma.dialRequest.findMany({ where: { userId, status: { in: ["PENDING", "DIALING"] }, createdAt: { gt: new Date(Date.now() - 6 * 3600_000) } }, orderBy: { createdAt: "asc" } })
    let saved = 0
    const needOutcome: { id: string; name: string }[] = []
    const known = new Set((await prisma.callLog.findMany({ where: { callKey: { in: rows.map(r => `${userId}:${r.startedAt.getTime()}:${r.k}`) } }, select: { callKey: true } })).map(x => x.callKey))
    for (const r of rows) {
        const req = r.dir === "OUTGOING" ? reqs.find(q => phoneKey(q.phone) === r.k && Math.abs(q.createdAt.getTime() - r.startedAt.getTime()) < 5 * 60_000) : undefined
        const m = req?.targetId ? { type: req.targetType as TargetType, id: req.targetId, name: req.targetName ?? "" } : matches.get(r.k)
        if (!m && !s.syncUnknown) continue
        const connected = (r.dir === "OUTGOING" || r.dir === "INCOMING") && r.durationSec >= s.minConnectedSec
        const callKey = `${userId}:${r.startedAt.getTime()}:${r.k}`
        const row = await prisma.callLog.upsert({
            where: { callKey },
            update: { durationSec: r.durationSec, connected, direction: r.dir },
            create: { userId, deviceId, callKey, phone: r.phone, phoneKey: r.k, direction: r.dir, connected, startedAt: r.startedAt, durationSec: r.durationSec, targetType: m?.type ?? "UNKNOWN", targetId: m?.id ?? null, targetName: m?.name || null, dialRequestId: req?.id ?? null },
            select: { id: true, targetType: true, targetId: true, targetName: true },
        })
        if (req) { await prisma.dialRequest.update({ where: { id: req.id }, data: { status: "DONE", callLogId: row.id } }).catch(() => {}); reqs.splice(reqs.indexOf(req), 1) }
        const isNew = !known.has(callKey)
        known.add(callKey)
        if (isNew) saved++
        if (isNew && connected && row.targetType !== "UNKNOWN" && Date.now() - r.startedAt.getTime() < 6 * 3600_000) needOutcome.push({ id: row.id, name: row.targetName || r.phone })
        if (isNew && row.targetType === "SALES_LEAD" && row.targetId) {
            if (r.dir === "OUTGOING") await prisma.salesLead.update({ where: { id: row.targetId }, data: { lastCalledAt: r.startedAt, callCount: { increment: 1 } } }).catch(() => {})
        }
        if (isNew && connected && row.targetType === "SALES_LEAD" && row.targetId) await prisma.salesLead.updateMany({ where: { id: row.targetId, stage: "NEW" }, data: { stage: "CONTACTED" } }).catch(() => {})
    }
    if (deviceId) await prisma.dialerDevice.update({ where: { id: deviceId }, data: { lastSyncAt: new Date() } }).catch(() => {})
    return { saved, skipped: calls.length - saved, needOutcome }
}

/** How often the phone should check in: fast in working hours (click-to-call answers within seconds), slow outside them. */
export function pollMs(s: DialerSettings, now = new Date()): number {
    const ist = new Date(now.getTime() + 5.5 * 3600_000)
    const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes()
    const [a, b] = [s.workStart, s.workEnd].map(t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)))
    const working = ist.getUTCDay() !== 0 && mins >= a - 30 && mins <= b + 60
    return working ? 4000 : 60000
}

// ─── Outcome after a call ────────────────────────────────────────────────────
const STAGE_ORDER: Stage[] = ["NEW", "CONTACTED", "INTERESTED", "MEETING", "PROPOSAL", "WON"]

export async function saveOutcome(a: Access, callId: string, b: { outcome?: string; notes?: string; followUpAt?: string | null; stage?: string }) {
    const call = await prisma.callLog.findUnique({ where: { id: callId } })
    if (!call) throw new Error("Call not found")
    if (call.userId !== a.userId && !canEditAny(a)) throw new Error("You can only update your own calls")
    const s = await getDialerSettings()
    const out = b.outcome ? (s.outcomes.find(o => o.key === b.outcome) ?? DEFAULT_OUTCOMES.find(o => o.key === b.outcome)) : undefined
    if (b.outcome && !out) throw new Error("Pick an outcome from the list")
    const followUpAt = b.followUpAt ? new Date(b.followUpAt) : null
    if (followUpAt && isNaN(followUpAt.getTime())) throw new Error("Pick a valid follow-up date")
    const notes = b.notes != null ? String(b.notes).slice(0, 2000) : call.notes
    const updated = await prisma.callLog.update({ where: { id: callId }, data: { outcome: out?.key ?? call.outcome, notes, followUpAt: b.followUpAt === undefined ? call.followUpAt : followUpAt } })
    const line = `${call.direction === "INCOMING" ? "Incoming" : "Call"} ${call.connected ? `(${Math.round(call.durationSec / 60 * 10) / 10} min)` : "(not connected)"}${out ? ` — ${out.label}` : ""}${notes ? `: ${notes}` : ""}`
    if (call.targetType === "SALES_LEAD" && call.targetId) {
        const lead = await prisma.salesLead.findUnique({ where: { id: call.targetId }, select: { stage: true, notes: true } })
        if (lead) {
            let stage = lead.stage as Stage
            const want = (b.stage && b.stage in STAGES ? b.stage : out?.stage) as Stage | undefined
            if (want === "LOST" || want === "WON" || (b.stage && b.stage in STAGES)) stage = want!
            else if (want && STAGE_ORDER.indexOf(want) > STAGE_ORDER.indexOf(stage) && OPEN_STAGES.includes(stage)) stage = want
            const stamp = new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })
            await prisma.salesLead.update({ where: { id: call.targetId }, data: {
                stage, lastOutcome: out?.label ?? undefined, ...(b.followUpAt !== undefined ? { nextFollowUp: followUpAt } : {}),
                ...(stage === "WON" && lead.stage !== "WON" ? { wonAt: new Date() } : {}),
                ...(notes && notes !== call.notes ? { notes: `[${stamp}] ${notes}${lead.notes ? `\n${lead.notes}` : ""}`.slice(0, 8000) } : {}),
            } })
        }
    }
    if (call.targetType === "CANDIDATE" && call.targetId) {
        await prisma.leadActivity.create({ data: { leadId: call.targetId, userId: a.userId, type: "call", content: line.slice(0, 2000) } }).catch(() => {})
        if (b.followUpAt !== undefined) await prisma.lead.update({ where: { id: call.targetId }, data: { nextFollowUp: followUpAt } }).catch(() => {})
    }
    return updated
}

// ─── Performance numbers ─────────────────────────────────────────────────────
export type CallerStats = {
    userId: string; name: string; dialed: number; connected: number; incoming: number; missed: number
    talkSec: number; avgTalkSec: number; uniqueNumbers: number; firstCall: string | null; lastCall: string | null
    positive: number; withOutcome: number; salesCalls: number; candidateCalls: number; employeeCalls: number
    overdueFollowUps: number; score: number; days: number
}

/** Working days in [from, to) — Sundays off. At least 1. */
function workDays(from: Date, to: Date) {
    let n = 0
    for (let d = new Date(from); d < to; d = new Date(d.getTime() + 86400_000)) if (new Date(d.getTime() + 5.5 * 3600_000).getUTCDay() !== 0) n++
    return Math.max(1, n)
}

export async function callerStats(from: Date, to: Date, userIds: string[] | null): Promise<{ rows: CallerStats[]; hourly: number[]; daily: { day: string; dialed: number; connected: number; talkMin: number }[]; outcomes: { key: string; label: string; n: number }[]; settings: DialerSettings }> {
    const s = await getDialerSettings()
    const where: any = { startedAt: { gte: from, lt: to }, ...(userIds ? { userId: { in: userIds } } : {}) }
    const calls = await prisma.callLog.findMany({ where, select: { userId: true, direction: true, connected: true, durationSec: true, startedAt: true, phoneKey: true, outcome: true, targetType: true }, orderBy: { startedAt: "asc" }, take: 100000 })
    const positive = new Set(s.outcomes.filter(o => o.positive).map(o => o.key))
    const by = new Map<string, any>()
    const hourly = Array(24).fill(0)
    const daily = new Map<string, { dialed: number; connected: number; talkSec: number }>()
    const oc = new Map<string, number>()
    for (const c of calls) {
        let r = by.get(c.userId)
        if (!r) { r = { dialed: 0, connected: 0, incoming: 0, missed: 0, talkSec: 0, nums: new Set<string>(), first: null, last: null, positive: 0, withOutcome: 0, salesCalls: 0, candidateCalls: 0, employeeCalls: 0 }; by.set(c.userId, r) }
        const ist = new Date(c.startedAt.getTime() + 5.5 * 3600_000)
        const day = ist.toISOString().slice(0, 10)
        const dd = daily.get(day) ?? { dialed: 0, connected: 0, talkSec: 0 }; daily.set(day, dd)
        if (c.direction === "OUTGOING") { r.dialed++; dd.dialed++; hourly[ist.getUTCHours()]++ }
        if (c.direction === "INCOMING") r.incoming++
        if (c.direction === "MISSED" || c.direction === "REJECTED") r.missed++
        if (c.connected) { r.connected += c.direction === "OUTGOING" ? 1 : 0; r.talkSec += c.durationSec; dd.talkSec += c.durationSec; if (c.direction === "OUTGOING") dd.connected++ }
        r.nums.add(c.phoneKey)
        r.first = r.first ?? c.startedAt; r.last = new Date(c.startedAt.getTime() + c.durationSec * 1000)
        if (c.outcome) { r.withOutcome++; oc.set(c.outcome, (oc.get(c.outcome) ?? 0) + 1); if (positive.has(c.outcome)) r.positive++ }
        if (c.targetType === "SALES_LEAD") r.salesCalls++; else if (c.targetType === "CANDIDATE") r.candidateCalls++; else if (c.targetType === "EMPLOYEE") r.employeeCalls++
    }
    const ids = userIds ?? Array.from(by.keys())
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    const now = new Date()
    const [salesOver, candOver] = await Promise.all([
        prisma.salesLead.groupBy({ by: ["assignedTo"], where: { assignedTo: { in: ids }, stage: { in: OPEN_STAGES }, nextFollowUp: { lt: now } }, _count: true }),
        prisma.lead.groupBy({ by: ["assignedTo"], where: { assignedTo: { in: ids }, nextFollowUp: { lt: now }, status: { notIn: ["JOINED", "ON_SITE_JOINED", "REJECTED", "DROPPED"] as any } }, _count: true }).catch(() => [] as any[]),
    ])
    const over = new Map<string, number>()
    for (const g of [...salesOver, ...candOver] as any[]) if (g.assignedTo) over.set(g.assignedTo, (over.get(g.assignedTo) ?? 0) + (g._count ?? 0))
    const days = workDays(from, to)
    const pct = (v: number, t: number) => t > 0 ? Math.min(1, v / (t * days)) : 1
    const rows: CallerStats[] = users.map(u => {
        const r = by.get(u.id) ?? { dialed: 0, connected: 0, incoming: 0, missed: 0, talkSec: 0, nums: new Set(), first: null, last: null, positive: 0, withOutcome: 0, salesCalls: 0, candidateCalls: 0, employeeCalls: 0 }
        const score = Math.round(100 * (0.4 * pct(r.dialed, s.targetCalls) + 0.3 * pct(r.connected, s.targetConnected) + 0.3 * pct(r.talkSec / 60, s.targetTalkMin)))
        return {
            userId: u.id, name: u.name, dialed: r.dialed, connected: r.connected, incoming: r.incoming, missed: r.missed, talkSec: r.talkSec,
            avgTalkSec: r.connected + r.incoming ? Math.round(r.talkSec / Math.max(1, r.connected + r.incoming)) : 0, uniqueNumbers: r.nums.size,
            firstCall: r.first?.toISOString() ?? null, lastCall: r.last?.toISOString() ?? null, positive: r.positive, withOutcome: r.withOutcome,
            salesCalls: r.salesCalls, candidateCalls: r.candidateCalls, employeeCalls: r.employeeCalls, overdueFollowUps: over.get(u.id) ?? 0, score, days,
        }
    }).sort((x, y) => y.score - x.score || y.talkSec - x.talkSec)
    const labels = new Map(s.outcomes.map(o => [o.key, o.label]))
    return {
        rows, hourly, settings: s,
        daily: Array.from(daily.entries()).sort().map(([day, v]) => ({ day, dialed: v.dialed, connected: v.connected, talkMin: Math.round(v.talkSec / 60) })),
        outcomes: Array.from(oc.entries()).map(([key, n]) => ({ key, label: labels.get(key) ?? key, n })).sort((x, y) => y.n - x.n),
    }
}

/** Everyone who has used the dialer (a paired phone or a call) — the team list. */
export async function dialerUserIds(): Promise<string[]> {
    const [d, c] = await Promise.all([
        prisma.dialerDevice.findMany({ where: { active: true }, select: { userId: true } }),
        prisma.callLog.findMany({ where: { startedAt: { gt: new Date(Date.now() - 60 * 86400_000) } }, distinct: ["userId"], select: { userId: true } }),
    ])
    return Array.from(new Set([...d, ...c].map(x => x.userId)))
}

/** Live view: per paired phone — online, on a call now, minutes since the last call ended. */
export async function liveStatus() {
    const s = await getDialerSettings()
    const devices = await prisma.dialerDevice.findMany({ where: { active: true }, select: { id: true, userId: true, deviceName: true, lastSeenAt: true, lastSyncAt: true, onCall: true, onCallSince: true, callPhone: true } })
    const users = await prisma.user.findMany({ where: { id: { in: devices.map(d => d.userId) } }, select: { id: true, name: true } })
    const nameOf = new Map(users.map(u => [u.id, u.name]))
    const lastCalls: { userId: string; endAt: Date }[] = devices.length ? await prisma.$queryRawUnsafe(
        `SELECT DISTINCT ON ("userId") "userId", "startedAt" + ("durationSec" * interval '1 second') AS "endAt" FROM "CallLog" WHERE "userId" = ANY($1::text[]) AND "startedAt" > now() - interval '1 day' ORDER BY "userId", "startedAt" DESC`, devices.map(d => d.userId)) : []
    const lastOf = new Map(lastCalls.map(l => [l.userId, new Date(l.endAt)]))
    const now = Date.now()
    return devices.map(d => {
        const online = !!d.lastSeenAt && now - d.lastSeenAt.getTime() < 3 * 60_000
        const last = lastOf.get(d.userId) ?? null
        const idleMin = last ? Math.round((now - last.getTime()) / 60_000) : null
        const state = !online ? "OFFLINE" : d.onCall ? "ON_CALL" : idleMin != null && idleMin < s.idleAfterMin ? "ACTIVE" : "IDLE"
        return { userId: d.userId, name: nameOf.get(d.userId) ?? "—", deviceName: d.deviceName, state, onCallSince: d.onCall ? d.onCallSince : null, callPhone: d.onCall ? d.callPhone : null, lastCallEnd: last, idleMin, lastSeenAt: d.lastSeenAt, lastSyncAt: d.lastSyncAt }
    }).sort((a, b) => a.name.localeCompare(b.name))
}
