/**
 * Which payroll months exist.
 *
 * A month is "created" once it has a PayrollRun. Months up to the newest
 * created one can be opened; the month after it has to be created first
 * (Create next month on the Payroll page), so the month picker no longer
 * offers October–December while September is still being worked on.
 * Shared by the Payroll page and the API so both apply the same rule.
 */
export type Period = { month: number; year: number }

const IST_OFFSET_MS = 330 * 60000

/** Now, shifted to IST: read it with the getUTC* methods. */
export function istNow(): Date {
    return new Date(Date.now() + IST_OFFSET_MS)
}

/** The calendar month in IST. */
export function istPeriod(): Period {
    const d = istNow()
    return { month: d.getUTCMonth() + 1, year: d.getUTCFullYear() }
}

/** Sortable number for a month: later month, bigger key. */
export function periodKey(p: Period): number {
    return p.year * 12 + p.month
}

export function shiftPeriod(p: Period, by: number): Period {
    const k = periodKey(p) - 1 + by
    return { month: (k % 12) + 1, year: Math.floor(k / 12) }
}

/**
 * The newest created month, or `fallback` (this calendar month) when payroll
 * has never been run. It is both the latest month the picker offers and the
 * month the Payroll page opens on: once a month is fully paid the page stays
 * on it, showing Create next month, rather than opening a month not created.
 */
export function latestPayrollPeriod(runs: Period[], fallback: Period): Period {
    if (!runs.length) return fallback
    const newest = runs.reduce((a, b) => (periodKey(b) > periodKey(a) ? b : a))
    return { month: newest.month, year: newest.year }
}

/**
 * How far ahead a month may be created: up to next calendar month, so
 * December can be set up during December's last days but a stray click can't
 * create next year's months.
 */
export function canCreatePeriod(p: Period, today: Period = istPeriod()): boolean {
    return periodKey(p) <= periodKey(shiftPeriod(today, 1))
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
export function periodLabel(p: Period): string {
    return `${MONTH_NAMES[p.month - 1]} ${p.year}`
}
