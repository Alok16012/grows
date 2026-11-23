// Daily expense job (vercel.json → /api/cron/expense-daily): remind whoever
// must act on claims waiting longer than the policy allows, and tell admins
// about claims waiting past the escalation limit. All limits are in
// Expense Claims → Policy → Approval.
import prisma from "@/lib/prisma"
import { notifyApprovers } from "@/lib/hr-notify"
import { getExpensePolicy } from "@/lib/expense-policy-server"
import { managersOf } from "@/lib/expense-approval"

export async function runExpenseDaily(now = new Date()) {
    const policy = await getExpensePolicy()
    const { remindAfterHours, escalateAfterHours, mode } = policy.approval
    const advancesDue = await remindAdvances(policy.advance.settleWithinDays, now)
    if (!remindAfterHours && !escalateAfterHours) return { reminded: 0, escalated: 0, advancesDue }
    const waiting = await prisma.expense.findMany({
        where: { status: "SUBMITTED" },
        select: { id: true, expenseNo: true, submittedBy: true, amount: true, updatedAt: true, approvalStage: true, approvalTrail: true },
    })
    // Waiting since the last step on the claim (submit or manager approval).
    const since = (e: typeof waiting[number]) => {
        const t = Array.isArray(e.approvalTrail) ? (e.approvalTrail as any[]) : []
        const last = t.length ? new Date(t[t.length - 1].at) : e.updatedAt
        return isNaN(last.getTime()) ? e.updatedAt : last
    }
    const hours = (e: typeof waiting[number]) => (now.getTime() - since(e).getTime()) / 3_600_000
    const managers = mode === "twoLevel" ? await managersOf(waiting.map(w => w.submittedBy)) : new Map<string, string>()

    let reminded = 0, escalated = 0
    if (remindAfterHours > 0) {
        const due = waiting.filter(e => hours(e) >= remindAfterHours)
        const byManager = new Map<string, typeof due>()
        const forFinal: typeof due = []
        for (const e of due) {
            const m = mode === "twoLevel" && (e.approvalStage ?? 1) <= 1 ? managers.get(e.submittedBy) : undefined
            if (m) byManager.set(m, [...(byManager.get(m) ?? []), e]); else forFinal.push(e)
        }
        for (const [userId, list] of Array.from(byManager)) {
            await prisma.notification.create({ data: { userId, title: "Expense claims waiting for you", message: `${list.length} claim${list.length === 1 ? "" : "s"} from your team waiting more than ${remindAfterHours} h: ${list.slice(0, 5).map(e => e.expenseNo).join(", ")}${list.length > 5 ? "…" : ""}`, type: "expense", link: "/expenses" } }).catch(() => {})
            reminded += list.length
        }
        if (forFinal.length) {
            await notifyApprovers(["expenses.approve"], { title: "Expense claims waiting for approval", message: `${forFinal.length} claim${forFinal.length === 1 ? "" : "s"} waiting more than ${remindAfterHours} h: ${forFinal.slice(0, 5).map(e => e.expenseNo).join(", ")}${forFinal.length > 5 ? "…" : ""}`, type: "expense", link: "/expenses?status=SUBMITTED" })
            reminded += forFinal.length
        }
    }
    if (escalateAfterHours > 0) {
        const late = waiting.filter(e => hours(e) >= escalateAfterHours)
        if (late.length) {
            const admins = await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true }, take: 50 })
            const total = late.reduce((s, e) => s + (Number(e.amount) || 0), 0)
            for (const a of admins) {
                await prisma.notification.create({ data: { userId: a.id, title: "Expense claims overdue", message: `${late.length} claim${late.length === 1 ? "" : "s"} (₹${Math.round(total).toLocaleString("en-IN")}) waiting more than ${escalateAfterHours} h for approval`, type: "expense", link: "/expenses?status=SUBMITTED" } }).catch(() => {})
            }
            escalated = late.length
        }
    }
    return { reminded, escalated, advancesDue }
}

/** Paid advances not settled within the policy's days: remind the employee and Accounts. */
async function remindAdvances(days: number, now: Date): Promise<number> {
    if (!days) return 0
    const cutoff = new Date(now.getTime() - days * 86_400_000)
    const due = await prisma.expenseAdvance.findMany({ where: { status: "PAID", paidAt: { lt: cutoff } }, select: { advanceNo: true, requestedBy: true, amount: true } })
    for (const a of due) {
        await prisma.notification.create({ data: { userId: a.requestedBy, title: "Settle your advance", message: `${a.advanceNo} (₹${a.amount.toLocaleString("en-IN")}) was paid more than ${days} days ago — file your expense claims against it so it can be settled.`, type: "expense", link: "/expenses/advances" } }).catch(() => {})
    }
    if (due.length) await notifyApprovers(["expenses.markPaid"], { title: "Advances waiting to be settled", message: `${due.length} advance${due.length === 1 ? "" : "s"} paid more than ${days} days ago are not settled: ${due.slice(0, 5).map(a => a.advanceNo).join(", ")}${due.length > 5 ? "…" : ""}`, type: "expense", link: "/expenses/advances" })
    return due.length
}
