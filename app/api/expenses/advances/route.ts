import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta, teamUserIds } from "@/lib/access"
import { notifyApprovers } from "@/lib/hr-notify"
import { checkAccess } from "@/lib/permissions"
import { getApiSession } from "@/lib/apiSession"
import { claimedAgainst, nextAdvanceNo } from "@/lib/expense-advance"
import { getExpensePolicy } from "@/lib/expense-policy-server"
import { settleWindow } from "@/lib/expense-settle"

export const dynamic = "force-dynamic"

// GET ?view=mine|all — advances with what has been claimed against them.
// "all" needs Manage Expenses and follows the approver's data scope.
export async function GET(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    const session = await getApiSession(req)
    const canManage = !!session && checkAccess(session, ["MANAGER", "HR_MANAGER"], "expenses.manage")
    const view = new URL(req.url).searchParams.get("view") === "all" && canManage ? "all" : "mine"
    const where: any = {}
    const a = g.access
    if (view === "mine") where.requestedBy = a.userId
    else if (!a.isAdmin) {
        if (a.scope === "ASSIGNED_SITES") where.OR = [{ siteId: { in: a.siteIds } }, { requestedBy: a.userId }]
        else if (a.scope === "MY_TEAM") where.requestedBy = { in: [a.userId, ...(await teamUserIds(a.userId))] }
        else if (a.scope === "SELF") where.requestedBy = a.userId
    }
    const rows = await prisma.expenseAdvance.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 })
    const [claimed, users, emps, policy, w] = await Promise.all([
        claimedAgainst(rows.map(r => r.id)),
        prisma.user.findMany({ where: { id: { in: Array.from(new Set(rows.map(r => r.requestedBy))) } }, select: { id: true, name: true, email: true } }),
        prisma.employee.findMany({ where: { userId: { in: Array.from(new Set(rows.map(r => r.requestedBy))) } }, select: { userId: true, employeeId: true } }),
        getExpensePolicy(), settleWindow(),
    ])
    const userOf = new Map(users.map(u => [u.id, u])), codeOf = new Map(emps.map(e => [e.userId!, e.employeeId]))
    return NextResponse.json({
        view, canManage, policy: policy.advance, window: w,
        advances: rows.map(r => ({
            ...r,
            employee: userOf.get(r.requestedBy)?.name ?? userOf.get(r.requestedBy)?.email ?? "",
            employeeCode: codeOf.get(r.requestedBy) ?? null,
            claimed: claimed.get(r.id) ?? { approved: 0, pending: 0, claims: 0 },
            overdue: r.status === "PAID" && policy.advance.settleWithinDays > 0 && r.paidAt ? (Date.now() - r.paidAt.getTime()) / 86_400_000 > policy.advance.settleWithinDays : false,
        })),
    })
}

// POST { purpose, amount, neededBy?, siteId?, siteName? } — request an advance.
export async function POST(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    const b = await req.json().catch(() => ({}))
    const amount = Number(b?.amount)
    const purpose = typeof b?.purpose === "string" ? b.purpose.trim().slice(0, 300) : ""
    if (!purpose) return NextResponse.json({ error: "Say what the advance is for" }, { status: 400 })
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Enter the amount" }, { status: 400 })
    const policy = await getExpensePolicy()
    if (policy.advance.maxAmount > 0 && amount > policy.advance.maxAmount) {
        return NextResponse.json({ error: `An advance can be at most ₹${policy.advance.maxAmount.toLocaleString("en-IN")} (Expense policy)` }, { status: 400 })
    }
    const open = await prisma.expenseAdvance.count({ where: { requestedBy: g.access.userId, status: { in: ["REQUESTED", "APPROVED", "PAID"] } } })
    const created = await prisma.expenseAdvance.create({
        data: {
            advanceNo: await nextAdvanceNo(), requestedBy: g.access.userId, purpose, amount: Math.round(amount * 100) / 100,
            neededBy: b?.neededBy ? new Date(b.neededBy) : null, siteId: b?.siteId || null, siteName: b?.siteName || null,
            approvalTrail: [{ stage: 0, action: "SUBMITTED", by: g.access.userId, byName: g.access.name, at: new Date().toISOString(), note: null }] as any,
        },
    })
    await notifyApprovers(["expenses.manage"], { title: "Advance requested", message: `${g.access.name} requested ${created.advanceNo}: ₹${created.amount.toLocaleString("en-IN")} — ${purpose}${open ? ` (already has ${open} open advance${open === 1 ? "" : "s"})` : ""}`, type: "expense", link: "/expenses/advances" }, g.access.userId)
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "expense.advance_request", targetType: "ExpenseAdvance", targetId: created.id, targetName: created.advanceNo, summary: `₹${created.amount} — ${purpose}`, ...requestMeta(req) })
    return NextResponse.json(created)
}
