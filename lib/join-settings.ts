// Join link (public /join form) — settings. Client-safe.

export const JOIN_DUP_FIELDS = {
    aadhar: "Aadhaar number",
    pan: "PAN",
    bankAccount: "Bank account",
    uan: "UAN",
} as const
export type JoinDupField = keyof typeof JOIN_DUP_FIELDS

export type JoinSettings = {
    duplicates: {
        /** Besides mobile and email (always checked — they are the login). */
        fields: JoinDupField[]
        /** A match with someone who has left → "rejoining ex-employee" alert to HR. */
        rejoinAlert: boolean
    }
    alerts: {
        /** Tell the recruiter whose link was used. */
        recruiter: boolean
        /** Tell everyone who can approve onboarding. */
        approvers: boolean
        /** Daily reminder to approvers while forms wait longer than this many hours (0 = off). */
        waitingAfterHours: number
    }
}

export const DEFAULT_JOIN_SETTINGS: JoinSettings = {
    duplicates: { fields: ["aadhar", "pan", "bankAccount", "uan"], rejoinAlert: true },
    alerts: { recruiter: true, approvers: true, waitingAfterHours: 24 },
}

export function sanitizeJoinSettings(v: any): JoinSettings {
    const d = DEFAULT_JOIN_SETTINGS
    const fields: JoinDupField[] = Array.isArray(v?.duplicates?.fields) ? Array.from(new Set<JoinDupField>(v.duplicates.fields.filter((f: unknown): f is JoinDupField => typeof f === "string" && f in JOIN_DUP_FIELDS))) : d.duplicates.fields
    const b = (x: unknown, def: boolean) => typeof x === "boolean" ? x : def
    const hours = Number(v?.alerts?.waitingAfterHours)
    return {
        duplicates: { fields, rejoinAlert: b(v?.duplicates?.rejoinAlert, d.duplicates.rejoinAlert) },
        alerts: {
            recruiter: b(v?.alerts?.recruiter, d.alerts.recruiter),
            approvers: b(v?.alerts?.approvers, d.alerts.approvers),
            waitingAfterHours: Number.isFinite(hours) && v?.alerts?.waitingAfterHours !== null && v?.alerts?.waitingAfterHours !== "" ? Math.min(720, Math.max(0, Math.round(hours))) : d.alerts.waitingAfterHours,
        },
    }
}
