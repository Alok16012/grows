// Expense advances (Expense Claims → Advances).
//   REQUESTED → APPROVED → PAID → SETTLED (or REJECTED)
// The employee files their expense claims "against" a paid advance. Settling
// compares what was claimed (approved / paid claims) with the advance:
//   claimed < advance → the employee owes the rest: recovered from a salary
//                       (added to that month's Advance deduction) or returned
//   claimed > advance → the company owes the rest: paid by bank or with a
//                       salary (Expense reimbursement line)
// Claims filed against an advance are settled through it, never paid twice.
import prisma from "@/lib/prisma"
import { pushTrail } from "@/lib/expense-approval"
import { settleWindow, refreshReimbursement, employeesOfUsers } from "@/lib/expense-settle"
import { ymLabel } from "@/lib/payroll-change-control"
import { recalcDraftPayroll } from "@/lib/payroll-recalc"

type YM = { month: number; year: number }
type Actor = { id: string; name: string | null }

export async function nextAdvanceNo(): Promise<string> {
    const last = await prisma.expenseAdvance.findFirst({ orderBy: { createdAt: "desc" }, select: { advanceNo: true } })
    const n = Number(/(\d+)$/.exec(last?.advanceNo ?? "")?.[1] ?? 0) + 1
    for (let i = 0; i < 20; i++) {
        const no = `ADV-${String(n + i).padStart(4, "0")}`
        if (!(await prisma.expenseAdvance.findUnique({ where: { advanceNo: no }, select: { id: true } }))) return no
    }
    return `ADV-${Date.now().toString().slice(-6)}`
}

/** What has been claimed against each advance (submitted, approved or paid claims). */
export async function claimedAgainst(advanceIds: string[]): Promise<Map<string, { approved: number; pending: number; claims: number }>> {
    const out = new Map<string, { approved: number; pending: number; claims: number }>()
    if (!advanceIds.length) return out
    const rows = await prisma.expense.findMany({ where: { advanceId: { in: advanceIds }, status: { in: ["SUBMITTED", "APPROVED", "PAID"] } }, select: { advanceId: true, amount: true, status: true } })
    for (const r of rows) {
        const o = out.get(r.advanceId!) ?? { approved: 0, pending: 0, claims: 0 }
        if (r.status === "SUBMITTED") o.pending += Number(r.amount) || 0; else o.approved += Number(r.amount) || 0
        o.claims++
        out.set(r.advanceId!, o)
    }
    return out
}

/** A paid, unsettled advance of this user that a claim may be filed against. */
export async function usableAdvance(advanceId: string, userId: string): Promise<boolean> {
    const a = await prisma.expenseAdvance.findUnique({ where: { id: advanceId }, select: { requestedBy: true, status: true } })
    return !!a && a.requestedBy === userId && a.status === "PAID"
}

/** Salary recoveries of advances for a payroll month, per employee id (added to the Advance deduction). */
export async function advanceRecoveriesFor(employeeIds: string[], p: YM): Promise<Map<string, number>> {
    const out = new Map<string, number>()
    if (!employeeIds.length) return out
    const emps = await prisma.employee.findMany({ where: { id: { in: employeeIds }, userId: { not: null } }, select: { id: true, userId: true } })
    const byUser = new Map(emps.map(e => [e.userId!, e.id]))
    if (!byUser.size) return out
    const rows = await prisma.expenseAdvance.findMany({ where: { status: "SETTLED", balanceAction: "RECOVER_SALARY", recoverMonth: p.month, recoverYear: p.year, requestedBy: { in: Array.from(byUser.keys()) } }, select: { requestedBy: true, balanceAmount: true } })
    for (const r of rows) { const id = byUser.get(r.requestedBy)!; out.set(id, Math.round(((out.get(id) ?? 0) + (Number(r.balanceAmount) || 0)) * 100) / 100) }
    return out
}

/** Advance balances paid to employees with a salary, per employee id (added to the reimbursement line). */
export async function advancePayoutsFor(employeeIds: string[], p: YM): Promise<Map<string, number>> {
    const out = new Map<string, number>()
    if (!employeeIds.length) return out
    const emps = await prisma.employee.findMany({ where: { id: { in: employeeIds }, userId: { not: null } }, select: { id: true, userId: true } })
    const byUser = new Map(emps.map(e => [e.userId!, e.id]))
    if (!byUser.size) return out
    const rows = await prisma.expenseAdvance.findMany({ where: { status: "SETTLED", balanceAction: "PAY_SALARY", recoverMonth: p.month, recoverYear: p.year, requestedBy: { in: Array.from(byUser.keys()) } }, select: { requestedBy: true, balanceAmount: true } })
    for (const r of rows) { const id = byUser.get(r.requestedBy)!; out.set(id, Math.round(((out.get(id) ?? 0) + (Number(r.balanceAmount) || 0)) * 100) / 100) }
    return out
}

/** Puts a month's advance recoveries onto DRAFT payroll rows (Advance deduction), then recalculates them. */
async function refreshRecovery(employeeId: string, p: YM, delta: number) {
    const row = await prisma.payroll.findFirst({ where: { employeeId, month: p.month, year: p.year, status: "DRAFT" }, select: { id: true, advance: true } })
    if (!row) return false
    await prisma.payroll.update({ where: { id: row.id }, data: { advance: Math.max(0, Math.round(((Number(row.advance) || 0) + delta) * 100) / 100) } })
    await recalcDraftPayroll({ from: p, employeeIds: [employeeId] })
    return true
}

