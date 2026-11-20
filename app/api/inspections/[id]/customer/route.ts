import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { isMissingTableErr } from "@/lib/asset-workflow"
import { notify, type Recipient } from "@/lib/comm/engine"
import { getCommSettings } from "@/lib/comm/settings"
import { waConfig, waPhone } from "@/lib/whatsapp"
import { emailStatus } from "@/lib/mailer"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

// Approvals → an approved inspection → "Send to customer".
// GET  — the site's contacts for this project, channel readiness, send history.
// POST { contactIds, channels } — sends the report PDF (+ online link) now.
// "site" in contactIds means the contact person saved on the Site itself.
const READ = ["approvals.view", "approvals.manage", "assignments.manage"]
const SEND = ["approvals.manage", "assignments.manage"]

async function load(id: string) {
    return prisma.inspection.findUnique({
        where: { id },
        select: {
            id: true, status: true, submittedAt: true, approvedAt: true,
            shareableLink: { select: { token: true, expiresAt: true } },
            assignment: { select: { project: { select: { id: true, name: true, site: { select: { id: true, name: true, clientName: true, contactPerson: true, contactPhone: true } } } } } },
        },
    })
}

async function contactsFor(siteId: string, projectId: string) {
    try {
        const rows = await prisma.customerContact.findMany({ where: { siteId, active: true }, orderBy: { name: "asc" } })
        return { installed: true, rows: rows.filter(c => c.projectIds.length === 0 || c.projectIds.includes(projectId)) }
    } catch (e) {
        if (isMissingTableErr(e)) return { installed: false, rows: [] }
        throw e
    }
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
    const g = await guard(req, READ)
    if (g instanceof NextResponse) return g
    const i = await load(params.id)
    if (!i) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const project = i.assignment.project
    const site = project.site
    const c = site ? await contactsFor(site.id, project.id) : { installed: true, rows: [] }
    const contacts = c.rows.map(x => ({ id: x.id, name: x.name, designation: x.designation, phone: x.phone, email: x.email, receiveReports: x.receiveReports, allProjects: x.projectIds.length === 0 }))
    // The site's own contact person, unless they're already a contact.
    const sitePhone = site?.contactPhone ? waPhone(site.contactPhone) : null
    if (site?.contactPerson && sitePhone && !contacts.some(x => x.phone && waPhone(x.phone) === sitePhone)) {
        contacts.unshift({ id: "site", name: site.contactPerson, designation: "Site contact", phone: site.contactPhone, email: null, receiveReports: true, allProjects: true })
    }
    const settings = await getCommSettings()
    const ev = settings.events.inspection_report
    let history: any[] = []
    try {
        history = await prisma.commMessage.findMany({
            where: { refType: "Inspection", refId: i.id },
            orderBy: { createdAt: "desc" }, take: 50,
            select: { id: true, channel: true, recipientName: true, toAddress: true, status: true, error: true, createdAt: true, deliveredAt: true, readAt: true },
        })
    } catch (e) { if (!isMissingTableErr(e)) throw e }
    const em = emailStatus()
    return NextResponse.json({
        inspection: { id: i.id, status: i.status, submittedAt: i.submittedAt, approvedAt: i.approvedAt, project: { id: project.id, name: project.name }, site: site ? { id: site.id, name: site.name, clientName: site.clientName } : null },
        contacts, contactsInstalled: c.installed,
        channels: {
            whatsapp: { ready: !!waConfig() && !!ev.whatsapp.template, connected: !!waConfig(), template: ev.whatsapp.template || null },
            email: { ready: em.configured, from: em.from },
        },
        history,
    })
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
    const g = await guard(req, SEND)
    if (g instanceof NextResponse) return g
    const b = await req.json().catch(() => ({}))
    const ids: string[] = Array.from(new Set((Array.isArray(b?.contactIds) ? b.contactIds : []).filter((x: unknown): x is string => typeof x === "string"))).slice(0, 50) as string[]
    const channels = (Array.isArray(b?.channels) ? b.channels : []).filter((c: unknown): c is "whatsapp" | "email" => c === "whatsapp" || c === "email")
    if (!ids.length) return NextResponse.json({ error: "Pick at least one contact." }, { status: 400 })
    if (!channels.length) return NextResponse.json({ error: "Pick WhatsApp, email or both." }, { status: 400 })

    const i = await load(params.id)
    if (!i) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (i.status !== "approved") return NextResponse.json({ error: "Only approved inspections can be sent to the customer." }, { status: 400 })
    const project = i.assignment.project
    const site = project.site
    if (!site) return NextResponse.json({ error: "This project isn't linked to a customer site." }, { status: 400 })

    const c = await contactsFor(site.id, project.id)
    const recipients: Recipient[] = c.rows.filter(x => ids.includes(x.id)).map(x => ({ type: "customer", id: x.id, name: x.name, phone: x.phone, email: x.email }))
    if (ids.includes("site") && site.contactPerson && site.contactPhone) recipients.push({ type: "customer", id: `site:${site.id}`, name: site.contactPerson, phone: site.contactPhone, email: null })
    if (!recipients.length) return NextResponse.json({ error: "None of those contacts belong to this project's site." }, { status: 400 })

    // The online copy: reuse the share link, or make one (90 days, like Share Report).
    const link = i.shareableLink && (!i.shareableLink.expiresAt || i.shareableLink.expiresAt > new Date())
        ? i.shareableLink
        : await prisma.shareableLink.upsert({
            where: { inspectionId: i.id },
            create: { inspectionId: i.id, createdBy: g.access.userId, expiresAt: new Date(Date.now() + 90 * 86_400_000) },
            update: { expiresAt: new Date(Date.now() + 90 * 86_400_000) },
            select: { token: true, expiresAt: true },
        })
    const origin = process.env.NEXTAUTH_URL?.trim() || new URL(req.url).origin
    const date = (i.submittedAt ?? i.approvedAt ?? new Date()).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })

    try {
        // One message per contact, so each greeting carries their own name.
        let queued = 0, skipped = 0, sent = 0, failed = 0
        for (const r of recipients) {
            const res = await notify("inspection_report", [r], {
                name: r.name.split(" ")[0] || r.name, project: project.name, date,
                link: `${origin.replace(/\/$/, "")}/share/${link.token}`,
            }, { channels, force: true, refType: "Inspection", refId: i.id, createdBy: g.access.userId, budgetMs: 15_000 })
            queued += res.queued; skipped += res.skipped; sent += res.sent; failed += res.failed
        }
        auditLater({
            actorId: g.access.userId, actorName: g.access.name, action: "inspection.sendToCustomer", targetType: "Inspection", targetId: i.id,
            targetName: project.name, summary: `Report for ${project.name} (${date}) sent to ${recipients.map(r => r.name).join(", ")} by ${channels.join(" + ")}`,
            after: { recipients: recipients.length, channels, sent, failed, skipped }, ...requestMeta(req),
        })
        return NextResponse.json({ ok: true, queued, skipped, sent, failed })
    } catch (e: any) {
        console.error("[SEND_TO_CUSTOMER]", e)
        return NextResponse.json({ error: e?.message || "Could not send" }, { status: 500 })
    }
}
