import prisma from "@/lib/prisma"
import { getLeavePolicy, getLeaveBalances } from "@/lib/leave-policy-server"
import { DAY_MS } from "@/lib/leave-policy"

// Full & Final settlement for a leaver, worked out from what the system knows:
// salary structure, attendance month, leave balance, service length, notice
// served, advances, unreturned assets and unpaid expense claims.
//
// Every line says how it was derived, so HR can check it rather than trust it.
// HR's own extra lines (bonus, damages …) and the payment record are kept in
// AppSetting under `exitFnf:<exitId>` — no new table on the live database.

export type FnfLine = { key: string; label: string; amount: number; note: string; kind: "earning" | "deduction"; auto: boolean }
export type FnfAdjustment = { label: string; amount: number; kind: "earning" | "deduction" }
export type FnfRecord = { adjustments: FnfAdjustment[]; paymentMode?: string; reference?: string; excluded?: string[] }

const fnfKey = (exitId: string) => `exitFnf:${exitId}`
const round = (n: number) => Math.round(n)
const GRATUITY_CAP = 2_000_000
// Payment of Gratuity Act: 5 years' continuous service, which courts and most
// employers read as 4 years 240 days.
const GRATUITY_MIN_DAYS = 4 * 365 + 240

export async function getFnfRecord(exitId: string): Promise<FnfRecord> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: fnfKey(exitId) } })
        const v = row?.value ? JSON.parse(row.value) : {}
        return {
            adjustments: Array.isArray(v.adjustments) ? v.adjustments.filter((a: any) => a && typeof a.label === "string" && Number.isFinite(Number(a.amount))).map((a: any) => ({ label: String(a.label).slice(0, 80), amount: Math.abs(Number(a.amount)), kind: a.kind === "deduction" ? "deduction" : "earning" })) : [],
            paymentMode: typeof v.paymentMode === "string" ? v.paymentMode : undefined,
            reference: typeof v.reference === "string" ? v.reference : undefined,
            excluded: Array.isArray(v.excluded) ? v.excluded.filter((x: unknown) => typeof x === "string") : [],
        }
    } catch {
        return { adjustments: [] }
    }
}

export async function saveFnfRecord(exitId: string, rec: FnfRecord, userId: string) {
    const value = JSON.stringify(rec)
    await prisma.appSetting.upsert({
        where: { key: fnfKey(exitId) },
        update: { value, updatedBy: userId },
        create: { key: fnfKey(exitId), value, updatedBy: userId },
    })
}

const EMPLOYEE_SELECT = {
    id: true, firstName: true, lastName: true, employeeId: true, userId: true,
    dateOfJoining: true, basicSalary: true, employeeSalary: true,
} as const

export async function computeSettlement(exitId: string) {
    const exit = await prisma.exitRequest.findUnique({
        where: { id: exitId },
        include: { employee: { select: EMPLOYEE_SELECT } },
    })
    if (!exit) return null
    return settlementFor(exit, await getFnfRecord(exitId))
}

type ExitInput = {
    id: string
    exitType: string
    resignationDate: Date
    lastWorkingDate: Date | null
    noticePeriodDays: number
    employee: Awaited<ReturnType<typeof loadEmployee>>
}
const loadEmployee = (id: string) => prisma.employee.findUniqueOrThrow({ where: { id }, select: EMPLOYEE_SELECT })

/** Preview for an exit that isn't saved yet (or a what-if on a real one). */
export async function previewSettlement(input: Omit<ExitInput, "employee" | "id"> & { employeeId: string }) {
    return settlementFor({ ...input, id: "preview", employee: await loadEmployee(input.employeeId) }, { adjustments: [] })
}

