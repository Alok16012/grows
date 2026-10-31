/**
 * The one place the employee list's filters are turned into a Prisma `where`.
 *
 * The Employees page and the Excel export used to build this separately — in
 * fact the export built nothing at all and always read the whole table. So
 * filtering the list to ACTIVE and hitting Export handed back every employee,
 * including RESIGNED ones and PENDING-xxxx onboarding rows the list itself
 * never shows. Both callers now go through here, so what you export is what
 * you were looking at.
 */

import { employmentTypeVariants } from "./employment-type"

export type EmployeeFilters = {
    branchId?: string | null
    departmentId?: string | null
    siteId?: string | null
    status?: string | null
    search?: string | null
    employmentType?: string | null
    /** "YYYY-MM-DD": only people who had joined by that day (no joining date counts as joined). */
    joinedBy?: string | null
    /**
     * "YYYY-MM": only people on the rolls that month — see onRollsWhere. Leave
     * `status` unset with it: it decides which statuses count. With `siteId`,
     * someone who left during or after the month still counts at the site
     * they were posted to when they left.
     */
    payrollMonth?: string | null
}

/** Statuses meaning the person has left; their leaving date then bounds the months they appear in. */
export const LEFT_STATUSES = ["RESIGNED", "TERMINATED", "INACTIVE"] as const

/** "YYYY-MM" → { month, year }, or null. */
export function parsePayrollMonth(v: string | null | undefined): { month: number; year: number } | null {
    const m = /^(\d{4})-(\d{2})$/.exec(v ?? "")
    if (!m) return null
    const year = Number(m[1]), month = Number(m[2])
    return month >= 1 && month <= 12 ? { month, year } : null
}

/**
 * Who is on the rolls for a month — the same rule as the attendance upload
 * (attendance-sheet.ts classifyRow): from the joining month on (no joining date
 * counts as joined), and for someone who has left, up to and including their
 * leaving month. Active / On-leave staff ignore a leftover leaving date (some
 * carry an old one from a rehire); a leaver with no leaving date is left out.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function onRollsWhere(month: number, year: number): Record<string, any>[] {
    const monthStart = new Date(Date.UTC(year, month - 1, 1))
    const monthEnd = new Date(`${monthEndKey(month, year)}T23:59:59.999Z`)
    return [
        { OR: [{ dateOfJoining: null }, { dateOfJoining: { lte: monthEnd } }] },
        { OR: [
            { status: { in: ["ACTIVE", "ON_LEAVE"] } },
            { status: { in: [...LEFT_STATUSES] }, dateOfLeaving: { gte: monthStart } },
        ] },
    ]
}

/** Reads the filter set off a request's query string. */
export function employeeFiltersFromParams(searchParams: URLSearchParams): EmployeeFilters {
    return {
        branchId:       searchParams.get("branchId"),
        departmentId:   searchParams.get("departmentId"),
        siteId:         searchParams.get("siteId"),
        status:         searchParams.get("status"),
        search:         searchParams.get("search"),
        employmentType: searchParams.get("employmentType"),
        joinedBy:       searchParams.get("joinedBy"),
        payrollMonth:   searchParams.get("payrollMonth"),
    }
}

