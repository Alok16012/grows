import { NextResponse } from "next/server"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { getExpensePolicy, saveExpensePolicy } from "@/lib/expense-policy-server"

export const dynamic = "force-dynamic"

// Expense Claims → Policy. Anyone signed in can read it (the claim form shows
// the same checks); changing it needs expenses.manage.
export async function GET(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    return NextResponse.json({ policy: await getExpensePolicy() })
}

export async function PUT(req: Request) {
    const g = await guard(req, "expenses.manage")
    if (g instanceof NextResponse) return g
    const policy = await saveExpensePolicy(await req.json().catch(() => ({})), g.access.userId)
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "expense.policy", targetType: "Setting", targetId: "expensePolicy", targetName: "Expense policy", summary: "Expense policy saved", after: policy, ...requestMeta(req) })
    return NextResponse.json({ ok: true, policy })
}
