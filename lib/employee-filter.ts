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

    if (f.employmentType) where.employmentType = f.employmentType

    if (f.siteId) {
        where.deployments = { some: { siteId: f.siteId, isActive: true } }
    }

    if (f.search) {
        where.OR = [
            { firstName:   { contains: f.search, mode: "insensitive" } },
            { lastName:    { contains: f.search, mode: "insensitive" } },
            { employeeId:  { contains: f.search, mode: "insensitive" } },
            { phone:       { contains: f.search, mode: "insensitive" } },
            { designation: { contains: f.search, mode: "insensitive" } },
        ]
    }

    return where
}
