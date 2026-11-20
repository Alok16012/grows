import { NextResponse } from "next/server"
import crypto from "crypto"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { isMissingTableErr } from "@/lib/asset-workflow"
import { notify, type Recipient } from "@/lib/comm/engine"
import { getCommSettings } from "@/lib/comm/settings"
import { waConfig, waPhone } from "@/lib/whatsapp"
import { emailStatus } from "@/lib/mailer"
import type { Channel } from "@/lib/comm/events"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Settings → Communication → Broadcasts: one message to chosen employees or
// customers, on WhatsApp / email / in-app.
//   POST { action: "preview", audience }                      → counts
//   POST { action: "send", audience, channels, title, message } → queues + starts sending
//   GET                                                        → past broadcasts with delivery counts
type Audience = { kind: "employees" | "customers"; siteIds?: string[]; departmentIds?: string[] }

const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 500) : [])
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function resolve(a: Audience): Promise<Recipient[]> {
    const siteIds = ids(a.siteIds), departmentIds = ids(a.departmentIds)
    if (a.kind === "customers") {
        const [contacts, sites] = await Promise.all([
            prisma.customerContact.findMany({ where: { active: true, ...(siteIds.length ? { siteId: { in: siteIds } } : {}) }, select: { id: true, name: true, phone: true, email: true } })
                .catch(e => { if (isMissingTableErr(e)) return []; throw e }),
            // Each site's own contact person counts too, unless already a contact.
            prisma.site.findMany({ where: { contactPerson: { not: null }, contactPhone: { not: null }, ...(siteIds.length ? { id: { in: siteIds } } : {}) }, select: { id: true, contactPerson: true, contactPhone: true } }),
        ])
        const phones = new Set(contacts.map(c => waPhone(c.phone)).filter(Boolean))
        return [
            ...contacts.map(c => ({ type: "customer" as const, id: c.id, name: c.name, phone: c.phone, email: c.email })),
            ...sites.filter(s => !phones.has(waPhone(s.contactPhone))).map(s => ({ type: "customer" as const, id: `site:${s.id}`, name: s.contactPerson!, phone: s.contactPhone, email: null })),
        ]
    }
    const emps = await prisma.employee.findMany({
        where: {
            status: { in: ["ACTIVE", "ON_LEAVE"] },
            ...(siteIds.length ? { deployments: { some: { isActive: true, siteId: { in: siteIds } } } } : {}),
            ...(departmentIds.length ? { departmentId: { in: departmentIds } } : {}),
        },
        select: { id: true, firstName: true, lastName: true, phone: true, email: true, userId: true },
        orderBy: { firstName: "asc" },
        take: 5000,
    })
    return emps.map(e => ({ type: "employee" as const, id: e.id, name: `${e.firstName} ${e.lastName ?? ""}`.trim(), phone: e.phone, email: e.email, userId: e.userId }))
}

