import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta, maskValue } from "@/lib/access"
import { decideChangeRequest, SENSITIVE, type Change } from "@/lib/employee-change"

export const dynamic = "force-dynamic"

// POST { action: "APPROVE" | "REJECT", note? } — someone other than the requester (admins excepted).
//      { action: "CANCEL" } — the requester withdraws it.
export async function POST(req: Request, { params }: { params: { id: string } }) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    const b = await req.json().catch(() => ({}))
    const r = await prisma.employeeChangeRequest.findUnique({ where: { id: params.id } })
    if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (b?.action === "CANCEL") {
        if (r.requestedBy !== g.access.userId) return NextResponse.json({ error: "Only the person who asked can withdraw it" }, { status: 403 })
        if (r.status !== "PENDING") return NextResponse.json({ error: "Already decided" }, { status: 400 })
        await prisma.employeeChangeRequest.update({ where: { id: r.id }, data: { status: "CANCELLED", decidedAt: new Date(), decidedBy: g.access.userId } })
        return NextResponse.json({ ok: true })
    }
    // Employee's own updates (Onboarding → Approvals) may also be decided by onboarding approvers.
    const may = g.access.isAdmin || g.access.permissions.includes("employees.edit") || (r.source === "SELF" && g.access.permissions.includes("onboarding.approve"))
    if (!may) return NextResponse.json({ error: r.source === "SELF" ? "Needs Onboarding → Approve or Edit Employees" : "Needs the Edit Employees permission" }, { status: 403 })
    try {
        const approve = b?.action === "APPROVE"
        const only = Array.isArray(b?.fields) ? b.fields.filter((x: unknown): x is string => typeof x === "string") : null
        const u = await decideChangeRequest(r.id, approve, { id: g.access.userId, name: g.access.name, isAdmin: g.access.isAdmin }, b?.note ? String(b.note).slice(0, 300) : null, only)
        const ch = (r.changes as Change[]).map(c => ({ field: c.field, from: SENSITIVE.has(c.field) ? maskValue(c.from) : c.from, to: SENSITIVE.has(c.field) ? maskValue(c.to) : c.to }))
        auditLater({ actorId: g.access.userId, actorName: g.access.name, action: approve ? "employee.change_approved" : "employee.change_rejected", targetType: "Employee", targetId: r.employeeId, targetName: r.requestNo, summary: `${r.requestNo} ${approve ? "approved" : "rejected"}: ${(r.changes as Change[]).map(c => c.label).join(", ")}`, after: { changes: ch, note: b?.note ?? null }, ...requestMeta(req) })
        return NextResponse.json(u)
    } catch (e: any) { return NextResponse.json({ error: e?.message || "Could not decide" }, { status: 400 }) }
}