async function settlementFor(exit: ExitInput, record: FnfRecord) {
    const exitId = exit.id
    const e = exit.employee

    const lwd = exit.lastWorkingDate ?? new Date(exit.resignationDate.getTime() + exit.noticePeriodDays * DAY_MS)
    const lwdMonth = lwd.getUTCMonth() + 1, lwdYear = lwd.getUTCFullYear()

    // Salary in force for the leaving month: newest dated revision on or before
    // it, else the employee's current structure, else the legacy basic field.
    const revision = await prisma.salaryRevision.findFirst({
        where: { employeeId: e.id, OR: [{ effectiveYear: { lt: lwdYear } }, { effectiveYear: lwdYear, effectiveMonth: { lte: lwdMonth } }] },
        orderBy: [{ effectiveYear: "desc" }, { effectiveMonth: "desc" }],
    })
    const s = revision ?? e.employeeSalary
    const basic = s?.basic ?? e.basicSalary ?? 0
    const da = s?.da ?? 0
    const gross = s
        ? s.basic + s.da + (s.hra || 0) + s.washing + s.conveyance + s.leaveWithWages + s.otherAllowance
        : e.basicSalary || 0
    const basicDa = basic + da
    const salarySource = revision ? `salary revision ${revision.effectiveMonth}/${revision.effectiveYear}` : e.employeeSalary ? "salary structure" : "basic salary on profile"

    const lines: FnfLine[] = []
    const warnings: string[] = []
    if (gross <= 0) warnings.push("No salary structure found — salary-based lines are zero. Set up the salary in Payroll → Salary Master.")

    // 1. Salary for the leaving month, unless payroll already paid it.
    const paidRun = await prisma.payroll.findFirst({
        where: { employeeId: e.id, month: lwdMonth, year: lwdYear, status: { in: ["PROCESSED", "PAID"] } },
        select: { netSalary: true, status: true },
    })
    const dim = new Date(Date.UTC(lwdYear, lwdMonth, 0)).getUTCDate()
    const daysThisMonth = lwd.getUTCDate()
    if (paidRun) {
        lines.push({ key: "salary", label: `Salary for ${lwd.toLocaleString("en-IN", { month: "short", timeZone: "UTC" })} ${lwdYear}`, amount: 0, note: `Already ${paidRun.status.toLowerCase()} in payroll`, kind: "earning", auto: true })
    } else {
        lines.push({ key: "salary", label: `Salary for ${lwd.toLocaleString("en-IN", { month: "short", timeZone: "UTC" })} ${lwdYear}`, amount: round(gross / dim * daysThisMonth), note: `₹${round(gross).toLocaleString("en-IN")} gross × ${daysThisMonth}/${dim} days (${salarySource}) — adjust for absences`, kind: "earning", auto: true })
    }

    // 2. Leave encashment — earned leave types (those that carry forward).
    const { policy } = await getLeavePolicy()
    const encashable = policy.types.filter(t => t.active && t.paid && t.annualQuota !== null && t.carryForwardMax > 0)
    if (encashable.length) {
        const bal = (await getLeaveBalances([e.id], lwd, policy)).get(e.id)?.balances ?? []
        for (const t of encashable) {
            const b = bal.find(x => x.code === t.code)
            const days = Math.max(0, b?.available ?? 0)
            lines.push({ key: `encash-${t.code}`, label: `${t.name} encashment`, amount: round(basicDa / 26 * days), note: `${days} day(s) balance × (basic + DA) ÷ 26`, kind: "earning", auto: true })
        }
    }

    // 3. Gratuity.
    if (e.dateOfJoining) {
        const serviceDays = Math.floor((lwd.getTime() - e.dateOfJoining.getTime()) / DAY_MS)
        const fullYears = Math.floor(serviceDays / 365.25)
        const extraMonths = Math.floor((serviceDays - fullYears * 365.25) / 30.44)
        const years = fullYears + (extraMonths >= 6 ? 1 : 0)
        const svc = `${fullYears}y ${extraMonths}m service`
        if (serviceDays >= GRATUITY_MIN_DAYS) {
            const amt = Math.min(GRATUITY_CAP, round(basicDa * 15 / 26 * years))
            lines.push({ key: "gratuity", label: "Gratuity", amount: amt, note: `(basic + DA) × 15/26 × ${years} yr (${svc})${amt === GRATUITY_CAP ? " — capped at ₹20 lakh" : ""}`, kind: "earning", auto: true })
            if (exit.exitType === "TERMINATION" || exit.exitType === "ABSCONDING") warnings.push("Gratuity can be forfeited for termination on misconduct — remove the line if that applies.")
        } else {
            lines.push({ key: "gratuity", label: "Gratuity", amount: 0, note: `Not eligible — ${svc}, needs 4 years 240 days`, kind: "earning", auto: true })
        }
    } else {
        warnings.push("Date of joining is missing — gratuity can't be worked out.")
    }

    // 4. Notice period.
    const served = Math.max(0, Math.round((lwd.getTime() - exit.resignationDate.getTime()) / DAY_MS))
    const short = Math.max(0, exit.noticePeriodDays - served)
    if (short > 0 && exit.exitType === "RESIGNATION") {
        lines.push({ key: "notice", label: "Notice period shortfall", amount: round(gross / 30 * short), note: `${short} of ${exit.noticePeriodDays} notice days not served × gross ÷ 30`, kind: "deduction", auto: true })
    } else if (short > 0 && exit.exitType === "TERMINATION") {
        lines.push({ key: "notice", label: "Notice pay in lieu", amount: round(gross / 30 * short), note: `${short} of ${exit.noticePeriodDays} notice days × gross ÷ 30`, kind: "earning", auto: true })
    }

    // 5. Advances and reimbursements still open.
    const advances = await prisma.advanceAndReimbursement.findMany({ where: { employeeId: e.id, status: "APPROVED" } })
    const adv = advances.filter(a => a.type !== "REIMBURSEMENT").reduce((t, a) => t + a.amount, 0)
    const reimb = advances.filter(a => a.type === "REIMBURSEMENT").reduce((t, a) => t + a.amount, 0)
    if (adv) lines.push({ key: "advances", label: "Outstanding advances / deductions", amount: round(adv), note: `${advances.filter(a => a.type !== "REIMBURSEMENT").length} approved, not yet recovered`, kind: "deduction", auto: true })
    if (reimb) lines.push({ key: "reimb", label: "Pending reimbursements", amount: round(reimb), note: "Approved, not yet paid", kind: "earning", auto: true })

    // 6. Expense claims approved but not paid.
    const or: Record<string, unknown>[] = [{ employeeId: e.id }]
    if (e.userId) or.push({ submittedBy: e.userId })
    const claims = await prisma.expense.findMany({ where: { OR: or, status: "APPROVED" }, select: { amount: true } })
    if (claims.length) lines.push({ key: "expenses", label: "Approved expense claims", amount: round(claims.reduce((t, c) => t + c.amount, 0)), note: `${claims.length} claim(s) approved, not yet paid`, kind: "earning", auto: true })

    // 7. Assets not returned.
    const held = await prisma.employeeAsset.findMany({
        where: { employeeId: e.id, isActive: true, returnedAt: null },
        include: { asset: { select: { name: true, assetCode: true, purchaseCost: true } } },
    })
    if (held.length) {
        const cost = held.reduce((t, h) => t + (h.asset.purchaseCost || 0), 0)
        lines.push({ key: "assets", label: "Unreturned assets", amount: round(cost), note: held.map(h => `${h.asset.name} (${h.asset.assetCode})`).join(", ") + " — at purchase cost; remove once returned", kind: "deduction", auto: true })
    }

    const excluded = new Set(record.excluded ?? [])
    const all: (FnfLine & { excluded?: boolean })[] = [
        ...lines.map(l => ({ ...l, excluded: excluded.has(l.key) })),
        ...record.adjustments.map((a, i) => ({ key: `adj-${i}`, label: a.label, amount: round(a.amount), note: "Added by HR", kind: a.kind, auto: false })),
    ]
    const live = all.filter(l => !l.excluded)
    const earnings = live.filter(l => l.kind === "earning").reduce((t, l) => t + l.amount, 0)
    const deductions = live.filter(l => l.kind === "deduction").reduce((t, l) => t + l.amount, 0)

    return {
        exitId,
        lastWorkingDate: lwd.toISOString(),
        monthlyGross: round(gross),
        basicDa: round(basicDa),
        salarySource,
        noticeServedDays: served,
        lines: all,
        earnings, deductions,
        net: earnings - deductions,
        heldAssets: held.map(h => ({ id: h.id, name: h.asset.name, code: h.asset.assetCode, cost: h.asset.purchaseCost })),
        record,
        warnings,
    }
}
