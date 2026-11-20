import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { isMissingTableErr } from "@/lib/asset-workflow"
import { CONTACT_READ, CONTACT_WRITE, CONTACT_MISSING, parseContact } from "@/lib/customer-contacts"

export const dynamic = "force-dynamic"

// Customer contacts at a site — who gets inspection reports and alerts.
export async function GET(req: Request, { params }: { params: { id: string } }) {
    const g = await guard(req, CONTACT_READ)
    if (g instanceof NextResponse) return g
    try {
        const [site, contacts, projects] = await Promise.all([
            prisma.site.findUnique({ where: { id: params.id }, select: { id: true, name: true, clientName: true, contactPerson: true, contactPhone: true } }),
            prisma.customerContact.findMany({ where: { siteId: params.id }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
            prisma.project.findMany({ where: { siteId: params.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
        ])
        if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 })
        return NextResponse.json({ site, contacts, projects, installed: true })
    } catch (e) {
        if (isMissingTableErr(e)) return NextResponse.json({ contacts: [], installed: false, error: CONTACT_MISSING })
        throw e
    }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
    const g = await guard(req, CONTACT_WRITE)
    if (g instanceof NextResponse) return g
    const p = parseContact(await req.json().catch(() => ({})))
    if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 })
    try {
        if (!(await prisma.site.count({ where: { id: params.id } }))) return NextResponse.json({ error: "Site not found" }, { status: 404 })
        const row = await prisma.customerContact.create({ data: { ...p.data, siteId: params.id, createdBy: g.access.userId } })
        auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "customer.contact.create", targetType: "CustomerContact", targetId: row.id, targetName: row.name, summary: `Customer contact added: ${row.name}`, ...requestMeta(req) })
        return NextResponse.json({ ok: true, contact: row })
    } catch (e) {
        if (isMissingTableErr(e)) return NextResponse.json({ error: CONTACT_MISSING }, { status: 503 })
        throw e
    }
}
