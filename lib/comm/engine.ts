import crypto from "crypto"
import prisma from "@/lib/prisma"
import { COMPANY } from "@/lib/company"
import { isMissingTableErr } from "@/lib/asset-workflow"
import { COMM_EVENT_MAP, fillTemplate, type Channel, type CommEvent } from "@/lib/comm/events"
import { getCommSettings, defaultChannels, type CommSettings } from "@/lib/comm/settings"
import { buildAttachment } from "@/lib/comm/attachments"
import { sendTemplate, uploadMedia, waPhone } from "@/lib/whatsapp"
import { sendEmail, emailLayout } from "@/lib/mailer"

// Communication Center engine.
//
//   notify("leave_decision", [recipient], { leaveType, dates, decision })
//
// queues one CommMessage per recipient per channel switched on for that event
// (Settings → Communication), then sends what it can right away within a time
// budget. Anything left — waiting for quiet hours to end, a retry after a
// failure, or a big batch — is picked up by the next notify(), the worker
// (/api/comm/worker) or "Process queue now" on the settings page.

export type Recipient = {
    type: "employee" | "customer" | "user"
    id?: string | null
    name: string
    phone?: string | null
    email?: string | null
    /** Login, for in-app notifications. */
    userId?: string | null
    /** Values for this person only (their amount, their dates…), on top of the shared data. */
    data?: Record<string, unknown>
}
export type NotifyOpts = {
    refType?: string | null
    refId?: string | null
    createdBy?: string | null
    /** Page the in-app notification opens. */
    link?: string | null
    /** Only these channels (still subject to the event's switches unless force). */
    channels?: Channel[]
    /** Send on the given channels even if the event is switched off — tests and manual "Send" buttons. */
    force?: boolean
    /** Send now within this many ms (default 8000); 0 = queue only. */
    budgetMs?: number
}
export type NotifyResult = { queued: number; skipped: number; sent: number; failed: number; ids: string[] }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_ATTEMPTS = 3
const appUrl = () => process.env.NEXTAUTH_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || null

/** Minutes since midnight in India. */
function istMinutes(d = new Date()) {
    const t = new Date(d.getTime() + 330 * 60_000)
    return t.getUTCHours() * 60 + t.getUTCMinutes()
}
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/** When a quiet-hours message may go: now, or the end of quiet hours. */
function afterQuietHours(s: CommSettings, now = new Date()): Date {
    if (!s.quietStart || !s.quietEnd || s.quietStart === s.quietEnd) return now
    const n = istMinutes(now), a = toMin(s.quietStart), b = toMin(s.quietEnd)
    const quiet = a < b ? n >= a && n < b : n >= a || n < b
    if (!quiet) return now
    const wait = (b - n + 1440) % 1440
    return new Date(now.getTime() + wait * 60_000)
}

function withDefaults(ev: CommEvent, data: Record<string, unknown>) {
    const out: Record<string, string> = { company: COMPANY.legalName }
    for (const v of ev.vars) if (v.key !== "company") out[v.key] = ""
    for (const [k, v] of Object.entries(data)) if (v !== undefined && v !== null) out[k] = String(v)
    return out
}

function addressFor(channel: Channel, r: Recipient): string | null {
    if (channel === "whatsapp") return waPhone(r.phone)
    if (channel === "email") { const e = r.email?.trim().toLowerCase(); return e && EMAIL_RE.test(e) ? e : null }
    return r.userId || null
}

