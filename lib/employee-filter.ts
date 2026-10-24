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
    }
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

    if (f.siteId) {
        where.deployments = { some: { siteId: f.siteId, isActive: true } }
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
