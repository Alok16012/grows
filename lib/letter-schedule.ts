// Joining letters on a schedule (Onboarding → Joining letters).
// Each rule says which HR document template goes to whom, and when — e.g. the
// Appointment Letter 15 days after the joining date. Client-safe.

export const LETTER_TRIGGERS = {
    JOINING: "Joining date",
    CONVERTED: "Candidate converted (record created)",
    APPROVED: "Onboarding approved",
} as const
export type LetterTrigger = keyof typeof LETTER_TRIGGERS

export type LetterRule = {
    id: string
    /** HrDocumentType id (the template). */
    typeId: string
    enabled: boolean
    trigger: LetterTrigger
    /** Days after the trigger date (negative = before). */
    offsetDays: number
    /** Issue automatically on the due date (daily job); off = only listed as due. */
    autoIssue: boolean
    /** In-app note to the employee when it is issued. */
    notify: boolean
    /** Only these employment types / sites; empty = everyone. */
    employmentTypes: string[]
    siteIds: string[]
    /** Only people whose trigger date is on/after this date (YYYY-MM-DD); keeps old staff out. */
    fromDate: string | null
    /** Whose saved signature goes on the letter; empty = the person issuing (or none for the daily job). */
    signerUserId: string | null
}

export type LetterSettings = {
    rules: LetterRule[]
    /** Due for more than this many days → shown as overdue. */
    overdueAfterDays: number
    /** Most letters the daily job issues in one run. */
    maxPerRun: number
}

export const DEFAULT_LETTER_SETTINGS: LetterSettings = { rules: [], overdueAfterDays: 3, maxPerRun: 200 }

const int = (v: unknown, d: number, lo: number, hi: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) && v !== null && v !== "" ? Math.min(hi, Math.max(lo, n)) : d }
const ids = (v: unknown) => Array.isArray(v) ? Array.from(new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length < 80))).slice(0, 200) : []

export function sanitizeLetterSettings(v: any): LetterSettings {
    const d = DEFAULT_LETTER_SETTINGS
    const rules: LetterRule[] = (Array.isArray(v?.rules) ? v.rules : []).slice(0, 20).flatMap((r: any): LetterRule[] => {
        if (!r || typeof r.typeId !== "string" || !r.typeId) return []
        const trigger: LetterTrigger = r.trigger in LETTER_TRIGGERS ? r.trigger : "JOINING"
        return [{
            id: typeof r.id === "string" && /^[\w-]{4,40}$/.test(r.id) ? r.id : `r${Math.random().toString(36).slice(2, 10)}`,
            typeId: r.typeId, enabled: r.enabled === true, trigger,
            offsetDays: int(r.offsetDays, 0, -90, 365),
            autoIssue: r.autoIssue !== false, notify: r.notify !== false,
            employmentTypes: ids(r.employmentTypes), siteIds: ids(r.siteIds),
            fromDate: typeof r.fromDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.fromDate) ? r.fromDate : null,
            signerUserId: typeof r.signerUserId === "string" && r.signerUserId ? r.signerUserId : null,
        }]
    })
    return { rules, overdueAfterDays: int(v?.overdueAfterDays, d.overdueAfterDays, 0, 90), maxPerRun: int(v?.maxPerRun, d.maxPerRun, 1, 1000) }
}

export const LETTER_STATUS = {
    UPCOMING: "Not due yet",
    DUE: "Due — not sent",
    OVERDUE: "Overdue — not sent",
    WAITING: "Waiting for approval",
    SENT: "Sent",
    ACKNOWLEDGED: "Acknowledged",
    SKIPPED: "Skipped",
} as const
export type LetterStatus = keyof typeof LETTER_STATUS

export function ruleText(r: LetterRule, typeName: string): string {
    const when = r.offsetDays === 0 ? "on" : r.offsetDays > 0 ? `${r.offsetDays} day(s) after` : `${-r.offsetDays} day(s) before`
    return `${typeName} — ${when} ${LETTER_TRIGGERS[r.trigger].toLowerCase()}`
}
