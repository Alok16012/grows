import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { teamUserIds } from "@/lib/access"
import { claimLines, checkClaim } from "@/lib/expense-policy"
import { getExpensePolicy } from "@/lib/expense-policy-server"
import { expenseCategoryLabel } from "@/lib/expense-categories"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET /api/expenses/report?from=yyyy-MM-dd&to=yyyy-MM-dd&status=&siteId=&category=&submittedBy=
// Every claim line in the period for the Expense Report download, with the
// claimant's employee code, site, approval and payment details and policy
// flags. Approvers see their data scope only (same as the claims list).
export async function GET(req: Request) {
    const g = await guard(req, ["expenses.view", "expenses.approve", "expenses.markPaid"])
    if (g instanceof NextResponse) return g
    const sp = new URL(req.url).searchParams
    const from = sp.get("from"), to = sp.get("to")
    if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return NextResponse.json({ error: "Pick a from and to date" }, { status: 400 })
    }
    const status = sp.get("status"), siteId = sp.get("siteId"), category = sp.get("category"), submittedBy = sp.get("submittedBy")

    const where: any = { date: { gte: new Date(from + "T00:00:00Z"), lte: new Date(to + "T23:59:59Z") } }
    if (status && status !== "ALL") where.status = status
    else where.status = { not: "DRAFT" }
    if (siteId && siteId !== "ALL") where.siteId = siteId
    if (submittedBy && submittedBy !== "ALL") where.submittedBy = submittedBy
    const a = g.access
    if (!a.isAdmin) {
        if (a.scope === "ASSIGNED_SITES") where.AND = [{ OR: [{ siteId: { in: a.siteIds } }, { submittedBy: a.userId }] }]
        else if (a.scope === "MY_TEAM") where.AND = [{ submittedBy: { in: [a.userId, ...(await teamUserIds(a.userId))] } }]
        else if (a.scope === "SELF") where.submittedBy = a.userId
    }

    const claims = await prisma.expense.findMany({ where, orderBy: [{ date: "asc" }, { expenseNo: "asc" }] })
    const userIds = Array.from(new Set(claims.flatMap(c => [c.submittedBy, c.approvedBy].filter((x): x is string => !!x))))
    const [users, emps, policy] = await Promise.all([
        prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }),
        prisma.employee.findMany({ where: { userId: { in: userIds } }, select: { userId: true, employeeId: true, designation: true, department: { select: { name: true } } } }),
        getExpensePolicy(),
    ])
    const userOf = new Map(users.map(u => [u.id, u]))
    const empOf = new Map(emps.map(e => [e.userId!, e]))
    const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)

    const lines = claims.flatMap(c => {
        const flags = checkClaim(c, policy, { today, label: expenseCategoryLabel }).filter(f => f.kind !== "age")
        const emp = empOf.get(c.submittedBy)
        return claimLines(c)
            .filter(l => !category || category === "ALL" || l.category === category)
            .map((l, i) => ({
                expenseNo: c.expenseNo, title: c.title, claimDate: c.date.toISOString().slice(0, 10), lineDate: l.date,
                line: i + 1, category: l.category, categoryLabel: expenseCategoryLabel(l.category), amount: l.amount,
                kms: l.kms || null, vehicleType: l.vehicleType, receipt: !!l.receiptUrl,
                employee: userOf.get(c.submittedBy)?.name ?? userOf.get(c.submittedBy)?.email ?? "", employeeCode: emp?.employeeId ?? "",
                designation: emp?.designation ?? "", department: emp?.department?.name ?? "",
                site: c.siteName ?? "", status: c.status,
                submittedOn: c.createdAt.toISOString().slice(0, 10),
                approvedBy: c.approvedBy ? userOf.get(c.approvedBy)?.name ?? "" : "", approvedOn: c.approvedAt?.toISOString().slice(0, 10) ?? "",
                rejectionReason: c.rejectionReason ?? "",
                paidOn: (c.paymentDate ?? c.paidAt)?.toISOString().slice(0, 10) ?? "", paymentMode: c.paymentMode ?? "", transactionId: c.transactionId ?? "",
                policyFlags: flags.filter(f => !f.category || f.category === l.category).map(f => f.message).join("; "),
            }))
    })
    auditLater({ actorId: a.userId, actorName: a.name, action: "expense.report", targetType: "Export", targetId: `${from}..${to}`, targetName: "Expense report", summary: `Expense report ${from} to ${to}: ${lines.length} line(s)`, ...requestMeta(req) })
    return NextResponse.json({ from, to, lines })
}
