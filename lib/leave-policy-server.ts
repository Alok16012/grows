import prisma from "@/lib/prisma"
import {
    DEFAULT_LEAVE_POLICY, LEAVE_POLICY_SETTING_KEY, sanitizeLeavePolicy, leaveYearRange,
    entitlementFor, countLeaveDays, normalizeLeaveType, parseDateOnly,
    type LeavePolicy, type LeaveBalance, type DayBreakdown,
} from "@/lib/leave-policy"

export async function getLeavePolicy(): Promise<{ policy: LeavePolicy; customized: boolean }> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: LEAVE_POLICY_SETTING_KEY } })
        if (!row?.value) return { policy: DEFAULT_LEAVE_POLICY, customized: false }
        return { policy: sanitizeLeavePolicy(JSON.parse(row.value)), customized: true }
    } catch (e) {
        console.error("[LEAVE_POLICY_LOAD]", e)
        return { policy: DEFAULT_LEAVE_POLICY, customized: false }
    }
}

export async function saveLeavePolicy(input: unknown, userId: string): Promise<LeavePolicy> {
    const policy = sanitizeLeavePolicy(input)
    const value = JSON.stringify(policy)
    await prisma.appSetting.upsert({
        where: { key: LEAVE_POLICY_SETTING_KEY },
        update: { value, updatedBy: userId },
        create: { key: LEAVE_POLICY_SETTING_KEY, value, updatedBy: userId },
    })
    return policy
}

// Holidays that fall on a working day close everyone; RESTRICTED (optional)
// holidays don't, so they are still charged as leave.
export async function holidaysBetween(start: Date, end: Date) {
    try {
        return await prisma.holiday.findMany({
            where: { date: { gte: start, lte: end }, type: { not: "RESTRICTED" } },
            select: { date: true, name: true },
        })
    } catch {
        return []
    }
}

export async function computeLeaveDays(start: Date, end: Date, policy: LeavePolicy, halfDay = false): Promise<DayBreakdown> {
    return countLeaveDays(start, end, policy, await holidaysBetween(start, end), halfDay)
}

type LeaveRow = { employeeId: string; type: string; status: string; days: number; startDate: Date }

function buildBalances(
    policy: LeavePolicy, yearStart: Date, prevYearStart: Date, joinedOn: Date | null,
    rows: LeaveRow[],
): LeaveBalance[] {
    return policy.types.filter(t => t.active).map(rule => {
        const code = rule.code
        const mine = rows.filter(r => normalizeLeaveType(r.type, policy) === code)
        const thisYear = mine.filter(r => r.startDate >= yearStart)
        const used = thisYear.filter(r => r.status === "APPROVED").reduce((s, r) => s + r.days, 0)
        const pending = thisYear.filter(r => r.status === "PENDING").reduce((s, r) => s + r.days, 0)
        const entitled = entitlementFor(rule, yearStart, joinedOn)

        let carriedForward = 0
        if (entitled !== null && rule.carryForwardMax > 0 && prevYearStart.getUTCFullYear() >= policy.trackingStartYear && (!joinedOn || joinedOn < yearStart)) {
            const prevEntitled = entitlementFor(rule, prevYearStart, joinedOn) ?? 0
            const prevUsed = mine
                .filter(r => r.startDate >= prevYearStart && r.startDate < yearStart && r.status === "APPROVED")
                .reduce((s, r) => s + r.days, 0)
            carriedForward = Math.min(rule.carryForwardMax, Math.max(0, prevEntitled - prevUsed))
        }

        return {
            code, name: rule.name, color: rule.color, paid: rule.paid,
            entitled, carriedForward, used, pending,
            available: entitled === null ? null : entitled + carriedForward - used - pending,
        }
    })
}

// Balances for one or many employees in the leave year containing `asOf`.
// One query for all leaves of the current and previous year, so the balances
// tab costs the same for 10 employees or 1,000.
export async function getLeaveBalances(
    employeeIds: string[] | "ALL_ACTIVE", asOf: Date, policy: LeavePolicy, excludeLeaveId?: string,
): Promise<Map<string, { employee: { id: string; firstName: string; lastName: string; employeeId: string; designation: string | null; dateOfJoining: Date | null }; balances: LeaveBalance[] }>> {
    const { start: yearStart } = leaveYearRange(asOf, policy.yearStartMonth)
    const prevYearStart = new Date(Date.UTC(yearStart.getUTCFullYear() - 1, yearStart.getUTCMonth(), 1))
    const yearEnd = new Date(Date.UTC(yearStart.getUTCFullYear() + 1, yearStart.getUTCMonth(), 1))

    const employees = await prisma.employee.findMany({
        where: employeeIds === "ALL_ACTIVE" ? { status: { in: ["ACTIVE", "ON_LEAVE"] } } : { id: { in: employeeIds } },
        select: { id: true, firstName: true, lastName: true, employeeId: true, designation: true, dateOfJoining: true },
        orderBy: { firstName: "asc" },
    })
    const ids = employees.map(e => e.id)
    const rows = ids.length ? await prisma.leave.findMany({
        where: {
            employeeId: { in: ids },
            status: { in: ["APPROVED", "PENDING"] },
            startDate: { gte: prevYearStart, lt: yearEnd },
            ...(excludeLeaveId ? { id: { not: excludeLeaveId } } : {}),
        },
        select: { employeeId: true, type: true, status: true, days: true, startDate: true },
    }) : []

    const byEmp = new Map<string, LeaveRow[]>()
    for (const r of rows) {
        const list = byEmp.get(r.employeeId) ?? []
        list.push(r)
        byEmp.set(r.employeeId, list)
    }

    const out = new Map<string, any>()
    for (const e of employees) {
        out.set(e.id, { employee: e, balances: buildBalances(policy, yearStart, prevYearStart, e.dateOfJoining, byEmp.get(e.id) ?? []) })
    }
    return out
}

