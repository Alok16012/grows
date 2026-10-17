import prisma from "@/lib/prisma"
import { getLeavePolicy, holidaysBetween } from "@/lib/leave-policy-server"
import { normalizeLeaveType, toDateKey, DAY_MS } from "@/lib/leave-policy"
import {
    ATTENDANCE_POLICY_SETTING_KEY, DEFAULT_ATTENDANCE_POLICY, sanitizeAttendancePolicy, lateBy, istDateOnly,
    type AttendancePolicy, type RegisterDay, type RegisterTotals,
} from "@/lib/attendance-policy"

export async function getAttendancePolicy(): Promise<AttendancePolicy> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: ATTENDANCE_POLICY_SETTING_KEY } })
        return row?.value ? sanitizeAttendancePolicy(JSON.parse(row.value)) : DEFAULT_ATTENDANCE_POLICY
    } catch {
        return DEFAULT_ATTENDANCE_POLICY
    }
}

export async function saveAttendancePolicy(input: unknown, userId: string): Promise<AttendancePolicy> {
    const policy = sanitizeAttendancePolicy(input)
    const value = JSON.stringify(policy)
    await prisma.appSetting.upsert({
        where: { key: ATTENDANCE_POLICY_SETTING_KEY },
        update: { value, updatedBy: userId },
        create: { key: ATTENDANCE_POLICY_SETTING_KEY, value, updatedBy: userId },
    })
    return policy
}

// Attendance.date has been written two ways over time — UTC midnight (Vercel)
// and IST midnight (18:30 UTC the day before, from a local server). Shifting by
// +IST before taking the date puts both on the calendar day the user meant.
const IST_MS = 330 * 60000
const recordDayKey = (d: Date) => toDateKey(new Date(d.getTime() + IST_MS))

/**
 * The muster roll for one month: one row per employee, one cell per day,
 * combining marked attendance, approved leave, weekly offs and holidays.
 */
