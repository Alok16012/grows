// Admin → Access centre settings. Client-safe.

export type AccessCentreSettings = {
    /** Disable logins nobody has used for this many days (0 = never). Admins and exempt roles are never disabled. */
    idleDisableDays: number
    /** Roles never disabled for being idle. */
    idleExemptRoleIds: string[]
    /** Wrong attempts before a login is locked. */
    lockAfterFailures: number
    /** How long a lock lasts (minutes). */
    lockMinutes: number
    /** Tell Admins when one login id or one IP fails this many times in a day (0 = off). */
    alertAfterFailures: number
    /** Remind to review access every this many days (0 = off). */
    reviewEveryDays: number
    /** When last-seen tracking started (set automatically; idle counting never goes back further). */
    trackingSince: string | null
}

export const DEFAULT_ACCESS_CENTRE: AccessCentreSettings = {
    idleDisableDays: 0, idleExemptRoleIds: [], lockAfterFailures: 5, lockMinutes: 15, alertAfterFailures: 10, reviewEveryDays: 90, trackingSince: null,
}

const int = (v: unknown, d: number, lo: number, hi: number) => { const n = Math.round(Number(v)); return v !== null && v !== "" && v !== undefined && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d }

export function sanitizeAccessCentre(v: any): AccessCentreSettings {
    const d = DEFAULT_ACCESS_CENTRE
    return {
        idleDisableDays: int(v?.idleDisableDays, d.idleDisableDays, 0, 3650),
        idleExemptRoleIds: Array.isArray(v?.idleExemptRoleIds) ? Array.from(new Set(v.idleExemptRoleIds.filter((x: unknown): x is string => typeof x === "string" && !!x))).slice(0, 50) as string[] : [],
        lockAfterFailures: int(v?.lockAfterFailures, d.lockAfterFailures, 3, 20),
        lockMinutes: int(v?.lockMinutes, d.lockMinutes, 1, 1440),
        alertAfterFailures: int(v?.alertAfterFailures, d.alertAfterFailures, 0, 1000),
        reviewEveryDays: int(v?.reviewEveryDays, d.reviewEveryDays, 0, 3650),
        trackingSince: typeof v?.trackingSince === "string" && /^\d{4}-\d{2}-\d{2}/.test(v.trackingSince) ? v.trackingSince.slice(0, 10) : null,
    }
}