/** Last day of a month as "YYYY-MM-DD" (month is 1–12), for the joinedBy filter. */
export function monthEndKey(month: number, year: number): string {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`
}

/** The same filters as a query string, for callers that build a URL. */
export function employeeFiltersToParams(f: EmployeeFilters): URLSearchParams {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(f)) {
        if (value) params.set(key, String(value))
    }
    return params
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildEmployeeWhere(f: EmployeeFilters): Record<string, any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {}

    if (f.branchId) where.branchId = f.branchId
    if (f.departmentId) where.departmentId = f.departmentId

    if (f.status) {
        where.status = f.status
    } else {
        // Exclude ONBOARDING employees from the default list — they only appear
        // in the Onboarding module.
        where.status = { not: "ONBOARDING" }
    }

    // Hide anyone still pending onboarding (placeholder EMP code / not yet
    // approved) regardless of employee.status — covers legacy records whose
    // status may be ACTIVE but whose onboarding was never completed. They only
    // live in the Onboarding module until approved.
    where.NOT = { onboardingRecord: { is: { status: { not: "COMPLETED" } } } }

    if (f.employmentType) {
        // Stored spellings vary ("CONTRACT", "Contractual", …), so match every
        // raw form of the chosen type, not just the dropdown's label.
        where.AND = [{
            OR: employmentTypeVariants(f.employmentType).map(v => ({
                employmentType: { equals: v, mode: "insensitive" },
            })),
        }]
    }

    const rollsMonth = parsePayrollMonth(f.payrollMonth)
    if (f.siteId) {
        if (rollsMonth) {
            // A leaver's posting is closed on exit (isActive false, endDate =
            // leaving date), so "posted here now" would drop them from the very
            // months they still have to be paid for. They count at the site whose
            // posting ended on or after the month started; everyone else only at
            // their current site (a transfer doesn't list them at the old one).
            const monthStart = new Date(Date.UTC(rollsMonth.year, rollsMonth.month - 1, 1))
            where.AND = [...(where.AND ?? []), { OR: [
                { deployments: { some: { siteId: f.siteId, isActive: true } } },
                { status: { in: [...LEFT_STATUSES] }, deployments: { some: { siteId: f.siteId, endDate: { gte: monthStart } } } },
            ] }]
        } else {
            where.deployments = { some: { siteId: f.siteId, isActive: true } }
        }
    }

    if (rollsMonth) {
        where.AND = [...(where.AND ?? []), ...onRollsWhere(rollsMonth.month, rollsMonth.year)]
    }

    // Month-based screens (salary structure, payroll, attendance, muster) list a
    // person from their joining month on, not before they joined.
    if (f.joinedBy && /^\d{4}-\d{2}-\d{2}$/.test(f.joinedBy)) {
        where.AND = [...(where.AND ?? []), {
            OR: [{ dateOfJoining: null }, { dateOfJoining: { lte: new Date(`${f.joinedBy}T23:59:59.999Z`) } }],
        }]
    }

    // Each whitespace-separated word must hit at least one field, so "Rahul",
    // "Kumar", "Rahul Kumar" and "Kumar Rahul" all find Rahul Kumar. A single
    // word behaves exactly as the old one-term search did.
    const tokens = (f.search ?? "").split(/\s+/).map(t => t.trim()).filter(Boolean)
    if (tokens.length) {
        const perToken = tokens.map(token => ({
            OR: [
                { firstName:   { contains: token, mode: "insensitive" } },
                { middleName:  { contains: token, mode: "insensitive" } },
                { lastName:    { contains: token, mode: "insensitive" } },
                { employeeId:  { contains: token, mode: "insensitive" } },
                { phone:       { contains: token, mode: "insensitive" } },
                { designation: { contains: token, mode: "insensitive" } },
            ],
        }))
        where.AND = [...(where.AND ?? []), ...perToken]
    }

    return where
}

// ─── Who may be picked as a Manager / Inspector ──────────────────────────────

/**
 * Employee statuses that keep a person out of the Manager / Inspector pickers
 * and off a fresh save. ON_LEAVE is allowed — they are still on the payroll.
 */
export const UNASSIGNABLE_EMPLOYEE_STATUSES = ["ONBOARDING", "INACTIVE", "TERMINATED", "RESIGNED"] as const

/** The `where` for the one picker-eligible user list: active login, active employee. */
export const ASSIGNABLE_USER_WHERE = {
    isActive: true,
    employeeProfile: { is: { status: { notIn: [...UNASSIGNABLE_EMPLOYEE_STATUSES] } } },
}

/**
 * A `where` that finds the first of `userIds` who must not be newly assigned.
 * Shared by the project, assignment and site-team save routes, which pass it
 * to `prisma.user.findFirst` and turn a hit into `unassignableMessage`.
 */
export function unassignableUserWhere(userIds: string[]) {
    return {
        id: { in: userIds },
        OR: [
            { isActive: false },
            { employeeProfile: { is: { status: { in: [...UNASSIGNABLE_EMPLOYEE_STATUSES] } } } },
        ],
    }
}

/** Select to pair with `unassignableUserWhere`. */
export const UNASSIGNABLE_USER_SELECT = {
    name: true, isActive: true, employeeProfile: { select: { status: true } },
} as const

/** "Rahul Kumar is resigned and can't be assigned" — the 400 body for a blocked pick. */
export function unassignableMessage(u: { name: string; isActive: boolean; employeeProfile: { status: string } | null }): string {
    const status = u.employeeProfile?.status
    const why =
        status === "RESIGNED" ? "resigned"
        : status === "TERMINATED" ? "terminated"
        : status === "INACTIVE" ? "inactive"
        : status === "ONBOARDING" ? "still onboarding"
        : !u.isActive ? "deactivated"
        : "not an active employee"
    return `${u.name} is ${why} and can't be assigned`
}
