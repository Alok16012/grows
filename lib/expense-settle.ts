// Settling approved expense claims (Expense Claims → Settle approved claims):
//   BANK    — paid by accounts (mode, date, UTR), many at once.
//   PAYROLL — added to a payroll month as a Reimbursement line: into net pay,
//             never gross / PF / ESIC (like arrears). Only months not yet locked
//             (the open payroll month or the next, as change control allows).
import prisma from "@/lib/prisma"
import { pushTrail } from "@/lib/expense-approval"
import { openPayrollMonth, effectiveWindow, ymLabel } from "@/lib/payroll-change-control"

type YM = { month: number; year: number }
type Actor = { id: string; name: string | null }

/** userId → employee (id) for claimants. */
export async function employeesOfUsers(userIds: string[]): Promise<Map<string, { id: string; code: string }>> {
    const rows = userIds.length ? await prisma.employee.findMany({ where: { userId: { in: Array.from(new Set(userIds)) } }, select: { id: true, userId: true, employeeId: true } }) : []
    return new Map(rows.map(r => [r.userId!, { id: r.id, code: r.employeeId }]))
}

/** Expense reimbursements to pay with a month's salary, per employee id. */
export async function reimbursementsFor(employeeIds: string[], p: YM): Promise<Map<string, number>> {
    const out = new Map<string, number>()
    if (!employeeIds.length) return out
    const emps = await prisma.employee.findMany({ where: { id: { in: employeeIds }, userId: { not: null } }, select: { id: true, userId: true } })
    const byUser = new Map(emps.map(e => [e.userId!, e.id]))
    if (!byUser.size) return out
    const claims = await prisma.expense.findMany({
        where: { settledVia: "PAYROLL", payrollMonth: p.month, payrollYear: p.year, status: "PAID", submittedBy: { in: Array.from(byUser.keys()) } },
        select: { submittedBy: true, amount: true },
    })
    for (const c of claims) { const id = byUser.get(c.submittedBy)!; out.set(id, Math.round(((out.get(id) ?? 0) + (Number(c.amount) || 0)) * 100) / 100) }
    return out
}

/** Puts the month's reimbursement onto these employees' DRAFT payroll rows (net pay follows). */
export async function refreshReimbursement(employeeIds: string[], p: YM): Promise<number> {
    if (!employeeIds.length) return 0
    const sums = await reimbursementsFor(employeeIds, p)
    const rows = await prisma.payroll.findMany({ where: { employeeId: { in: employeeIds }, month: p.month, year: p.year, status: "DRAFT" }, select: { id: true, employeeId: true, netSalary: true, reimbursement: true } })
    let n = 0
    for (const r of rows) {
        const next = sums.get(r.employeeId) ?? 0
        const prev = Number(r.reimbursement) || 0
        if (Math.abs(next - prev) < 0.005) continue
        await prisma.payroll.update({ where: { id: r.id }, data: { reimbursement: next, netSalary: Math.round((Number(r.netSalary) || 0) - prev + next) } })
        n++
    }
    // Month totals follow.
    const runIds = Array.from(new Set((await prisma.payroll.findMany({ where: { id: { in: rows.map(r => r.id) } }, select: { payrollRunId: true } })).map(r => r.payrollRunId).filter((x): x is string => !!x)))
    for (const runId of runIds) {
        const t = await prisma.payroll.aggregate({ where: { payrollRunId: runId }, _sum: { netSalary: true } })
        await prisma.payrollRun.update({ where: { id: runId }, data: { totalNet: t._sum.netSalary ?? 0 } }).catch(() => {})
    }
    return n
}

export async function settleWindow() {
    const [open, w] = await Promise.all([openPayrollMonth(), effectiveWindow()])
    return { open, allowed: w.allowed }
}

/** Marks approved claims paid by bank. */
export async function settleBank(ids: string[], pay: { paymentMode: string; transactionId?: string | null; paymentDate?: string | null }, actor: Actor) {
    const claims = await prisma.expense.findMany({ where: { id: { in: ids }, status: "APPROVED" }, select: { id: true, approvalStage: true, approvalTrail: true, submittedBy: true } })
    const ok = claims.filter(c => c.submittedBy !== actor.id)
    const when = pay.paymentDate ? new Date(pay.paymentDate) : new Date()
    for (const c of ok) {
        await prisma.expense.update({
            where: { id: c.id },
            data: {
                status: "PAID", paidAt: new Date(), paymentDate: when, paymentMode: pay.paymentMode, transactionId: pay.transactionId || null, settledVia: "BANK",
                approvalTrail: pushTrail(c.approvalTrail, { stage: c.approvalStage ?? 2, action: "PAID", by: actor.id, byName: actor.name, at: new Date().toISOString(), note: `${pay.paymentMode}${pay.transactionId ? ` · ${pay.transactionId}` : ""}` }) as any,
            },
        })
    }
    return { settled: ok.length, skipped: ids.length - ok.length, claimants: Array.from(new Set(ok.map(c => c.submittedBy))) }
}

