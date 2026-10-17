// Attendance rules: shift timing, late marking and what a day is worth.
// Stored in AppSetting like the leave policy; weekly offs and holidays come from
// the leave policy so there is one calendar for both modules.

export const ATTENDANCE_POLICY_SETTING_KEY = "attendancePolicy"

export type AttendancePolicy = {
    shiftStart: string        // "09:30", IST
    shiftEnd: string          // "18:30", IST
    graceMinutes: number      // check-in up to this late is still on time
    halfDayBelowHours: number // worked less than this → half day
    fullDayHours: number      // standard day, used for the hours column
}

export const DEFAULT_ATTENDANCE_POLICY: AttendancePolicy = {
    shiftStart: "09:30",
    shiftEnd: "18:30",
    graceMinutes: 15,
    halfDayBelowHours: 4,
    fullDayHours: 8,
}

const hhmm = (v: unknown, d: string) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : d)
const num = (v: unknown, d: number, min: number, max: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d
}

export function sanitizeAttendancePolicy(input: any): AttendancePolicy {
    const d = DEFAULT_ATTENDANCE_POLICY
    if (!input || typeof input !== "object") return d
    return {
        shiftStart: hhmm(input.shiftStart, d.shiftStart),
        shiftEnd: hhmm(input.shiftEnd, d.shiftEnd),
        graceMinutes: Math.round(num(input.graceMinutes, d.graceMinutes, 0, 240)),
        halfDayBelowHours: num(input.halfDayBelowHours, d.halfDayBelowHours, 0, 24),
        fullDayHours: num(input.fullDayHours, d.fullDayHours, 1, 24),
    }
}

const IST_OFFSET_MIN = 330

/** Minutes after IST midnight for an instant. */
export function istMinutes(instant: Date | string): number {
    const d = typeof instant === "string" ? new Date(instant) : instant
    return Math.floor(((d.getTime() / 60000) + IST_OFFSET_MIN) % 1440 + 1440) % 1440
}

export function toMinutes(hm: string): number {
    const [h, m] = hm.split(":").map(Number)
    return h * 60 + m
}

/** Minutes late past shift start + grace (0 when on time). */
export function lateBy(checkIn: Date | string | null | undefined, policy: AttendancePolicy): number {
    if (!checkIn) return 0
    const late = istMinutes(checkIn) - toMinutes(policy.shiftStart)
    return late > policy.graceMinutes ? late : 0
}

/** Today's IST calendar date as a UTC-midnight Date — how date-only values are stored. */
export function istDateOnly(now = new Date()): Date {
    const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60000)
    return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()))
}

/**
 * Prisma `date` filter for one calendar day. Attendance.date has been stored at
 * both UTC midnight and IST midnight (18:30 UTC the evening before), so the
 * window runs from IST midnight to just before the next IST midnight.
 */
export function dayWindow(day: Date): { gte: Date; lt: Date } {
    return { gte: new Date(day.getTime() - IST_OFFSET_MIN * 60000), lt: new Date(day.getTime() + (1440 - IST_OFFSET_MIN) * 60000) }
}

/** Same idea for a whole month (month is 1-12). */
export function monthWindow(year: number, month: number): { gte: Date; lt: Date } {
    const s = new Date(Date.UTC(year, month - 1, 1)), e = new Date(Date.UTC(year, month, 1))
    return { gte: new Date(s.getTime() - IST_OFFSET_MIN * 60000), lt: new Date(e.getTime() - IST_OFFSET_MIN * 60000) }
}

// Register cell codes. P/HD/A/L come from records; WO/H from the calendar.
export type DayCode = "P" | "LT" | "HD" | "A" | "L" | "WO" | "H" | "-" | ""

export type RegisterDay = {
    code: DayCode
    leaveType?: string
    holiday?: string
    checkIn?: string | null
    checkOut?: string | null
    hours?: number
    lateMin?: number
    ot?: number
    recordId?: string
}

export type RegisterTotals = {
    present: number
    late: number
    halfDay: number
    absent: number
    leave: number
    paidLeave: number
    weeklyOff: number
    holiday: number
    unmarked: number
    otHours: number
    payableDays: number
}

export const CODE_STYLE: Record<string, { label: string; color: string; bg: string }> = {
    P:  { label: "Present",   color: "#15803d", bg: "#dcfce7" },
    LT: { label: "Late",      color: "#b45309", bg: "#fef3c7" },
    HD: { label: "Half day",  color: "#c2410c", bg: "#ffedd5" },
    A:  { label: "Absent",    color: "#b91c1c", bg: "#fee2e2" },
    L:  { label: "Leave",     color: "#6d28d9", bg: "#ede9fe" },
    WO: { label: "Weekly off", color: "#64748b", bg: "#f1f5f9" },
    H:  { label: "Holiday",   color: "#1d4ed8", bg: "#dbeafe" },
    "-": { label: "Not marked", color: "#98a1b5", bg: "transparent" },
}
