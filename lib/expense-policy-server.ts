import prisma from "@/lib/prisma"
import { checkClaim, claimLines, sanitizeExpensePolicy, type ExpensePolicy, type PolicyFlag } from "@/lib/expense-policy"

const KEY = "expensePolicy"

export async function getExpensePolicy(): Promise<ExpensePolicy> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: KEY } })
        return sanitizeExpensePolicy(row?.value ? JSON.parse(row.value) : {})
    } catch { return sanitizeExpensePolicy({}) }
}

export async function saveExpensePolicy(input: unknown, userId: string): Promise<ExpensePolicy> {
    const p = sanitizeExpensePolicy(input)
    const value = JSON.stringify(p)
    await prisma.appSetting.upsert({ where: { key: KEY }, update: { value, updatedBy: userId }, create: { key: KEY, value, updatedBy: userId } })
    return p
}

/**
 * What the claimant already has per month ("yyyy-MM") per category on other
 * claims that count (submitted, approved, paid) — for per-month limits.
 */
export async function monthClaimedFor(submittedBy: string, months: string[], excludeId?: string): Promise<Record<string, Record<string, number>>> {
    const out: Record<string, Record<string, number>> = {}
    if (!months.length) return out
    const sorted = [...months].sort()
    const from = new Date(sorted[0] + "-01T00:00:00Z")
    const last = new Date(sorted[sorted.length - 1] + "-01T00:00:00Z"); last.setUTCMonth(last.getUTCMonth() + 1)
    // A little wider on both sides: line dates can differ from the claim date.
    from.setUTCMonth(from.getUTCMonth() - 1); last.setUTCMonth(last.getUTCMonth() + 1)
    const rows = await prisma.expense.findMany({
        where: { submittedBy, status: { in: ["SUBMITTED", "APPROVED", "PAID"] }, date: { gte: from, lt: last }, ...(excludeId ? { id: { not: excludeId } } : {}) },
        select: { category: true, amount: true, date: true, receiptUrl: true, categoryItems: true, travelEntries: true },
    })
    for (const r of rows) for (const l of claimLines(r)) {
        const m = (l.date ?? r.date.toISOString()).slice(0, 7)
        if (!months.includes(m)) continue
        out[m] = out[m] ?? {}
        out[m][l.category] = (out[m][l.category] ?? 0) + l.amount
    }
    return out
}

/** Policy flags for a stored claim (or claim data about to be submitted). */
export async function policyFlagsFor(exp: any, policy?: ExpensePolicy): Promise<PolicyFlag[]> {
    const p = policy ?? await getExpensePolicy()
    const needMonths = Object.values(p.limits).some(l => l.perMonth)
    const months = Array.from(new Set(claimLines(exp).map(l => (l.date ?? new Date().toISOString()).slice(0, 7))))
    const monthClaimed = needMonths && exp?.submittedBy ? await monthClaimedFor(exp.submittedBy, months, exp.id) : undefined
    const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10) // IST
    return checkClaim(exp, p, { today, monthClaimed })
}
