// Asset recoveries (Assets → Recoveries): charges to an employee for items
// lost, damaged or not returned.
//   PENDING → SCHEDULED (with a salary, or in the F&F) → RECOVERED, or WAIVED
// Salary: added to that month's Other deductions (Payroll.assetRecovery shows
// how much of it); only months change control allows, never a locked payroll.
// The value of an item follows Assets → Settings → Recovery.
import prisma from "@/lib/prisma"
import { audit, withNumberRetry, WorkflowError } from "@/lib/asset-workflow"
import { getAssetSettings } from "@/lib/asset-settings"
import { effectiveWindow, ymLabel } from "@/lib/payroll-change-control"
import { recalcDraftPayroll } from "@/lib/payroll-recalc"

type YM = { month: number; year: number }

/** What one unit of an asset is charged at, after depreciation for the time it was out. */
export async function unitValue(assetId: string, issuedAt?: Date | null): Promise<number> {
    const s = await getAssetSettings()
    const [asset, detail] = await Promise.all([
        prisma.asset.findUnique({ where: { id: assetId }, select: { purchaseCost: true } }),
        prisma.assetDetail.findUnique({ where: { assetId }, select: { recoveryCost: true } }),
    ])
    const purchase = asset?.purchaseCost ?? null, set = detail?.recoveryCost ?? null
    let cost = (s.recovery.basis === "recoveryCost" ? (set ?? purchase) : (purchase ?? set)) ?? 0
    if (s.recovery.depreciationPctPerYear > 0 && issuedAt) {
        const years = Math.max(0, (Date.now() - issuedAt.getTime()) / (365.25 * 86_400_000))
        cost = cost * Math.max(0, 1 - (s.recovery.depreciationPctPerYear / 100) * years)
    }
    return Math.round(cost * 100) / 100
}

export async function createRecovery(input: {
    employeeId: string; assetId: string; issueId?: string | null; quantity: number
    reason: "LOST" | "DAMAGED" | "NOT_RETURNED"; amount?: number | null; note?: string | null; actorId: string; via?: "FNF" | null
}) {
    let amount = input.amount
    if (amount == null) {
        const issue = input.issueId ? await prisma.assetIssue.findUnique({ where: { id: input.issueId }, select: { issuedAt: true } }) : null
        amount = (await unitValue(input.assetId, issue?.issuedAt)) * input.quantity
    }
    if (!Number.isFinite(amount) || amount < 0) throw new WorkflowError(400, "Enter a valid amount")
    const rec = await withNumberRetry("recoveryNo", bump => prisma.$transaction(async tx => {
        const recoveryNo = await nextRecoveryNo(tx, bump)
        const r = await tx.assetRecovery.create({
            data: {
                recoveryNo, employeeId: input.employeeId, assetId: input.assetId, issueId: input.issueId ?? null, quantity: input.quantity,
                amount: Math.round(amount! * 100) / 100, reason: input.reason, note: input.note ?? null, createdBy: input.actorId,
                ...(input.via === "FNF" ? { status: "SCHEDULED", via: "FNF" } : {}),
            },
        })
        await audit(tx, { entity: "AssetRecovery", entityId: r.id, action: "CREATE", userId: input.actorId, after: r })
        return r
    }))
    return rec
}

async function nextRecoveryNo(tx: any, bump: number): Promise<string> {
    const last = await tx.assetRecovery.findFirst({ orderBy: { createdAt: "desc" }, select: { recoveryNo: true } })
    const n = Number(/(\d+)$/.exec(last?.recoveryNo ?? "")?.[1] ?? 0) + 1 + bump
    return `REC-${String(n).padStart(4, "0")}`
}

/** Salary recoveries for a payroll month, per employee id. */
export async function assetRecoveriesFor(employeeIds: string[], p: YM): Promise<Map<string, number>> {
    const out = new Map<string, number>()
    if (!employeeIds.length) return out
    const rows = await prisma.assetRecovery.findMany({ where: { employeeId: { in: employeeIds }, via: "PAYROLL", status: { in: ["SCHEDULED", "RECOVERED"] }, payrollMonth: p.month, payrollYear: p.year }, select: { employeeId: true, amount: true } })
    for (const r of rows) out.set(r.employeeId, Math.round(((out.get(r.employeeId) ?? 0) + r.amount) * 100) / 100)
    return out
}

/** Re-applies a month's salary recoveries to an employee's DRAFT payroll row, then recalculates it. */
async function refreshPayrollRecovery(employeeId: string, p: YM) {
    const row = await prisma.payroll.findFirst({ where: { employeeId, month: p.month, year: p.year, status: "DRAFT" }, select: { id: true, otherDeductions: true, assetRecovery: true } })
    if (!row) return false
    const next = (await assetRecoveriesFor([employeeId], p)).get(employeeId) ?? 0
    const prev = Number(row.assetRecovery) || 0
    if (Math.abs(next - prev) < 0.005) return true
    await prisma.payroll.update({ where: { id: row.id }, data: { assetRecovery: next, otherDeductions: Math.max(0, Math.round(((Number(row.otherDeductions) || 0) - prev + next) * 100) / 100) } })
    await recalcDraftPayroll({ from: p, employeeIds: [employeeId] })
    return true
}

export type RecoveryAction =
    | { action: "SCHEDULE_PAYROLL"; month: number; year: number }
    | { action: "FNF" } | { action: "CASH"; note?: string } | { action: "WAIVE"; note: string }
    | { action: "UNSCHEDULE" } | { action: "AMOUNT"; amount: number }

