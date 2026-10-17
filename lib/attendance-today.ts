// One definition of "who is present today" shared by the admin and the
// permission-driven dashboard stats, so desktop and phone show the same numbers.
// Attendance.status is a free string; these are the values the app writes.

// attendance-policy keeps its offset private; same value, same meaning.
const IST_OFFSET_MIN = 330

export const PRESENT_STATUSES = ["PRESENT", "LATE", "HALF_DAY", "WFH"]
export const LEAVE_STATUSES = ["LEAVE", "ON_LEAVE"]
export const ATTENDANCE_STATUSES = [...PRESENT_STATUSES, ...LEAVE_STATUSES, "ABSENT", "HOLIDAY"]

export function isValidAttendanceStatus(s: unknown): s is string {
    return typeof s === "string" && ATTENDANCE_STATUSES.includes(s)
}

/**
 * Prisma `where` fragment for a row that counts as present: a present-type
 * status OR an actual check-in. Register/bulk marking stores PRESENT with no
 * checkIn, so filtering on checkIn alone used to miss every manually marked row.
 */
export const PRESENT_WHERE = { OR: [{ status: { in: PRESENT_STATUSES } }, { checkIn: { not: null } }] }

export type TodayAttendance = {
    present: number
    late: number
    halfDay: number
    onLeave: number
    absent: number    // explicitly marked ABSENT (no check-in)
    unmarked: number  // active − (present + onLeave + absent), never negative
    /** present / (active − onLeave); null when nothing has been marked yet */
    attendancePct: number | null
    bySite: { siteId: string | null; name: string; present: number; required: number }[]
}

export const EMPTY_TODAY: TodayAttendance = { present: 0, late: 0, halfDay: 0, onLeave: 0, absent: 0, unmarked: 0, attendancePct: null, bySite: [] }

type Db = {
    attendance: { findMany: (args: any) => Promise<any[]> }
    leave: { findMany: (args: any) => Promise<any[]> }
}

/**
 * Today's attendance for one IST day window. `onLeave` unions approved Leave
 * rows overlapping the day with attendance rows marked LEAVE, de-duplicated by
 * employee, so neither source alone decides.
 */
export async function todayAttendance(db: Db, window: { gte: Date; lt: Date }, activeEmployees: number): Promise<TodayAttendance> {
    const [rows, leaves] = await Promise.all([
        db.attendance.findMany({
            where: { date: window },
            select: { employeeId: true, status: true, checkIn: true, siteId: true, site: { select: { name: true, manpowerRequired: true } } },
        }).catch(() => [] as any[]),
        db.leave.findMany({
            where: { status: "APPROVED", startDate: { lt: window.lt }, endDate: { gte: window.gte } },
            select: { employeeId: true },
        }).catch(() => [] as any[]),
    ])

    let present = 0, late = 0, halfDay = 0, absent = 0
    const onLeaveIds = new Set<string>(leaves.map((l: any) => l.employeeId))
    const bySite = new Map<string | null, TodayAttendance["bySite"][number]>()

    for (const r of rows) {
        const isPresent = PRESENT_STATUSES.includes(r.status) || !!r.checkIn
        if (isPresent) {
            present++
            if (r.status === "LATE") late++
            if (r.status === "HALF_DAY") halfDay++
            const key = r.siteId ?? null
            const cur = bySite.get(key) ?? { siteId: key, name: r.site?.name ?? "No site", present: 0, required: r.site?.manpowerRequired ?? 0 }
            cur.present++
            bySite.set(key, cur)
        } else if (LEAVE_STATUSES.includes(r.status)) {
            onLeaveIds.add(r.employeeId)
        } else if (r.status === "ABSENT") {
            absent++
        }
    }

    const onLeave = onLeaveIds.size
    const unmarked = Math.max(0, activeEmployees - (present + onLeave + absent))
    const denom = Math.max(0, activeEmployees - onLeave)
    // Before anyone is marked there is nothing to grade; 0% here read as "everyone absent".
    const attendancePct = present + absent === 0 ? null : denom > 0 ? Math.min(100, Math.round((present / denom) * 100)) : 100

    return { present, late, halfDay, onLeave, absent, unmarked, attendancePct, bySite: Array.from(bySite.values()) }
}

/**
 * Parse a check-in/out string from the HR form. A value with no timezone
 * designator ("2026-10-17T09:30:00") is IST wall-clock time; new Date() on the
 * UTC server would read it as 09:30 UTC = 15:00 IST and mark everyone late.
 */
export function parseIstDateTime(value: unknown): Date | null {
    if (value === null || value === undefined || value === "") return null
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value
    const s = String(value).trim()
    const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(s)
    const sign = IST_OFFSET_MIN < 0 ? "-" : "+"
    const abs = Math.abs(IST_OFFSET_MIN)
    const zone = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`
    const d = new Date(hasZone ? s : s + zone)
    return isNaN(d.getTime()) ? null : d
}
