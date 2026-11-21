import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { employeesOfUsers, settleBank, settleWindow, settleWithSalary, unsettleSalary } from "@/lib/expense-settle"
import { ymLabel } from "@/lib/payroll-change-control"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET — approved claims waiting to be paid, plus claims already put on a salary
// that can still be taken off, and which payroll months are open.
export async function GET(req: Request) {
    const g = await guard(req, "expenses.manage")
    if (g instanceof NextResponse) return g
    const w = await settleWindow()
    const claims = await prisma.expense.findMany({
        where: {
            OR: [
                { status: "APPROVED" },
                { status: "PAID", settledVia: "PAYROLL", OR: w.allowed.map(a => ({ payrollMonth: a.month, payrollYear: a.year })) },
            ],
        },
        orderBy: [{ approvedAt: "asc" }, { date: "asc" }],
        select: { id: true, expenseNo: true, title: true, amount: true, date: true, siteName: true, status: true, submittedBy: true, approvedAt: true, settledVia: true, payrollMonth: true, payrollYear: true },
    })
    const userIds = Array.from(new Set(claims.map(c => c.submittedBy)))
    const [users, emps] = await Promise.all([
        prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }),
        employeesOfUsers(userIds),
    ])
    const userOf = new Map(users.map(u => [u.id, u]))
    return NextResponse.json({
        window: w,
        claims: claims.map(c => ({
            ...c,
            employee: userOf.get(c.submittedBy)?.name ?? userOf.get(c.submittedBy)?.email ?? "",
            employeeCode: emps.get(c.submittedBy)?.code ?? null,
            onSalary: c.settledVia === "PAYROLL" ? ymLabel({ month: c.payrollMonth!, year: c.payrollYear! }) : null,
        })),
    })
}

// POST { action: "bank", ids, paymentMode, transactionId?, paymentDate? }
//      { action: "salary", ids, month, year }
//      { action: "unsettle", ids }
export async function POST(req: Request) {
    const g = await guard(req, "expenses.manage")
    if (g instanceof NextResponse) return g
    const b = await req.json().catch(() => ({}))
    const ids: string[] = Array.isArray(b?.ids) ? b.ids.filter((x: unknown) => typeof x === "string").slice(0, 500) : []
    if (!ids.length) return NextResponse.json({ error: "Pick at least one claim" }, { status: 400 })
    const actor = { id: g.access.userId, name: g.access.name }
    try {
        let result: any, note = ""
        if (b.action === "bank") {
            if (!b.paymentMode) return NextResponse.json({ error: "Pick the payment mode" }, { status: 400 })
            result = await settleBank(ids, { paymentMode: String(b.paymentMode), transactionId: b.transactionId ? String(b.transactionId).slice(0, 100) : null, paymentDate: b.paymentDate || null }, actor)
            note = `paid via ${b.paymentMode}`
        } else if (b.action === "salary") {
            const p = { month: Number(b.month), year: Number(b.year) }
            result = await settleWithSalary(ids, p, actor)
            note = `added to ${ymLabel(p)} salary`
        } else if (b.action === "unsettle") {
            result = await unsettleSalary(ids, actor)
        } else return NextResponse.json({ error: "Unknown action" }, { status: 400 })

        for (const userId of result.claimants ?? []) {
            await prisma.notification.create({ data: { userId, title: "Expense claim paid 💰", message: `Your approved expense claim(s) have been ${note}.`, type: "expense", link: "/expenses" } }).catch(() => {})
        }
        auditLater({ actorId: actor.id, actorName: actor.name, action: `expense.settle_${b.action}`, targetType: "Expense", targetId: ids.slice(0, 5).join(","), targetName: "Expense claims", summary: `${b.action}: ${JSON.stringify({ ...result, claimants: undefined })}`, ...requestMeta(req) })
        return NextResponse.json({ ok: true, ...result, claimants: undefined })
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "Could not settle" }, { status: 400 })
    }
}