export async function POST(req: Request) {
    const b = await req.json().catch(() => ({}))
    const audience: Audience = { kind: b?.audience?.kind === "customers" ? "customers" : "employees", siteIds: b?.audience?.siteIds, departmentIds: b?.audience?.departmentIds }
    const g = await guard(req, b?.action === "preview" ? ["whatsapp.view", "whatsapp.edit"] : "whatsapp.edit")
    if (g instanceof NextResponse) return g

    const recipients = await resolve(audience)
    if (b?.action === "preview") {
        return NextResponse.json({
            total: recipients.length,
            whatsapp: recipients.filter(r => waPhone(r.phone)).length,
            email: recipients.filter(r => r.email && EMAIL_RE.test(r.email.trim())).length,
            inapp: recipients.filter(r => r.userId).length,
            sample: recipients.slice(0, 6).map(r => r.name),
        })
    }

    const title = String(b?.title ?? "").trim().slice(0, 120)
    const message = String(b?.message ?? "").trim()
    const channels = (Array.isArray(b?.channels) ? b.channels : []).filter((c: unknown): c is Channel => c === "whatsapp" || c === "email" || c === "inapp")
    if (!title) return NextResponse.json({ error: "Give the broadcast a title." }, { status: 400 })
    if (!message) return NextResponse.json({ error: "Write the message." }, { status: 400 })
    if (message.length > 1000) return NextResponse.json({ error: "Keep the message under 1,000 characters (WhatsApp's limit)." }, { status: 400 })
    if (!channels.length) return NextResponse.json({ error: "Pick at least one channel." }, { status: 400 })
    if (!recipients.length) return NextResponse.json({ error: "Nobody matches that audience." }, { status: 400 })
    if (audience.kind === "customers" && channels.includes("inapp")) return NextResponse.json({ error: "Customers have no app login — use WhatsApp or email." }, { status: 400 })
    if (channels.includes("whatsapp")) {
        const s = await getCommSettings()
        if (!waConfig()) return NextResponse.json({ error: "WhatsApp isn't connected yet." }, { status: 409 })
        if (!s.events.broadcast?.whatsapp.template) return NextResponse.json({ error: "Choose a WhatsApp template for \"Broadcast message\" on the Events tab first." }, { status: 409 })
    }
    if (channels.includes("email") && !emailStatus().configured) return NextResponse.json({ error: "Email isn't set up yet." }, { status: 409 })

    const refId = crypto.randomUUID()
    try {
        const r = await notify("broadcast", recipients, { title, message }, {
            channels, force: true, refType: "Broadcast", refId, createdBy: g.access.userId, budgetMs: 4000, link: "/announcements",
        })
        auditLater({
            actorId: g.access.userId, actorName: g.access.name, action: "comm.broadcast", targetType: "Broadcast", targetId: refId, targetName: title,
            summary: `Broadcast "${title}" to ${recipients.length} ${audience.kind} by ${channels.join(" + ")}`,
            after: { audience, channels, recipients: recipients.length, queued: r.queued, skipped: r.skipped }, ...requestMeta(req),
        })
        return NextResponse.json({ ok: true, refId, recipients: recipients.length, ...r, ids: undefined })
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "Could not send" }, { status: 500 })
    }
}

export async function GET(req: Request) {
    const g = await guard(req, ["whatsapp.view", "whatsapp.edit"])
    if (g instanceof NextResponse) return g
    try {
        const heads = await prisma.commMessage.groupBy({
            by: ["refId"], where: { refType: "Broadcast" }, _min: { createdAt: true }, _count: true,
            orderBy: { _min: { createdAt: "desc" } }, take: 30,
        })
        const refIds = heads.map(h => h.refId).filter((x): x is string => !!x)
        if (!refIds.length) return NextResponse.json({ rows: [] })
        const [counts, firsts] = await Promise.all([
            prisma.commMessage.groupBy({ by: ["refId", "channel", "status"], where: { refType: "Broadcast", refId: { in: refIds } }, _count: true }),
            prisma.commMessage.findMany({ where: { refType: "Broadcast", refId: { in: refIds } }, distinct: ["refId"], orderBy: { createdAt: "asc" }, select: { refId: true, subject: true, recipientType: true, createdBy: true, createdAt: true } }),
        ])
        const users = await prisma.user.findMany({ where: { id: { in: Array.from(new Set(firsts.map(f => f.createdBy).filter((x): x is string => !!x))) } }, select: { id: true, name: true } })
        const uname = new Map(users.map(u => [u.id, u.name]))
        const rows = refIds.map(id => {
            const f = firsts.find(x => x.refId === id)
            const c = counts.filter(x => x.refId === id)
            const by = (ch: string) => {
                const o: Record<string, number> = {}
                for (const x of c.filter(x => x.channel === ch)) o[x.status] = x._count
                return o
            }
            return { refId: id, title: f?.subject ?? "", audience: f?.recipientType ?? "", by: f?.createdBy ? uname.get(f.createdBy) ?? "" : "", createdAt: f?.createdAt, whatsapp: by("whatsapp"), email: by("email"), inapp: by("inapp") }
        })
        return NextResponse.json({ rows })
    } catch (e) {
        if (isMissingTableErr(e)) return NextResponse.json({ rows: [] })
        throw e
    }
}
