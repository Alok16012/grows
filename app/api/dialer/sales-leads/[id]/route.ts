import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { canEditAny } from "@/lib/dialer-server"
import { canTouch, cleanLead } from "@/lib/sales-leads-server"

export const dynamic = "force-dynamic"

// GET — one lead with its calls.
export async function GET(req: Request, { params }: { params: { id: string } }) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    const ok = await canTouch(g.access, params.id)
    if (ok === null) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (ok === false && !g.access.isAdmin && !g.access.permissions.includes("dialer.view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    const lead = await prisma.salesLead.findUnique({ where: { id: params.id } })
    const calls = await prisma.callLog.findMany({ where: { targetType: "SALES_LEAD", targetId: params.id }, orderBy: { startedAt: "desc" }, take: 200 })
    const users = await prisma.user.findMany({ where: { id: { in: Array.from(new Set([...calls.map(c => c.userId), lead?.assignedTo, lead?.createdBy].filter((x): x is string => !!x))) } }, select: { id: true, name: true } })
    const nameOf = new Map(users.map(u => [u.id, u.name]))
    return NextResponse.json({ lead: { ...lead, assignedName: lead?.assignedTo ? nameOf.get(lead.assignedTo) : null, createdByName: lead ? nameOf.get(lead.createdBy) : null }, calls: calls.map(c => ({ ...c, userName: nameOf.get(c.userId) ?? "—" })) })
}

// PATCH — edit fields, stage or (dialer.edit) who it is assigned to.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    const ok = await canTouch(g.access, params.id)
    if (ok === null) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (ok === false) return NextResponse.json({ error: "You can only edit your own leads" }, { status: 403 })
    const b = await req.json().catch(() => ({}))
    const data = cleanLead(b, true)
    if ("assignedTo" in data && !canEditAny(g.access)) delete data.assignedTo
    if ("phone" in data && data.phoneKey.length < 6) return NextResponse.json({ error: "Enter a valid phone number" }, { status: 400 })
    if ("contactName" in data && !data.contactName) return NextResponse.json({ error: "Enter the contact name" }, { status: 400 })
    if (data.stage === "WON") data.wonAt = new Date()
    const l = await prisma.salesLead.update({ where: { id: params.id }, data })
    if (data.stage) auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "sales_lead.stage", targetType: "SalesLead", targetId: l.id, targetName: l.contactName, summary: `${l.leadNo} moved to ${l.stage}`, ...requestMeta(req) })
    return NextResponse.json({ lead: l })
}

// DELETE — only for people who manage all leads (dialer.edit). Calls stay in the log.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    if (!canEditAny(g.access)) return NextResponse.json({ error: "Deleting leads needs Call Dialer → Edit" }, { status: 403 })
    const l = await prisma.salesLead.delete({ where: { id: params.id } }).catch(() => null)
    if (!l) return NextResponse.json({ error: "Not found" }, { status: 404 })
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "sales_lead.delete", targetType: "SalesLead", targetId: l.id, targetName: l.contactName, summary: `Sales lead ${l.leadNo} deleted`, ...requestMeta(req) })
    return NextResponse.json({ ok: true })
}
