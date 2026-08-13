// Fetching a COMPLETE employee roster from the client.
//
// GET /api/employees is paginated: it returns at most `pageSize` rows plus a
// `total` / `totalPages` describing the rest. Screens that need everyone —
// payroll grids, the Employee Master, employee pickers — used to ask for one
// large page (500 or 1000) and ignore that metadata, so every employee past the
// first page silently vanished. On the Employee Master that hid 221 of 722
// people; on a payroll grid it is worse, because the grid is what tells
// /api/payroll/calculate who to pay, so a missing employee is an unpaid one.
//
// This walks the pages instead, and reports honestly when it stops early.

export type FetchAllEmployeesResult<T> = {
    employees: T[]
    /** What the server says the roster size is, whether or not it all arrived. */
    total: number
    /** True when maxPages cut the walk short — the caller must tell the user. */
    truncated: boolean
}

// 1000 is the server's per-request ceiling (app/api/employees/route.ts).
const DEFAULT_PAGE_SIZE = 1000
// Backstop so a runaway roster can't lock the browser up. Hitting it is
// reported, never swallowed.
const DEFAULT_MAX_PAGES = 20

export async function fetchAllEmployees<T = any>(
    query: Record<string, string | number | boolean | undefined | null> = {},
    opts: { pageSize?: number; maxPages?: number } = {},
): Promise<FetchAllEmployeesResult<T>> {
    const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE
    const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES

    const employees: T[] = []
    let page = 1
    let totalPages = 1
    let total = 0

    do {
        const params = new URLSearchParams()
        for (const [key, value] of Object.entries(query)) {
            if (value !== undefined && value !== null && value !== "") {
                params.set(key, String(value))
            }
        }
        params.set("page", String(page))
        params.set("pageSize", String(pageSize))

        const res = await fetch(`/api/employees?${params.toString()}`)
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()

        // Some callers hit endpoints that answer with a bare array and no paging
        // metadata — that response is already everything there is.
        const rows: T[] = Array.isArray(data) ? data : (data.employees ?? [])
        employees.push(...rows)
        totalPages = Array.isArray(data) ? 1 : (data.totalPages ?? 1)
        total = Array.isArray(data) ? rows.length : (data.total ?? employees.length)
        page++
    } while (page <= totalPages && page <= maxPages)

    return { employees, total, truncated: employees.length < total }
}