export async function notify(eventKey: string, recipients: Recipient[], data: Record<string, unknown>, opts: NotifyOpts = {}): Promise<NotifyResult> {
    const ev = COMM_EVENT_MAP.get(eventKey)
    if (!ev) throw new Error(`Unknown event ${eventKey}`)
    const settings = await getCommSettings()
    const cfg = settings.events[ev.key] ?? defaultChannels(ev)
    // Events whose module already puts a notification in the bell never add a
    // second one (only a forced test does).
    const channels = (["whatsapp", "email", "inapp"] as Channel[]).filter(c =>
        (!opts.channels || opts.channels.includes(c)) && (opts.force ? !!opts.channels?.includes(c) : cfg[c].enabled && !(c === "inapp" && ev.inappBuiltIn)))
    if (!channels.length || !recipients.length) return { queued: 0, skipped: 0, sent: 0, failed: 0, ids: [] }

    // Opt-outs for every address in this batch, in one query.
    const pairs = channels.flatMap(c => recipients.map(r => ({ c, a: addressFor(c, r) }))).filter(x => x.a && x.c !== "inapp") as { c: Channel; a: string }[]
    const opted = new Set<string>()
    try {
        if (pairs.length) {
            const rows = await prisma.commOptOut.findMany({ where: { OR: pairs.map(p => ({ channel: p.c, address: p.a })) }, select: { channel: true, address: true } })
            for (const o of rows) opted.add(`${o.channel}|${o.address}`)
        }
    } catch (e) { if (!isMissingTableErr(e)) throw e }

    const now = new Date()
    const quietUntil = afterQuietHours(settings, now)
    const rows: any[] = []
    let skipped = 0
    const varsFor = (r: Recipient) => withDefaults(ev, { name: (r.name || "").trim().split(/\s+/)[0] || r.name, ...data, ...(r.data ?? {}) })
    for (const c of channels) {
        for (const r of recipients) {
            const vars = varsFor(r)
            const address = addressFor(c, r)
            let status = "queued", error: string | null = null
            if (!address) { status = "skipped"; error = c === "whatsapp" ? "No valid mobile number" : c === "email" ? "No valid email" : "No app login" }
            else if (opted.has(`${c}|${address}`)) { status = "skipped"; error = "Opted out" }
            if (status === "skipped") skipped++
            rows.push({
                id: crypto.randomUUID(), channel: c, event: ev.key,
                recipientType: r.type, recipientId: r.id ?? null, recipientName: r.name || null,
                toAddress: address ?? (c === "whatsapp" ? String(r.phone ?? "") : c === "email" ? String(r.email ?? "") : ""),
                subject: fillTemplate(cfg.email.subject, vars).slice(0, 300),
                template: c === "whatsapp" ? `${cfg.whatsapp.template}|${cfg.whatsapp.language}` : null,
                data: { ...vars, ...(opts.link ? { _link: opts.link } : {}) },
                refType: opts.refType ?? null, refId: opts.refId ?? null, createdBy: opts.createdBy ?? null,
                status, error,
                nextAttemptAt: c === "whatsapp" && ev.respectQuietHours && r.type === "employee" ? quietUntil : now,
            })
        }
    }
    try {
        await prisma.commMessage.createMany({ data: rows })
    } catch (e) {
        if (isMissingTableErr(e)) throw new Error("Communication tables are not created yet (scripts/comm.sql)")
        throw e
    }
    const ids = rows.filter(r => r.status === "queued").map(r => r.id)
    const budget = opts.budgetMs ?? 8000
    const res = budget > 0 && ids.length ? await processQueue({ ids, budgetMs: budget }) : { sent: 0, failed: 0 }
    return { queued: ids.length, skipped, sent: res.sent, failed: res.failed, ids: rows.map(r => r.id) }
}

