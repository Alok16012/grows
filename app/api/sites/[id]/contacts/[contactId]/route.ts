import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { isMissingTableErr } from "@/lib/asset-workflow"
import { CONTACT_WRITE, CONTACT_MISSING, parseContact } from "@/lib/customer-contacts"

export const dynamic = "force-dynamic"

export async function PUT(req: Request, { params }: { params: { id: string; contactId: string } }) {
    const g = await guard(req, CONTACT_WRITE)
    if (g instanceof NextResponse) return g
    const p = parseContact(await req.json().catch(() => ({})))
    if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 })
    try {
        const r = await prisma.customerContact.updateMany({ where: { id: params.contactId, siteId: params.id }, data: p.data })
        if (!r.count) return NextResponse.json({ error: "Not found" }, { status: 404 })
        auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "customer.contact.update", targetType: "CustomerContact", targetId: params.contactId, targetName: p.data.name, summary: `Customer contact updated: ${p.data.name}`, ...requestMeta(req) })
        return NextResponse.json({ ok: true, contact: await prisma.customerContact.findUnique({ where: { id: params.contactId } }) })
    } catch (e) {
        if (isMissingTableErr(e)) return NextResponse.json({ error: CONTACT_MISSING }, { status: 503 })
        throw e
    }
}

export async function DELETE(req: Request, { params }: { params: { id: string; contactId: string } }) {
    const g = await guard(req, CONTACT_WRITE)
    if (g instanceof NextResponse) return g
    try {
        const row = await prisma.customerContact.findFirst({ where: { id: params.contactId, siteId: params.id } })
        if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })
        await prisma.customerContact.delete({ where: { id: row.id } })
        auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "customer.contact.delete", targetType: "CustomerContact", targetId: row.id, targetName: row.name, summary: `Customer contact removed: ${row.name}`, ...requestMeta(req) })
        return NextResponse.json({ ok: true })
    } catch (e) {
        if (isMissingTableErr(e)) return NextResponse.json({ error: CONTACT_MISSING }, { status: 503 })
        throw e
    }
}
