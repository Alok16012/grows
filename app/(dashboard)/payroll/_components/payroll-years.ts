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
const FIRST_PAYROLL_YEAR = 2024
const IST_OFFSET_MS = 330 * 60000

export function istNow(): Date {
    return new Date(Date.now() + IST_OFFSET_MS)
}

/** Calendar year in IST. */
export function currentPayrollYear(): number {
    return istNow().getUTCFullYear()
}

/** Calendar month in IST, 1-12. */
export function currentPayrollMonth(): number {
    return istNow().getUTCMonth() + 1
}

/** 2024 .. currentYear + 1, ascending. */
export function payrollYears(): number[] {
    const last = currentPayrollYear() + 1
    const years: number[] = []
    for (let y = FIRST_PAYROLL_YEAR; y <= last; y++) years.push(y)
    return years
}
