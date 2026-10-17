// Leave policy — the rules every leave request is checked against.
//
// Stored as one JSON row in AppSetting (key LEAVE_POLICY_SETTING_KEY), the same
// way payroll rules are, so no table has to be added to the live database.
// This file is pure (no prisma) so the page can import the types and the day
// counting the server uses, and both sides agree on what "3 days" means.

export const LEAVE_POLICY_SETTING_KEY = "leavePolicy"

export type LeaveTypeRule = {
    code: string            // stored in Leave.type — CL, SL, PL, LWP, CompOff
    name: string
    annualQuota: number | null // days per leave year; null = no balance (LWP, comp-off)
    paid: boolean
    allowHalfDay: boolean
    proRata: boolean        // joiners this year get quota × months left / 12
    carryForwardMax: number // unused days moved into next year, capped (0 = lapse)
    minNoticeDays: number   // apply at least this many days ahead (0 = same day ok)
    maxConsecutive: number | null
    color: string
    active: boolean
}

export type LeavePolicy = {
    yearStartMonth: number  // 1 = January, 4 = April
    weeklyOff: number[]     // 0 = Sunday … 6 = Saturday
    excludeHolidays: boolean
    allowBackdated: boolean // employees may apply for past dates (regularising)
    // First leave year balances are tracked for. Carry-forward only reaches back
    // to years on or after this — before it there are no records, and treating
    // "no leaves recorded" as "nothing used" would hand everyone a full year free.
    trackingStartYear: number
    types: LeaveTypeRule[]
}

export const DEFAULT_LEAVE_POLICY: LeavePolicy = {
    yearStartMonth: 1,
    weeklyOff: [0],
    excludeHolidays: true,
    allowBackdated: true,
    trackingStartYear: 2026,
    types: [
        { code: "CL", name: "Casual Leave", annualQuota: 8, paid: true, allowHalfDay: true, proRata: true, carryForwardMax: 0, minNoticeDays: 0, maxConsecutive: 3, color: "#3b82f6", active: true },
        { code: "SL", name: "Sick Leave", annualQuota: 7, paid: true, allowHalfDay: true, proRata: true, carryForwardMax: 0, minNoticeDays: 0, maxConsecutive: null, color: "#dc2626", active: true },
        { code: "PL", name: "Privilege / Earned Leave", annualQuota: 15, paid: true, allowHalfDay: false, proRata: true, carryForwardMax: 30, minNoticeDays: 7, maxConsecutive: null, color: "#0d9488", active: true },
        { code: "CompOff", name: "Compensatory Off", annualQuota: null, paid: true, allowHalfDay: true, proRata: false, carryForwardMax: 0, minNoticeDays: 0, maxConsecutive: null, color: "#8b5cf6", active: true },
        { code: "LWP", name: "Leave Without Pay", annualQuota: null, paid: false, allowHalfDay: true, proRata: false, carryForwardMax: 0, minNoticeDays: 0, maxConsecutive: null, color: "#6b7280", active: true },
    ],
}

// The mobile app sends full names; the web and the database use codes.
const TYPE_ALIASES: Record<string, string> = {
    casual: "CL", "casual leave": "CL",
    sick: "SL", "sick leave": "SL",
    earned: "PL", privilege: "PL", "earned leave": "PL", "privilege leave": "PL",
    unpaid: "LWP", "leave without pay": "LWP",
    compoff: "CompOff", "comp off": "CompOff", "comp-off": "CompOff",
}

export function normalizeLeaveType(raw: string, policy: LeavePolicy): string {
    const t = String(raw || "").trim()
    const byCode = policy.types.find(x => x.code.toLowerCase() === t.toLowerCase())
    if (byCode) return byCode.code
    return TYPE_ALIASES[t.toLowerCase()] ?? t
}

const num = (v: unknown, d: number, min = 0, max = 366) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d
}

