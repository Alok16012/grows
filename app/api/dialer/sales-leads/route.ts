import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, has, auditLater, requestMeta } from "@/lib/access"
import { canSales, canEditAny, canSeeTeam } from "@/lib/dialer-server"
import { leadWhere, createLead } from "@/lib/sales-leads-server"
import { phoneKey, OPEN_STAGES } from "@/lib/dialer"

export const dynamic = "force-dynamic"

// GET ?stage=open|all|<STAGE>&assigned=me|<userId>|none&due=1&q=&format=csv
export async function GET(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    if (!canSales(g.access)) return NextResponse.json({ error: "Sales leads need the Call Dialer permission" }, { status: 403 })
    const sp = new URL(req.url).searchParams
    const and: any[] = [leadWhere(g.access)]
    const stage = sp.get("stage") ?? "open"
    if (stage === "open") and.push({ stage: { in: OPEN_STAGES } })
    else if (stage !== "all") and.push({ stage })
    const asg = sp.get("assigned")
    if (asg === "me") and.push({ assignedTo: g.access.userId })
    else if (asg === "none") and.push({ assignedTo: null })
    else if (asg) and.push({ assignedTo: asg })
    if (sp.get("due") === "1") and.push({ nextFollowUp: { lt: new Date(Date.now() + 86400_000) } })
    const q = (sp.get("q") ?? "").trim()
    if (q) and.push({ OR: [{ company: { contains: q, mode: "insensitive" } }, { contactName: { contains: q, mode: "insensitive" } }, { leadNo: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }, ...(phoneKey(q).length >= 4 ? [{ phoneKey: { contains: phoneKey(q) } }] : [])] })
    const csv = sp.get("format") === "csv"
    if (csv && !(g.access.isAdmin || has(g.access, "dialer.export"))) return NextResponse.json({ error: "Download needs Call Dialer → Export" }, { status: 403 })
    const leads = await prisma.salesLead.findMany({ where: { AND: and }, orderBy: [{ nextFollowUp: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }], take: csv ? 20000 : 1000 })
    const users = await prisma.user.findMany({ where: { id: { in: Array.from(new Set(leads.map(l => l.assignedTo).filter((x): x is string => !!x))) } }, select: { id: true, name: true } })
    const nameOf = new Map(users.map(u => [u.id, u.name]))
    const rows = leads.map(l => ({ ...l, assignedName: l.assignedTo ? nameOf.get(l.assignedTo) ?? "—" : null }))
    if (csv) {
        const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
        const head = ["Lead no", "Company", "Contact", "Designation", "Phone", "Email", "City", "Industry", "Service", "Source", "Stage", "Expected value", "Assigned to", "Next follow-up", "Last called", "Last outcome", "Calls", "Notes"]
        const body = rows.map(r => [r.leadNo, r.company, r.contactName, r.designation, r.phone, r.email, r.city, r.industry, r.service, r.source, r.stage, r.expectedValue, r.assignedName, r.nextFollowUp?.toISOString(), r.lastCalledAt?.toISOString(), r.lastOutcome, r.callCount, r.notes].map(esc).join(","))
        return new NextResponse([head.join(","), ...body].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sales-leads.csv"` } })
    }
    const counts = await prisma.salesLead.groupBy({ by: ["stage"], where: leadWhere(g.access), _count: true })
    return NextResponse.json({ leads: rows, counts: Object.fromEntries(counts.map(c => [c.stage, c._count])), canEditAny: canEditAny(g.access), canSeeTeam: canSeeTeam(g.access), me: g.access.userId })
}

// POST { company?, contactName, phone, … }
export async function POST(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    if (!canSales(g.access)) return NextResponse.json({ error: "Adding sales leads needs Call Dialer → Create" }, { status: 403 })
    const b = await req.json().catch(() => ({}))
    try {
        const dup = await prisma.salesLead.findFirst({ where: { phoneKey: phoneKey(b?.phone) }, select: { leadNo: true, contactName: true } })
        if (dup && !b?.allowDuplicate) return NextResponse.json({ error: `This number is already lead ${dup.leadNo} (${dup.contactName})`, duplicate: true }, { status: 409 })
        const l = await createLead(g.access, b)
        auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "sales_lead.create", targetType: "SalesLead", targetId: l.id, targetName: l.contactName, summary: `Sales lead ${l.leadNo} added`, ...requestMeta(req) })
        return NextResponse.json({ lead: l })
    } catch (e: any) { return NextResponse.json({ error: e?.message || "Could not add" }, { status: 400 }) }
}
