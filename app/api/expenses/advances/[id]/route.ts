import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { checkAccess } from "@/lib/permissions"
import { getApiSession } from "@/lib/apiSession"
import { pushTrail } from "@/lib/expense-approval"
import { settleAdvance, type SettleChoice } from "@/lib/expense-advance"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// PUT { action: "APPROVE" | "REJECT" | "PAY" | "SETTLE" | "CANCEL", ... }
//   APPROVE / REJECT (reason) / PAY (paymentMode, transactionId?, paymentDate?) /
//   SETTLE (choice) — Manage Expenses, never on one's own advance (admins excepted).
//   CANCEL — the employee, while it is still a request.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    const session = await getApiSession(req)
    const canManage = !!session && checkAccess(session, ["MANAGER", "HR_MANAGER"], "expenses.manage")
    const adv = await prisma.expenseAdvance.findUnique({ where: { id: params.id } })
    if (!adv) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const b = await req.json().catch(() => ({}))
    const action = String(b?.action ?? "")
    const own = adv.requestedBy === g.access.userId
    const actor = { id: g.access.userId, name: g.access.name }
    const trail = (a: "APPROVED" | "REJECTED" | "PAID", note?: string | null) =>
        pushTrail(adv.approvalTrail, { stage: 2, action: a, by: actor.id, byName: actor.name, at: new Date().toISOString(), note: note ?? null }) as any
    const tell = (title: string, message: string) => prisma.notification.create({ data: { userId: adv.requestedBy, title, message, type: "expense", link: "/expenses/advances" } }).catch(() => {})

    if (action === "CANCEL") {
        if (!own) return NextResponse.json({ error: "Only the employee can cancel their request" }, { status: 403 })
        if (adv.status !== "REQUESTED") return NextResponse.json({ error: "Only a request that isn't approved yet can be cancelled" }, { status: 400 })
        await prisma.expenseAdvance.delete({ where: { id: adv.id } })
        return NextResponse.json({ ok: true })
    }
    if (!canManage) return NextResponse.json({ error: "Needs the Manage Expenses permission" }, { status: 403 })
    if (own && !g.access.isAdmin) return NextResponse.json({ error: "You can't approve, pay or settle your own advance" }, { status: 403 })

    let updated: any
    if (action === "APPROVE") {
        if (adv.status !== "REQUESTED") return NextResponse.json({ error: "Only a request can be approved" }, { status: 400 })
        updated = await prisma.expenseAdvance.update({ where: { id: adv.id }, data: { status: "APPROVED", approvedBy: actor.id, approvedAt: new Date(), approvalTrail: trail("APPROVED") } })
        await tell("Advance approved ✓", `${adv.advanceNo} (₹${adv.amount.toLocaleString("en-IN")}) is approved; Accounts will pay it.`)
    } else if (action === "REJECT") {
        if (adv.status !== "REQUESTED" && adv.status !== "APPROVED") return NextResponse.json({ error: "This advance can't be rejected now" }, { status: 400 })
        if (!b?.reason) return NextResponse.json({ error: "Give a reason" }, { status: 400 })
        updated = await prisma.expenseAdvance.update({ where: { id: adv.id }, data: { status: "REJECTED", rejectionReason: String(b.reason).slice(0, 300), approvalTrail: trail("REJECTED", String(b.reason)) } })
        await tell("Advance rejected ✗", `${adv.advanceNo} was rejected: ${b.reason}`)
    } else if (action === "PAY") {
        if (adv.status !== "APPROVED") return NextResponse.json({ error: "Only an approved advance can be paid" }, { status: 400 })
        if (!b?.paymentMode) return NextResponse.json({ error: "Pick the payment mode" }, { status: 400 })
        updated = await prisma.expenseAdvance.update({
            where: { id: adv.id },
            data: { status: "PAID", paidAt: b?.paymentDate ? new Date(b.paymentDate) : new Date(), paymentMode: String(b.paymentMode), transactionId: b?.transactionId ? String(b.transactionId).slice(0, 100) : null, approvalTrail: trail("PAID", `${b.paymentMode}${b?.transactionId ? ` · ${b.transactionId}` : ""}`) },
        })
        await tell("Advance paid 💰", `${adv.advanceNo} (₹${adv.amount.toLocaleString("en-IN")}) has been paid via ${b.paymentMode}. File your expense claims against it, then it will be settled.`)
    } else if (action === "SETTLE") {
        try {
            const r = await settleAdvance(adv.id, b?.choice as SettleChoice, actor)
            updated = r.advance
            await tell("Advance settled", `${adv.advanceNo}: claims ₹${r.claimed.toLocaleString("en-IN")} against ₹${adv.amount.toLocaleString("en-IN")}. ${r.note}.`)
        } catch (e: any) { return NextResponse.json({ error: e?.message || "Could not settle" }, { status: 400 }) }
    } else return NextResponse.json({ error: "Unknown action" }, { status: 400 })

    auditLater({ actorId: actor.id, actorName: actor.name, action: `expense.advance_${action.toLowerCase()}`, targetType: "ExpenseAdvance", targetId: adv.id, targetName: adv.advanceNo, summary: `${action} ${adv.advanceNo}`, ...requestMeta(req) })
    return NextResponse.json(updated)
}