export type SettleChoice =
    | { action: "RECOVER_SALARY"; month: number; year: number }
    | { action: "RETURNED"; note?: string }
    | { action: "PAY_BANK"; paymentMode: string; transactionId?: string | null }
    | { action: "PAY_SALARY"; month: number; year: number }
    | { action: "NONE" }

/** Settles a paid advance against its claims. */
export async function settleAdvance(id: string, choice: SettleChoice, actor: Actor) {
    const adv = await prisma.expenseAdvance.findUnique({ where: { id } })
    if (!adv) throw new Error("Advance not found")
    if (adv.status !== "PAID") throw new Error("Only a paid advance can be settled")
    const pending = await prisma.expense.count({ where: { advanceId: id, status: "SUBMITTED" } })
    if (pending) throw new Error(`${pending} claim(s) against this advance are still waiting for approval — approve or reject them first`)
    const claims = await prisma.expense.findMany({ where: { advanceId: id, status: { in: ["APPROVED", "PAID"] } }, select: { id: true, amount: true, status: true, approvalStage: true, approvalTrail: true } })
    const claimed = Math.round(claims.reduce((s, c) => s + (Number(c.amount) || 0), 0) * 100) / 100
    const diff = Math.round((claimed - adv.amount) * 100) / 100 // > 0 company owes, < 0 employee owes
    const w = await settleWindow()
    const monthOk = (p: YM) => w.allowed.some(a => a.month === p.month && a.year === p.year)

    let balanceAction = "NONE", balanceAmount = 0, recoverMonth: number | null = null, recoverYear: number | null = null, note = ""
    let paymentMode: string | null = null, transactionId: string | null = null
    if (diff < 0) {
        balanceAmount = -diff
        if (choice.action === "RECOVER_SALARY") {
            if (!monthOk(choice)) throw new Error(`Pick ${w.allowed.map(ymLabel).join(" or ")}`)
            balanceAction = "RECOVER_SALARY"; recoverMonth = choice.month; recoverYear = choice.year
            note = `₹${balanceAmount} to recover from ${ymLabel(choice)} salary`
        } else if (choice.action === "RETURNED") {
            balanceAction = "RETURNED"; note = `₹${balanceAmount} returned by the employee${choice.note ? ` (${choice.note})` : ""}`
        } else throw new Error("The employee owes the balance: recover it from salary or record that it was returned")
    } else if (diff > 0) {
        balanceAmount = diff
        if (choice.action === "PAY_BANK") {
            balanceAction = "PAY_BANK"; paymentMode = choice.paymentMode; transactionId = choice.transactionId ?? null
            note = `₹${balanceAmount} paid to the employee by ${choice.paymentMode}`
        } else if (choice.action === "PAY_SALARY") {
            if (!monthOk(choice)) throw new Error(`Pick ${w.allowed.map(ymLabel).join(" or ")}`)
            balanceAction = "PAY_SALARY"; recoverMonth = choice.month; recoverYear = choice.year
            note = `₹${balanceAmount} paid with ${ymLabel(choice)} salary`
        } else throw new Error("The company owes the balance: pay it by bank or with salary")
    } else note = "Claims equal the advance"

    // Claims are settled through the advance.
    for (const c of claims.filter(c => c.status === "APPROVED")) {
        await prisma.expense.update({
            where: { id: c.id },
            data: {
                status: "PAID", paidAt: new Date(), paymentDate: new Date(), paymentMode: `Against ${adv.advanceNo}`, settledVia: "ADVANCE",
                approvalTrail: pushTrail(c.approvalTrail, { stage: c.approvalStage ?? 2, action: "PAID", by: actor.id, byName: actor.name, at: new Date().toISOString(), note: `Settled against ${adv.advanceNo}` }) as any,
            },
        })
    }
    const updated = await prisma.expenseAdvance.update({
        where: { id },
        data: {
            status: "SETTLED", settledAt: new Date(), settledBy: actor.id, claimedAmount: claimed,
            balanceAction, balanceAmount, recoverMonth, recoverYear,
            ...(paymentMode ? { notes: [adv.notes, `Balance ${paymentMode}${transactionId ? ` · ${transactionId}` : ""}`].filter(Boolean).join("\n") } : {}),
            approvalTrail: pushTrail(adv.approvalTrail, { stage: 2, action: "PAID", by: actor.id, byName: actor.name, at: new Date().toISOString(), note: `Settled — ${note}` }) as any,
        },
    })
    // Salary effects on draft payroll rows.
    let payrollUpdated = false
    if (recoverMonth && recoverYear) {
        const emp = (await employeesOfUsers([adv.requestedBy])).get(adv.requestedBy)
        if (emp) {
            const p = { month: recoverMonth, year: recoverYear }
            payrollUpdated = balanceAction === "RECOVER_SALARY" ? await refreshRecovery(emp.id, p, balanceAmount) : (await refreshReimbursement([emp.id], p)) > 0
        }
    }
    return { advance: updated, claimed, diff, note, payrollUpdated }
}