/** Sends due messages (optionally only `ids`) until the time budget runs out. */
export async function processQueue({ ids, createdBy, budgetMs = 20_000, limit = 200 }: { ids?: string[]; createdBy?: string; budgetMs?: number; limit?: number } = {}) {
    const started = Date.now()
    let sent = 0, failed = 0, processed = 0
    // A send that died half-way (timeout) left its row "sending": retry it.
    await prisma.commMessage.updateMany({ where: { status: "sending", updatedAt: { lt: new Date(Date.now() - 10 * 60_000) } }, data: { status: "queued" } }).catch(() => {})
    const due = await prisma.commMessage.findMany({
        where: { status: "queued", nextAttemptAt: { lte: new Date() }, ...(ids ? { id: { in: ids } } : {}), ...(createdBy ? { createdBy } : {}) },
        orderBy: { createdAt: "asc" }, take: limit,
    })
    if (!due.length) return { sent, failed, processed, remaining: 0 }
    const settings = await getCommSettings()
    for (const m of due) {
        if (Date.now() - started > budgetMs) break
        // Claim it, so two workers never send the same message twice.
        const claim = await prisma.commMessage.updateMany({ where: { id: m.id, status: "queued" }, data: { status: "sending" } })
        if (!claim.count) continue
        processed++
        const r = await sendOne(m, settings).catch((e: any) => ({ ok: false as const, error: e?.message || "Error", permanent: false }))
        if (r.ok) {
            sent++
            await prisma.commMessage.update({ where: { id: m.id }, data: { status: "sent", providerId: r.providerId || null, sentAt: new Date(), error: null, attempts: m.attempts + 1 } })
        } else {
            const attempts = m.attempts + 1
            const final = r.permanent || attempts >= MAX_ATTEMPTS
            if (final) failed++
            await prisma.commMessage.update({
                where: { id: m.id },
                data: { status: final ? "failed" : "queued", error: r.error.slice(0, 500), attempts, nextAttemptAt: new Date(Date.now() + attempts * 5 * 60_000) },
            })
        }
    }
    const remaining = await prisma.commMessage.count({ where: { status: "queued", nextAttemptAt: { lte: new Date() }, ...(ids ? { id: { in: ids } } : {}) } })
    return { sent, failed, processed, remaining }
}

type SendResult = { ok: true; providerId?: string } | { ok: false; error: string; permanent?: boolean }

async function sendOne(m: { id: string; channel: string; event: string; toAddress: string; template: string | null; data: unknown; refType: string | null; refId: string | null }, settings: CommSettings): Promise<SendResult> {
    const ev = COMM_EVENT_MAP.get(m.event)
    if (!ev) return { ok: false, error: `Unknown event ${m.event}`, permanent: true }
    const cfg = settings.events[ev.key] ?? defaultChannels(ev)
    const data = (m.data ?? {}) as Record<string, string>

    if (m.channel === "whatsapp") {
        const [template, language] = (m.template || `${cfg.whatsapp.template}|${cfg.whatsapp.language}`).split("|")
        if (!template) return { ok: false, error: "No WhatsApp template chosen for this event", permanent: true }
        let header: { type: "document"; id: string; filename: string } | undefined
        if (ev.waDocument) {
            const att = await buildAttachment(ev.key, m.refType, m.refId)
            if (!att) return { ok: false, error: "The document for this message could not be made", permanent: true }
            const up = await uploadMedia(att.content, att.filename, att.contentType ?? "application/pdf")
            if (!up.ok) return { ok: false, error: up.error }
            header = { type: "document", id: up.id, filename: att.filename }
        }
        const r = await sendTemplate({ to: m.toAddress, template, language: language || "en", body: ev.waParams.map(k => data[k] ?? ""), header })
        return r.ok ? { ok: true, providerId: r.wamid } : { ok: false, error: r.error, permanent: r.permanent }
    }

    if (m.channel === "email") {
        const subject = fillTemplate(cfg.email.subject, data)
        const text = fillTemplate(cfg.email.body, data)
        const att = await buildAttachment(ev.key, m.refType, m.refId)
        const r = await sendEmail({
            to: m.toAddress, subject, text, html: emailLayout(subject, text, { appUrl: appUrl() }),
            fromName: settings.emailFromName || undefined,
            attachments: att ? [{ filename: att.filename, content: att.content, contentType: att.contentType }] : undefined,
        })
        return r.ok ? { ok: true, providerId: undefined } : { ok: false, error: r.error, permanent: /invalid|does not exist|recipient/i.test(r.error) }
    }

    if (m.channel === "inapp") {
        const title = fillTemplate(cfg.email.subject, data).slice(0, 200)
        const message = fillTemplate(cfg.email.body, data).replace(/\s+/g, " ").trim().slice(0, 500)
        await prisma.notification.create({ data: { userId: m.toAddress, title, message, type: `comm.${ev.key}`, link: data._link || null } })
        return { ok: true }
    }
    return { ok: false, error: `Unknown channel ${m.channel}`, permanent: true }
}