/** Adds approved claims to a payroll month (open month or next). */
export async function settleWithSalary(ids: string[], p: YM, actor: Actor) {
    const w = await settleWindow()
    if (!w.allowed.some(a => a.month === p.month && a.year === p.year)) {
        throw new Error(`Pick ${w.allowed.map(ymLabel).join(" or ")} — earlier payroll months are locked`)
    }
    const claims = await prisma.expense.findMany({ where: { id: { in: ids }, status: "APPROVED" }, select: { id: true, approvalStage: true, approvalTrail: true, submittedBy: true } })
    const emps = await employeesOfUsers(claims.map(c => c.submittedBy))
    const locked = new Set((await prisma.payroll.findMany({
        where: { month: p.month, year: p.year, status: { not: "DRAFT" }, employeeId: { in: Array.from(emps.values()).map(e => e.id) } }, select: { employeeId: true },
    })).map(r => r.employeeId))
    const ok = claims.filter(c => c.submittedBy !== actor.id && emps.has(c.submittedBy) && !locked.has(emps.get(c.submittedBy)!.id))
    const lastDay = new Date(Date.UTC(p.year, p.month, 0))
    for (const c of ok) {
        await prisma.expense.update({
            where: { id: c.id },
            data: {
                status: "PAID", paidAt: new Date(), paymentDate: lastDay, paymentMode: "With salary", transactionId: null,
                settledVia: "PAYROLL", payrollMonth: p.month, payrollYear: p.year,
                approvalTrail: pushTrail(c.approvalTrail, { stage: c.approvalStage ?? 2, action: "PAID", by: actor.id, byName: actor.name, at: new Date().toISOString(), note: `With ${ymLabel(p)} salary` }) as any,
            },
        })
    }
    const employeeIds = Array.from(new Set(ok.map(c => emps.get(c.submittedBy)!.id)))
    const rowsUpdated = await refreshReimbursement(employeeIds, p)
    return {
        settled: ok.length,
        noEmployee: claims.filter(c => !emps.has(c.submittedBy)).length,
        lockedPayroll: claims.filter(c => emps.has(c.submittedBy) && locked.has(emps.get(c.submittedBy)!.id)).length,
        rowsUpdated, claimants: Array.from(new Set(ok.map(c => c.submittedBy))),
    }
}

/** Takes salary-settled claims back to "approved" (only while that month's payroll is a draft). */
export async function unsettleSalary(ids: string[], actor: Actor) {
    const claims = await prisma.expense.findMany({ where: { id: { in: ids }, status: "PAID", settledVia: "PAYROLL" }, select: { id: true, submittedBy: true, payrollMonth: true, payrollYear: true, approvalStage: true, approvalTrail: true } })
    const emps = await employeesOfUsers(claims.map(c => c.submittedBy))
    let n = 0
    const touched = new Map<string, { p: YM; ids: Set<string> }>()
    for (const c of claims) {
        if (!c.payrollMonth || !c.payrollYear) continue
        const emp = emps.get(c.submittedBy)
        if (emp) {
            const lockedRow = await prisma.payroll.findFirst({ where: { employeeId: emp.id, month: c.payrollMonth, year: c.payrollYear, status: { not: "DRAFT" } }, select: { id: true } })
            if (lockedRow) continue
        }
        await prisma.expense.update({
            where: { id: c.id },
            data: {
                status: "APPROVED", paidAt: null, paymentDate: null, paymentMode: null, settledVia: null, payrollMonth: null, payrollYear: null,
                approvalTrail: pushTrail(c.approvalTrail, { stage: c.approvalStage ?? 2, action: "APPROVED", by: actor.id, byName: actor.name, at: new Date().toISOString(), note: "Taken off salary" }) as any,
            },
        })
        n++
        if (emp) {
            const k = `${c.payrollYear}-${c.payrollMonth}`
            const t = touched.get(k) ?? { p: { month: c.payrollMonth, year: c.payrollYear }, ids: new Set<string>() }
            t.ids.add(emp.id); touched.set(k, t)
        }
    }
    for (const t of Array.from(touched.values())) await refreshReimbursement(Array.from(t.ids), t.p)
    return { reverted: n }
}
