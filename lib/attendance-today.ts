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

export type SiteAttendance = {
    siteId: string | null
    name: string
    present: number
    absent: number
    onLeave: number
    /** active employees deployed here (Deployment.isActive) − on leave here */
    expected: number
    /** expected − present − absent, never negative */
    notMarked: number
    /** present / expected; null when nobody is expected here (UI shows "—", not 100%) */
    pct: number | null
}

export type TodayAttendance = {
    present: number
    late: number
    halfDay: number
    onLeave: number
    absent: number    // explicitly marked ABSENT (no check-in)
    unmarked: number  // active − (present + onLeave + absent), never negative
    /** active − onLeave: the people who should be marked today */
    expected: number
    /** expected − present − absent, never negative */
    notMarked: number
    /** present / expected; null when nobody is expected */
    pct: number | null
    /** same formula as pct, but null until someone is marked present/absent */
    attendancePct: number | null
    bySite: SiteAttendance[]
}

export const EMPTY_TODAY: TodayAttendance = {
    present: 0, late: 0, halfDay: 0, onLeave: 0, absent: 0, unmarked: 0,
    expected: 0, notMarked: 0, pct: null, attendancePct: null, bySite: [],
}

/**
 * The one attendance % rule: present ÷ expected, where expected = active
 * employees − on leave. Null when nobody is expected, so an empty site reads
 * "—" instead of a fake 100%.
 */
export function attendancePercent(present: number, expected: number): number | null {
    return expected > 0 ? Math.min(100, Math.round((present / expected) * 100)) : null
}

type Db = {
    attendance: { findMany: (args: any) => Promise<any[]> }
    leave: { findMany: (args: any) => Promise<any[]> }
    deployment: { findMany: (args: any) => Promise<any[]> }
}

/**
 * Today's attendance for one IST day window. `onLeave` unions approved Leave
 * rows overlapping the day with attendance rows marked LEAVE, de-duplicated by
 * employee, so neither source alone decides.
 *
 * Per site, everyone is attributed to the site of their active deployment (the
 * roster they are expected on), not the site on the attendance row — otherwise
 * numerator and denominator come from different sets and a site can read 100%
 * with nobody deployed there. Employees with no active deployment form "No site".
 */
export async function todayAttendance(db: Db, window: { gte: Date; lt: Date }, activeEmployees: number): Promise<TodayAttendance> {
    const [rows, leaves, deployments] = await Promise.all([
        db.attendance.findMany({
            where: { date: window },
            select: { employeeId: true, status: true, checkIn: true },
        }).catch(() => [] as any[]),
        db.leave.findMany({
            where: { status: "APPROVED", startDate: { lt: window.lt }, endDate: { gte: window.gte } },
            select: { employeeId: true },
        }).catch(() => [] as any[]),
        db.deployment.findMany({
            where: { isActive: true, employee: { status: "ACTIVE" } },
            select: { employeeId: true, siteId: true, site: { select: { name: true } } },
            orderBy: { startDate: "desc" },
        }).catch(() => [] as any[]),
    ])

    // Latest active deployment wins when an employee somehow has two.
    const siteOf = new Map<string, { siteId: string; name: string }>()
    for (const d of deployments) {
        if (!siteOf.has(d.employeeId)) siteOf.set(d.employeeId, { siteId: d.siteId, name: d.site?.name ?? "Unnamed site" })
    }

    type Acc = { siteId: string | null; name: string; deployed: number; present: number; absent: number; leaveIds: Set<string> }
    const bySite = new Map<string | null, Acc>()
    const site = (key: string | null, name: string): Acc => {
        let cur = bySite.get(key)
        if (!cur) {
            cur = { siteId: key, name, deployed: 0, present: 0, absent: 0, leaveIds: new Set() }
            bySite.set(key, cur)
        }
        return cur
    }
    const bucket = (employeeId: string): Acc => {
        const s = siteOf.get(employeeId)
        return s ? site(s.siteId, s.name) : site(null, "No site")
    }
    for (const empId of Array.from(siteOf.keys())) bucket(empId).deployed++
    // "No site" expects every active employee without an active deployment.
    site(null, "No site").deployed += Math.max(0, activeEmployees - siteOf.size)

    let present = 0, late = 0, halfDay = 0, absent = 0
    const onLeaveIds = new Set<string>(leaves.map((l: any) => l.employeeId))

    for (const r of rows) {
        const isPresent = PRESENT_STATUSES.includes(r.status) || !!r.checkIn
        if (isPresent) {
            present++
            if (r.status === "LATE") late++
            if (r.status === "HALF_DAY") halfDay++
            bucket(r.employeeId).present++
        } else if (LEAVE_STATUSES.includes(r.status)) {
            onLeaveIds.add(r.employeeId)
        } else if (r.status === "ABSENT") {
            absent++
            bucket(r.employeeId).absent++
        }
    }
    for (const id of Array.from(onLeaveIds)) bucket(id).leaveIds.add(id)

    const onLeave = onLeaveIds.size
    const unmarked = Math.max(0, activeEmployees - (present + onLeave + absent))
    const expected = Math.max(0, activeEmployees - onLeave)
    const notMarked = Math.max(0, expected - present - absent)
    const pct = attendancePercent(present, expected)
    // Before anyone is marked there is nothing to grade; 0% here read as "everyone absent".
    const attendancePct = present + absent === 0 ? null : pct

    const sites: SiteAttendance[] = Array.from(bySite.values())
        .map(s => {
            const siteExpected = Math.max(0, s.deployed - s.leaveIds.size)
            return {
                siteId: s.siteId, name: s.name, present: s.present, absent: s.absent, onLeave: s.leaveIds.size,
                expected: siteExpected,
                notMarked: Math.max(0, siteExpected - s.present - s.absent),
                pct: attendancePercent(s.present, siteExpected),
            }
        })
        // A "No site" bucket with nobody in it is noise.
        .filter(s => s.expected + s.present + s.absent + s.onLeave > 0)
        .sort((a, b) => b.expected - a.expected)

    return { present, late, halfDay, onLeave, absent, unmarked, expected, notMarked, pct, attendancePct, bySite: sites }
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
