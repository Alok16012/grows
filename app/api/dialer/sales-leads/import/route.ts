import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { canSales, canEditAny } from "@/lib/dialer-server"
import { createLead } from "@/lib/sales-leads-server"
import { phoneKey } from "@/lib/dialer"

export const dynamic = "force-dynamic"
export const maxDuration = 120

// POST { rows: [{ company, contactName, phone, … }], assignTo?: string[] (share out round-robin) }
// Numbers already in sales leads are skipped.
export async function POST(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    if (!canSales(g.access)) return NextResponse.json({ error: "Importing needs Call Dialer → Create" }, { status: 403 })
    const b = await req.json().catch(() => ({}))
    const rows: any[] = Array.isArray(b?.rows) ? b.rows.slice(0, 5000) : []
    if (!rows.length) return NextResponse.json({ error: "No rows to import" }, { status: 400 })
    const assignees: string[] = canEditAny(g.access) && Array.isArray(b?.assignTo) ? b.assignTo.filter((x: unknown) => typeof x === "string").slice(0, 100) : []
    const existing = new Set((await prisma.salesLead.findMany({ where: { phoneKey: { in: rows.map(r => phoneKey(r?.phone)) } }, select: { phoneKey: true } })).map(x => x.phoneKey))
    let added = 0, i = 0
    const skipped: { row: number; reason: string }[] = []
    for (const [n, r] of rows.entries()) {
        const k = phoneKey(r?.phone)
        if (k.length < 6) { skipped.push({ row: n + 1, reason: "No valid phone" }); continue }
        if (existing.has(k)) { skipped.push({ row: n + 1, reason: "Already a lead" }); continue }
        try {
            await createLead(g.access, { ...r, ...(assignees.length ? { assignedTo: assignees[i++ % assignees.length] } : {}) })
            existing.add(k); added++
        } catch (e: any) { skipped.push({ row: n + 1, reason: e?.message || "Error" }) }
    }
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "sales_lead.import", targetType: "SalesLead", targetId: null, targetName: null, summary: `Imported ${added} sales leads (${skipped.length} skipped)`, ...requestMeta(req) })
    return NextResponse.json({ added, skipped })
}
