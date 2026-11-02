/**
 * Years offered in payroll month/year pickers.
 *
 * Every dropdown used to hard-code `[2024, 2025, 2026]`, which quietly stopped
 * offering the current year once the calendar rolled over. This derives the
 * range from today's date in IST (payroll is an Indian calendar concern — a
 * server or browser in UTC is still on 31 Dec when Mumbai is already in the
 * new year) and runs from the first year payroll was ever run here up to one
 * year ahead so next January can be set up in December.
 */
import { istNow, type Period } from "@/lib/payroll-period"
export { istNow }

const FIRST_PAYROLL_YEAR = 2024

/** Calendar year in IST. */
export function currentPayrollYear(): number {
    return istNow().getUTCFullYear()
}

/** Calendar month in IST, 1-12. */
export function currentPayrollMonth(): number {
    return istNow().getUTCMonth() + 1
}

/**
 * 2024 .. currentYear + 1, ascending. With `latest` (the newest created
 * month), up to its year only: later years have no month that can be opened.
 */
export function payrollYears(latest?: Period): number[] {
    const last = latest ? Math.max(latest.year, FIRST_PAYROLL_YEAR) : currentPayrollYear() + 1
    const years: number[] = []
    for (let y = FIRST_PAYROLL_YEAR; y <= last; y++) years.push(y)
    return years
}

/** Months 1-12 of `year` that can be picked: in `latest`'s year, up to it. */
export function payrollMonths(year: number, latest?: Period): number[] {
    const last = !latest || year < latest.year ? 12 : year === latest.year ? latest.month : 0
    return Array.from({ length: last }, (_, i) => i + 1)
}

/** `p`, pulled back to `latest` if it is after it. */
export function clampPeriod(p: Period, latest?: Period): Period {
    if (!latest) return p
    return p.year * 12 + p.month > latest.year * 12 + latest.month ? { month: latest.month, year: latest.year } : p
}