export type LeaveCheck =
    | { ok: true; type: string; start: Date; end: Date; breakdown: DayBreakdown; balance: LeaveBalance | null; warnings: string[] }
    | { ok: false; status: number; error: string }

// Every rule a new request (or an approval) must pass, in one place, so the web
// form, the mobile app and the approve button all agree.
export async function checkLeaveRequest(input: {
    employeeId: string
    type: string
    startDate: string
    endDate: string
    halfDay?: boolean
    excludeLeaveId?: string
    isManager: boolean
}): Promise<LeaveCheck> {
    const { policy } = await getLeavePolicy()
    const type = normalizeLeaveType(input.type, policy)
    const rule = policy.types.find(t => t.code === type)
    if (!rule || !rule.active) return { ok: false, status: 400, error: `Unknown leave type "${input.type}"` }

    const start = parseDateOnly(input.startDate)
    const end = parseDateOnly(input.endDate)
    if (!start || !end) return { ok: false, status: 400, error: "Valid start and end dates are required" }
    if (end < start) return { ok: false, status: 400, error: "End date cannot be before start date" }

    const halfDay = !!input.halfDay
    if (halfDay && start.getTime() !== end.getTime()) return { ok: false, status: 400, error: "A half day must start and end on the same date" }
    if (halfDay && !rule.allowHalfDay) return { ok: false, status: 400, error: `${rule.name} cannot be taken as a half day` }

    const breakdown = await computeLeaveDays(start, end, policy, halfDay)
    if (breakdown.days <= 0) return { ok: false, status: 400, error: "The selected dates are all weekly offs or holidays — no leave is needed" }

    const warnings: string[] = []
    const now = new Date()
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const noticeDays = Math.round((start.getTime() - today.getTime()) / 86400000)

    if (start < today && !policy.allowBackdated && !input.isManager) {
        return { ok: false, status: 400, error: "Leave cannot be applied for past dates — ask HR to record it" }
    }
    if (noticeDays >= 0 && noticeDays < rule.minNoticeDays) {
        const msg = `${rule.name} needs ${rule.minNoticeDays} days' notice`
        if (!input.isManager) return { ok: false, status: 400, error: msg }
        warnings.push(msg)
    }
    if (rule.maxConsecutive !== null && breakdown.days > rule.maxConsecutive) {
        const msg = `${rule.name} is limited to ${rule.maxConsecutive} day(s) at a stretch`
        if (!input.isManager) return { ok: false, status: 400, error: msg }
        warnings.push(msg)
    }

    const overlap = await prisma.leave.findFirst({
        where: {
            employeeId: input.employeeId,
            status: { in: ["PENDING", "APPROVED"] },
            startDate: { lte: end },
            endDate: { gte: start },
            ...(input.excludeLeaveId ? { id: { not: input.excludeLeaveId } } : {}),
        },
        select: { type: true, status: true, startDate: true, endDate: true },
    })
    if (overlap) {
        const f = (d: Date) => d.toISOString().slice(0, 10)
        return { ok: false, status: 409, error: `Overlaps an existing ${overlap.status.toLowerCase()} ${overlap.type} leave (${f(overlap.startDate)} to ${f(overlap.endDate)})` }
    }

    const balances = await getLeaveBalances([input.employeeId], start, policy, input.excludeLeaveId)
    const balance = balances.get(input.employeeId)?.balances.find(b => b.code === type) ?? null
    if (balance && balance.available !== null && breakdown.days > balance.available) {
        const msg = `Insufficient ${rule.name} balance: ${breakdown.days} day(s) requested, ${Math.max(0, balance.available)} available`
        if (!input.isManager) return { ok: false, status: 400, error: msg + ". Apply as Leave Without Pay instead." }
        warnings.push(msg)
    }

    return { ok: true, type, start, end, breakdown, balance, warnings }
}
