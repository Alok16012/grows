import prisma from "@/lib/prisma"

/**
 * Resolving which salary structure applies to a given payroll month.
 *
 * EmployeeSalary holds one row per employee with no history, so before this an
 * increment uploaded in October changed what a re-run of September would pay.
 * SalaryRevision records a structure against the month it takes effect from,
 * and the wage run asks here which one to use.
 */

/** The salary fields the payroll engine actually reads. */
export type SalaryComponents = {
    basic: number
    da: number
    hra: number
    washing: number
    conveyance: number
    leaveWithWages: number
    otherAllowance: number
    bonus: number
    otRatePerHour: number
    canteenRatePerDay: number
    complianceType: string
}

/** A month, as payroll counts them: month is 1-12. */
export type EffectiveMonth = { month: number; year: number }

/** Sortable key for a month, so comparisons don't need date objects. */
export const monthKey = (year: number, month: number) => year * 12 + month

export function isValidEffectiveMonth(m: unknown, y: unknown): boolean {
    const month = Number(m), year = Number(y)
    return Number.isInteger(month) && month >= 1 && month <= 12
        && Number.isInteger(year) && year >= 2000 && year <= 2100
}

export type RevisionRow = SalaryComponents & {
    employeeId: string
    effectiveMonth: number
    effectiveYear: number
}

/**
 * Newest revision per employee, by effective month. Pure and separate from the
 * query on purpose: which structure an employee is paid on is the one thing
 * here that must not be wrong, and picking it by an explicit max rather than
 * by "whatever the database returned last" keeps it correct however the rows
 * happen to arrive.
 *
 * Callers pass rows ALREADY filtered to "effective on or before the target
 * month" — this only resolves ties between several that qualify.
 */
export function pickLatestPerEmployee(rows: RevisionRow[]): Map<string, SalaryComponents> {
    const best = new Map<string, RevisionRow>()
    for (const r of rows) {
        const seen = best.get(r.employeeId)
        if (!seen || monthKey(r.effectiveYear, r.effectiveMonth) > monthKey(seen.effectiveYear, seen.effectiveMonth)) {
            best.set(r.employeeId, r)
        }
    }

    const out = new Map<string, SalaryComponents>()
    for (const [employeeId, r] of best) {
        out.set(employeeId, {
            basic: r.basic,
            da: r.da,
            hra: r.hra,
            washing: r.washing,
            conveyance: r.conveyance,
            leaveWithWages: r.leaveWithWages,
            otherAllowance: r.otherAllowance,
            bonus: r.bonus,
            otRatePerHour: r.otRatePerHour,
            canteenRatePerDay: r.canteenRatePerDay,
            complianceType: r.complianceType,
        })
    }
    return out
}

/**
 * For each employee, the revision in force during (month, year): the newest one
 * effective on or before that month. An employee with no such revision is
 * absent from the map, and the caller falls back to EmployeeSalary — which is
 * the behaviour every employee had before revisions existed.
 *
 * Fetched in one query for the whole batch rather than per employee: the wage
 * run processes hundreds of employees at a time and Vercel and Supabase sit in
 * different regions, where per-row lookups cost seconds.
 */
export async function revisionsForMonth(
    employeeIds: string[],
    { month, year }: EffectiveMonth,
): Promise<Map<string, SalaryComponents>> {
    if (!employeeIds.length) return new Map()

    const rows = await prisma.salaryRevision.findMany({
        where: {
            employeeId: { in: employeeIds },
            // Effective on or before the target month. Expressed as "an earlier
            // year, or the same year up to this month" because the two columns
            // can't be compared as one value in a Prisma filter.
            OR: [
                { effectiveYear: { lt: year } },
                { effectiveYear: year, effectiveMonth: { lte: month } },
            ],
        },
    })

    return pickLatestPerEmployee(rows as unknown as RevisionRow[])
}