export async function actOnRecovery(id: string, a: RecoveryAction, actorId: string) {
    const r = await prisma.assetRecovery.findUnique({ where: { id } })
    if (!r) throw new WorkflowError(404, "Recovery not found")
    const done = r.status === "RECOVERED" || r.status === "WAIVED"
    const lockedRow = async (p: YM) => !!(await prisma.payroll.findFirst({ where: { employeeId: r.employeeId, month: p.month, year: p.year, status: { not: "DRAFT" } }, select: { id: true } }))
    const was = r.via === "PAYROLL" && r.payrollMonth && r.payrollYear ? { month: r.payrollMonth, year: r.payrollYear } : null
    const data: any = { decidedBy: actorId, decidedAt: new Date() }

    switch (a.action) {
        case "SCHEDULE_PAYROLL": {
            if (done) throw new WorkflowError(400, "This recovery is already closed")
            const w = await effectiveWindow()
            if (!w.allowed.some(x => x.month === a.month && x.year === a.year)) throw new WorkflowError(400, `Pick ${w.allowed.map(ymLabel).join(" or ")}`)
            if (await lockedRow(a)) throw new WorkflowError(400, `${ymLabel(a)} payroll for this employee is locked`)
            Object.assign(data, { status: "SCHEDULED", via: "PAYROLL", payrollMonth: a.month, payrollYear: a.year })
            break
        }
        case "UNSCHEDULE":
            if (r.status !== "SCHEDULED") throw new WorkflowError(400, "Only a scheduled recovery can be taken back")
            if (was && await lockedRow(was)) throw new WorkflowError(400, "That payroll is locked")
            Object.assign(data, { status: "PENDING", via: null, payrollMonth: null, payrollYear: null })
            break
        case "FNF":
            if (done) throw new WorkflowError(400, "This recovery is already closed")
            Object.assign(data, { status: "SCHEDULED", via: "FNF", payrollMonth: null, payrollYear: null })
            break
        case "CASH":
            if (done) throw new WorkflowError(400, "This recovery is already closed")
            Object.assign(data, { status: "RECOVERED", via: "CASH", payrollMonth: null, payrollYear: null, note: [r.note, a.note].filter(Boolean).join("\n") || r.note })
            break
        case "WAIVE":
            if (done) throw new WorkflowError(400, "This recovery is already closed")
            if (!a.note || a.note.trim().length < 3) throw new WorkflowError(400, "Give a reason for waiving it")
            Object.assign(data, { status: "WAIVED", via: null, payrollMonth: null, payrollYear: null, note: [r.note, `Waived: ${a.note.trim()}`].filter(Boolean).join("\n") })
            break
        case "AMOUNT":
            if (done) throw new WorkflowError(400, "This recovery is already closed")
            if (!Number.isFinite(a.amount) || a.amount < 0) throw new WorkflowError(400, "Enter a valid amount")
            data.amount = Math.round(a.amount * 100) / 100
            break
    }
    // Moving off a locked salary month isn't possible.
    if (was && a.action !== "AMOUNT" && a.action !== "SCHEDULE_PAYROLL" && await lockedRow(was)) throw new WorkflowError(400, "That payroll is locked")
    const updated = await prisma.assetRecovery.update({ where: { id }, data })
    await audit(prisma, { entity: "AssetRecovery", entityId: id, action: a.action, userId: actorId, before: r, after: updated })
    // Keep the draft payroll rows in step (old month and new month).
    let payrollUpdated = false
    if (was) payrollUpdated = (await refreshPayrollRecovery(r.employeeId, was)) || payrollUpdated
    if (updated.via === "PAYROLL" && updated.payrollMonth && updated.payrollYear && (!was || was.month !== updated.payrollMonth || was.year !== updated.payrollYear)) {
        payrollUpdated = (await refreshPayrollRecovery(r.employeeId, { month: updated.payrollMonth, year: updated.payrollYear })) || payrollUpdated
    }
    return { recovery: updated, payrollUpdated }
}

/** Employees leaving (open exit, or resigned) who still hold assets. */
export async function leaversHoldingAssets() {
    const exits = await prisma.exitRequest.findMany({ where: { status: { notIn: ["COMPLETED", "CANCELLED"] as any } }, select: { employeeId: true, status: true, lastWorkingDate: true } })
    const resigned = await prisma.employee.findMany({ where: { status: "RESIGNED" as any }, select: { id: true } })
    const ids = Array.from(new Set([...exits.map(e => e.employeeId), ...resigned.map(e => e.id)]))
    if (!ids.length) return []
    const issues = await prisma.assetIssue.findMany({
        where: { employeeId: { in: ids }, status: "ACTIVE" },
        select: { id: true, issueNo: true, employeeId: true, assetId: true, quantity: true, returnedQty: true, issuedAt: true, asset: { select: { name: true, assetCode: true } }, employee: { select: { firstName: true, lastName: true, employeeId: true, status: true } } },
    })
    const charged = new Set((await prisma.assetRecovery.findMany({ where: { issueId: { in: issues.map(i => i.id) }, status: { not: "WAIVED" } }, select: { issueId: true } })).map(r => r.issueId))
    const exitOf = new Map(exits.map(e => [e.employeeId, e]))
    return issues.filter(i => i.quantity - i.returnedQty > 0).map(i => ({
        issueId: i.id, issueNo: i.issueNo, employeeId: i.employeeId, assetId: i.assetId,
        employee: `${i.employee.firstName} ${i.employee.lastName}`.trim(), code: i.employee.employeeId,
        exitStatus: exitOf.get(i.employeeId)?.status ?? i.employee.status, lastWorkingDate: exitOf.get(i.employeeId)?.lastWorkingDate?.toISOString().slice(0, 10) ?? null,
        asset: i.asset.name, assetCode: i.asset.assetCode, outstanding: i.quantity - i.returnedQty, issuedAt: i.issuedAt.toISOString().slice(0, 10),
        charged: charged.has(i.id),
    }))
}