// Never trust a stored or posted policy blindly: a bad row must not break leave.
export function sanitizeLeavePolicy(input: any): LeavePolicy {
    const d = DEFAULT_LEAVE_POLICY
    if (!input || typeof input !== "object") return d
    const types: LeaveTypeRule[] = Array.isArray(input.types)
        ? input.types
            .filter((t: any) => t && typeof t.code === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,15}$/.test(t.code.trim()))
            .map((t: any) => ({
                code: t.code.trim(),
                name: String(t.name || t.code).slice(0, 60),
                annualQuota: t.annualQuota === null || t.annualQuota === "" || t.annualQuota === undefined ? null : num(t.annualQuota, 0),
                paid: t.paid !== false,
                allowHalfDay: !!t.allowHalfDay,
                proRata: !!t.proRata,
                carryForwardMax: num(t.carryForwardMax, 0),
                minNoticeDays: num(t.minNoticeDays, 0, 0, 90),
                maxConsecutive: t.maxConsecutive === null || t.maxConsecutive === "" || t.maxConsecutive === undefined ? null : num(t.maxConsecutive, 0, 0.5),
                color: /^#[0-9a-fA-F]{6}$/.test(t.color) ? t.color : "#6b7280",
                active: t.active !== false,
            }))
        : d.types
    const seen = new Set<string>()
    const unique = types.filter(t => (seen.has(t.code) ? false : (seen.add(t.code), true)))
    return {
        yearStartMonth: Math.round(num(input.yearStartMonth, d.yearStartMonth, 1, 12)),
        weeklyOff: Array.isArray(input.weeklyOff)
            ? Array.from(new Set(input.weeklyOff.map(Number).filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6))) as number[]
            : d.weeklyOff,
        excludeHolidays: input.excludeHolidays !== false,
        allowBackdated: input.allowBackdated !== false,
        trackingStartYear: Math.round(num(input.trackingStartYear, d.trackingStartYear, 2000, 2100)),
        types: unique.length ? unique : d.types,
    }
}

// ─── Dates ────────────────────────────────────────────────────────────────────
// Leave dates are date-only values stored at UTC midnight (`new Date("2026-08-05")`),
// so all arithmetic here is in UTC calendar days.

export const DAY_MS = 86400000

export function toDateKey(d: Date | string): string {
    return (typeof d === "string" ? new Date(d) : d).toISOString().slice(0, 10)
}

export function parseDateOnly(s: string): Date | null {
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(s || ""))) return null
    const d = new Date(String(s).slice(0, 10) + "T00:00:00.000Z")
    return isNaN(d.getTime()) ? null : d
}

// The leave year containing `d`, as [start, endExclusive).
export function leaveYearRange(d: Date, yearStartMonth: number): { start: Date; end: Date; label: string } {
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth() + 1
    const startYear = m >= yearStartMonth ? y : y - 1
    const start = new Date(Date.UTC(startYear, yearStartMonth - 1, 1))
    const end = new Date(Date.UTC(startYear + 1, yearStartMonth - 1, 1))
    const label = yearStartMonth === 1 ? String(startYear) : `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`
    return { start, end, label }
}

export type DayBreakdown = {
    days: number
    calendarDays: number
    weeklyOffs: number
    holidays: { date: string; name: string }[]
}

// Working days a leave actually consumes: weekly offs and holidays inside the
// range are not charged against the balance.
export function countLeaveDays(
    start: Date, end: Date, policy: LeavePolicy,
    holidays: { date: Date | string; name: string }[], halfDay = false,
): DayBreakdown {
    const hol = new Map<string, string>()
    if (policy.excludeHolidays) for (const h of holidays) hol.set(toDateKey(h.date), h.name)
    let days = 0, weeklyOffs = 0
    const hit: { date: string; name: string }[] = []
    const calendarDays = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1
    for (let i = 0; i < calendarDays; i++) {
        const d = new Date(start.getTime() + i * DAY_MS)
        const key = toDateKey(d)
        if (policy.weeklyOff.includes(d.getUTCDay())) { weeklyOffs++; continue }
        if (hol.has(key)) { hit.push({ date: key, name: hol.get(key)! }); continue }
        days++
    }
    if (halfDay && days > 0) days = 0.5
    return { days, calendarDays, weeklyOffs, holidays: hit }
}

// Pro-rated entitlement for someone who joined part-way through the leave year,
// rounded down to the nearest half day.
export function entitlementFor(rule: LeaveTypeRule, yearStart: Date, joinedOn: Date | null): number | null {
    if (rule.annualQuota === null) return null
    if (!rule.proRata || !joinedOn || joinedOn <= yearStart) return rule.annualQuota
    const monthsBefore = (joinedOn.getUTCFullYear() - yearStart.getUTCFullYear()) * 12 + (joinedOn.getUTCMonth() - yearStart.getUTCMonth())
    const monthsLeft = Math.max(0, 12 - monthsBefore)
    return Math.floor((rule.annualQuota * monthsLeft) / 12 * 2) / 2
}

export type LeaveBalance = {
    code: string
    name: string
    color: string
    paid: boolean
    entitled: number | null
    carriedForward: number
    used: number
    pending: number
    available: number | null
}
