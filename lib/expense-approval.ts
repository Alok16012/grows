// Expense approval levels (Expense Claims → Policy → Approval).
//   single   — anyone with Manage Expenses approves (as before).
//   twoLevel — the claimant's reporting manager approves first (stage 1), then
//              Accounts / HR (Manage Expenses) give final approval (stage 2) for
//              claims above the amount set (0 = every claim). Claimants with no
//              reporting manager go straight to final approval.
import prisma from "@/lib/prisma"
import type { ExpensePolicy } from "@/lib/expense-policy"

export type TrailEntry = { stage: number; action: "SUBMITTED" | "APPROVED" | "REJECTED" | "PAID" | "FORWARDED"; by: string; byName: string | null; at: string; note?: string | null }

/** The claimant's reporting manager (a user id), never the claimant themself. */
export async function managerOf(userId: string): Promise<string | null> {
    const e = await prisma.employee.findFirst({ where: { userId }, select: { managerId: true } })
    const m = e?.managerId ?? null
    return m && m !== userId ? m : null
}

/** Managers per claimant, for many claims at once. */
export async function managersOf(userIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>()
    if (!userIds.length) return out
    const rows = await prisma.employee.findMany({ where: { userId: { in: Array.from(new Set(userIds)) } }, select: { userId: true, managerId: true } })
    for (const r of rows) if (r.userId && r.managerId && r.managerId !== r.userId) out.set(r.userId, r.managerId)
    return out
}

/** Stage a claim starts at when submitted. */
export async function startStage(policy: ExpensePolicy, submittedBy: string): Promise<number> {
    if (policy.approval.mode !== "twoLevel") return 2
    return (await managerOf(submittedBy)) ? 1 : 2
}

/** After the manager approves: does it still need final approval? */
export function needsFinal(policy: ExpensePolicy, amount: number): boolean {
    return policy.approval.mode === "twoLevel" && (policy.approval.finalAbove <= 0 || amount > policy.approval.finalAbove)
}

/** Who may approve / reject a SUBMITTED claim right now. */
export function canApproveNow(opts: {
    policy: ExpensePolicy; stage: number; status: string; submittedBy: string
    userId: string; isAdmin: boolean; canManage: boolean; managerId: string | null
}): boolean {
    const { policy, stage, status, submittedBy, userId, isAdmin, canManage, managerId } = opts
    if (status !== "SUBMITTED") return false
    if (submittedBy === userId && !isAdmin) return false
    if (policy.approval.mode !== "twoLevel") return canManage || isAdmin
    if (stage <= 1) return managerId === userId || isAdmin || canManage // Accounts / HR may step in for an absent manager
    return canManage || isAdmin
}

/** A short status for people: "Awaiting manager", "Awaiting final approval", … */
export function approvalLabel(policy: ExpensePolicy, status: string, stage: number): string | null {
    if (status !== "SUBMITTED" || policy.approval.mode !== "twoLevel") return null
    return stage <= 1 ? "Awaiting manager" : "Manager approved — awaiting final"
}

export function pushTrail(trail: unknown, e: TrailEntry): TrailEntry[] {
    const list = Array.isArray(trail) ? (trail as TrailEntry[]) : []
    return [...list, e].slice(-50)
}
