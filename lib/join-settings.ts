// Join link (public /join form) — settings. Client-safe.

export const JOIN_DUP_FIELDS = {
    aadhar: "Aadhaar number",
    pan: "PAN",
    bankAccount: "Bank account",
    uan: "UAN",
} as const
export type JoinDupField = keyof typeof JOIN_DUP_FIELDS

/** Join-form fields HR can make required or optional (the core ones — name, mobile,
 *  address, site, designation, bank, Aadhaar — are always required). */
export const JOIN_OPTIONAL_FIELDS = {
    panNumber: "PAN number",
    email: "Email",
    alternatePhone: "Alternate phone",
    fathersName: "Father's name",
    bloodGroup: "Blood group",
    maritalStatus: "Marital status",
    nameAsPerAadhar: "Name as per Aadhaar",
    permanentAddress: "Permanent address",
    uan: "UAN",
    pfNumber: "PF number",
    esiNumber: "ESIC number",
} as const
export type JoinOptionalField = keyof typeof JOIN_OPTIONAL_FIELDS
/** Documents the form asks for. */
export const JOIN_DOCS = { AADHAAR: "Aadhaar card", PAN: "PAN card", PHOTO: "Passport size photo", BANK_DETAILS: "Bank passbook / cancelled cheque", OTHER: "Any other document" } as const
export type JoinDoc = keyof typeof JOIN_DOCS
export const JOIN_LANG_KEYS = ["en", "hi", "mr"] as const

export type JoinSettings = {
    form: {
        /** Optional fields made required. */
        required: JoinOptionalField[]
        /** Documents that must be uploaded. */
        docs: JoinDoc[]
        /** Languages the candidate can switch to (English always). */
        languages: (typeof JOIN_LANG_KEYS)[number][]
    }
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
    form: { required: ["panNumber"], docs: ["AADHAAR", "PAN", "PHOTO", "BANK_DETAILS"], languages: ["en", "hi", "mr"] },
    duplicates: { fields: ["aadhar", "pan", "bankAccount", "uan"], rejoinAlert: true },
    alerts: { recruiter: true, approvers: true, waitingAfterHours: 24 },
}

export function sanitizeJoinSettings(v: any): JoinSettings {
    const d = DEFAULT_JOIN_SETTINGS
    const fields: JoinDupField[] = Array.isArray(v?.duplicates?.fields) ? Array.from(new Set<JoinDupField>(v.duplicates.fields.filter((f: unknown): f is JoinDupField => typeof f === "string" && f in JOIN_DUP_FIELDS))) : d.duplicates.fields
    const b = (x: unknown, def: boolean) => typeof x === "boolean" ? x : def
    const hours = Number(v?.alerts?.waitingAfterHours)
    const pick = <T extends string>(arr: unknown, allowed: readonly string[], def: T[]): T[] => Array.isArray(arr) ? Array.from(new Set(arr.filter((x): x is T => typeof x === "string" && allowed.includes(x)))) : def
    const langs = pick<(typeof JOIN_LANG_KEYS)[number]>(v?.form?.languages, JOIN_LANG_KEYS, d.form.languages)
    return {
        form: {
            required: pick<JoinOptionalField>(v?.form?.required, Object.keys(JOIN_OPTIONAL_FIELDS), d.form.required),
            docs: pick<JoinDoc>(v?.form?.docs, Object.keys(JOIN_DOCS), d.form.docs),
            languages: langs.includes("en") ? langs : ["en", ...langs],
        },
        duplicates: { fields, rejoinAlert: b(v?.duplicates?.rejoinAlert, d.duplicates.rejoinAlert) },
        alerts: {
            recruiter: b(v?.alerts?.recruiter, d.alerts.recruiter),
            approvers: b(v?.alerts?.approvers, d.alerts.approvers),
            waitingAfterHours: Number.isFinite(hours) && v?.alerts?.waitingAfterHours !== null && v?.alerts?.waitingAfterHours !== "" ? Math.min(720, Math.max(0, Math.round(hours))) : d.alerts.waitingAfterHours,
        },
    }
}