export async function buildRegister(opts: { year: number; month: number; siteId?: string | null; employeeIds?: string[] }) {
    const { year, month } = opts
    const start = new Date(Date.UTC(year, month - 1, 1))
    const end = new Date(Date.UTC(year, month, 1))
    const lastDay = new Date(end.getTime() - DAY_MS)
    const daysInMonth = Math.round((end.getTime() - start.getTime()) / DAY_MS)

    const [{ policy: leavePolicy }, attPolicy, holidays] = await Promise.all([
        getLeavePolicy(), getAttendancePolicy(), holidaysBetween(start, lastDay),
    ])

    const employeeWhere: Record<string, unknown> = opts.employeeIds
        ? { id: { in: opts.employeeIds } }
        : {
            // Everyone who was on the books for at least part of the month.
            OR: [{ status: { in: ["ACTIVE", "ON_LEAVE"] } }, { dateOfLeaving: { gte: start } }],
            AND: [{ OR: [{ dateOfJoining: null }, { dateOfJoining: { lt: end } }] }],
        }
    if (opts.siteId) employeeWhere.deployments = { some: { siteId: opts.siteId, isActive: true } }

    const employees = await prisma.employee.findMany({
        where: employeeWhere,
        select: { id: true, firstName: true, lastName: true, employeeId: true, designation: true, dateOfJoining: true, dateOfLeaving: true },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    })
    const ids = employees.map(e => e.id)
    // For the whole workforce a 700-id IN list costs more than it saves: read
    // the month by date and drop strangers in memory.
    const byEmp = opts.employeeIds || opts.siteId ? { employeeId: { in: ids } } : {}

    // Pad by a day either side so records stored at IST midnight are caught.
    const [records, leaves] = ids.length ? await Promise.all([
        prisma.attendance.findMany({
            where: { ...byEmp, date: { gte: new Date(start.getTime() - DAY_MS), lt: new Date(end.getTime() + DAY_MS) } },
            select: { id: true, employeeId: true, date: true, status: true, checkIn: true, checkOut: true, workingHrs: true, overtimeHrs: true },
        }),
        prisma.leave.findMany({
            where: { ...byEmp, status: "APPROVED", startDate: { lt: end }, endDate: { gte: start } },
            select: { employeeId: true, type: true, startDate: true, endDate: true, days: true },
        }),
    ]) : [[], []]

    const recByEmpDay = new Map<string, (typeof records)[number]>()
    for (const r of records) recByEmpDay.set(`${r.employeeId}|${recordDayKey(r.date)}`, r)

    const leaveByEmpDay = new Map<string, { type: string; half: boolean }>()
    for (const l of leaves) {
        const n = Math.round((l.endDate.getTime() - l.startDate.getTime()) / DAY_MS) + 1
        for (let i = 0; i < n; i++) {
            const k = toDateKey(new Date(l.startDate.getTime() + i * DAY_MS))
            leaveByEmpDay.set(`${l.employeeId}|${k}`, { type: normalizeLeaveType(l.type, leavePolicy), half: l.days === 0.5 })
        }
    }

    const holidayByDay = new Map(holidays.map(h => [toDateKey(h.date), h.name]))
    const paidType = new Map(leavePolicy.types.map(t => [t.code, t.paid]))
    const today = istDateOnly()

    const days = Array.from({ length: daysInMonth }, (_, i) => {
        const d = new Date(start.getTime() + i * DAY_MS)
        const key = toDateKey(d)
        return { key, day: i + 1, dow: d.getUTCDay(), weeklyOff: leavePolicy.weeklyOff.includes(d.getUTCDay()), holiday: holidayByDay.get(key) ?? null, future: d > today }
    })

    const rows = employees.map(e => {
        const t: RegisterTotals = { present: 0, late: 0, halfDay: 0, absent: 0, leave: 0, paidLeave: 0, weeklyOff: 0, holiday: 0, unmarked: 0, otHours: 0, payableDays: 0 }
        const joined = e.dateOfJoining ? toDateKey(e.dateOfJoining) : null
        const left = e.dateOfLeaving ? toDateKey(e.dateOfLeaving) : null

        const cells: RegisterDay[] = days.map(day => {
            if ((joined && day.key < joined) || (left && day.key > left)) return { code: "" }
            const rec = recByEmpDay.get(`${e.id}|${day.key}`)
            const leave = leaveByEmpDay.get(`${e.id}|${day.key}`)
            const ot = rec?.overtimeHrs || 0
            t.otHours += ot

            // A marked record wins over the calendar: someone who worked on a
            // Sunday or holiday was present, and that's what payroll should see.
            if (rec && rec.status !== "HOLIDAY") {
                const base = { checkIn: rec.checkIn?.toISOString() ?? null, checkOut: rec.checkOut?.toISOString() ?? null, hours: rec.workingHrs, ot, recordId: rec.id }
                if (rec.status === "ABSENT") {
                    if (leave) { t.leave++; if (paidType.get(leave.type) !== false) { t.paidLeave++; t.payableDays++ } return { code: "L", leaveType: leave.type, ...base } }
                    t.absent++; return { code: "A", ...base }
                }
                if (rec.status === "LEAVE") {
                    const lt = leave?.type
                    t.leave++
                    if (!lt || paidType.get(lt) !== false) { t.paidLeave++; t.payableDays++ }
                    return { code: "L", leaveType: lt, ...base }
                }
                const isHalf = rec.status === "HALF_DAY" || (rec.workingHrs > 0 && rec.checkOut && rec.workingHrs < attPolicy.halfDayBelowHours)
                if (isHalf) {
                    t.halfDay++; t.payableDays += 0.5
                    if (leave?.half && paidType.get(leave.type) !== false) { t.paidLeave += 0.5; t.payableDays += 0.5 }
                    return { code: "HD", leaveType: leave?.half ? leave.type : undefined, ...base }
                }
                const lateMin = rec.status === "LATE" ? Math.max(1, lateBy(rec.checkIn, attPolicy)) : lateBy(rec.checkIn, attPolicy)
                t.present++; t.payableDays++
                if (lateMin > 0) { t.late++; return { code: "LT", lateMin, ...base } }
                return { code: "P", ...base }
            }
            if (leave) {
                t.leave++
                const paid = paidType.get(leave.type) !== false
                const worth = leave.half ? 0.5 : 1
                if (paid) { t.paidLeave += worth; t.payableDays += worth }
                return { code: "L", leaveType: leave.type }
            }
            if (day.holiday || rec?.status === "HOLIDAY") { t.holiday++; t.payableDays++; return { code: "H", holiday: day.holiday ?? "Holiday" } }
            if (day.weeklyOff) { t.weeklyOff++; t.payableDays++; return { code: "WO" } }
            if (day.future) return { code: "" }
            t.unmarked++
            return { code: "-" }
        })
        t.otHours = Math.round(t.otHours * 100) / 100
        return { employee: e, cells, totals: t }
    })

    return { year, month, days, rows, policy: attPolicy }
}
