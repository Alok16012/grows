// HR letters on a schedule (Onboarding → HR letters).
// Each rule says which HR document template goes to whom, and when — e.g. the
// Appointment Letter on the joining date, the Confirmation Letter 6 months
// after joining, the Increment Letter whenever a salary revision is recorded.
// Everything here is a setting; nothing is fixed in code. Client-safe.

export const LETTER_TRIGGERS = {
    JOINING: "Joining date",
    CONVERTED: "Candidate converted (record created)",
    APPROVED: "Onboarding approved",
    CONFIRMATION: "Confirmation period completed (from joining date)",
    SALARY_REVISION: "Salary revision recorded",
    SITE_CHANGE: "Site changed (transfer)",
    EXIT: "Left — last working date recorded",
    ON_DEMAND: "On demand — HR issues it when needed",
} as const
export type LetterTrigger = keyof typeof LETTER_TRIGGERS

/** Triggers that can happen many times for one person — one letter per event. */
export const REPEATING_TRIGGERS: LetterTrigger[] = ["SALARY_REVISION", "SITE_CHANGE"]
/** Triggers with no date — no tracker rows; HR issues from Letters & Documents. */
export const isOnDemand = (t: LetterTrigger) => t === "ON_DEMAND"

/** Extra {{variables}} each trigger fills, on top of the usual ones. */
export const TRIGGER_VARIABLES: Partial<Record<LetterTrigger, string[]>> = {
    CONFIRMATION: ["{{confirmation_date}}", "{{probation_months}}"],
    SALARY_REVISION: ["{{old_salary}}", "{{new_salary}}", "{{increment_amount}}", "{{effective_month}}"],
    SITE_CHANGE: ["{{from_site}}", "{{to_site}}", "{{transfer_date}}"],
    EXIT: ["{{last_working_date}}"],
}

export type LetterRule = {
    id: string
    /** HrDocumentType id (the template). */
    typeId: string
    enabled: boolean
    trigger: LetterTrigger
    /** Days after the trigger date (negative = before). */
    offsetDays: number
    /** CONFIRMATION: months after the joining date (6 = six months, 12 = one year). */
    periodMonths: number
    /** SALARY_REVISION: only when the monthly CTC goes up (off = any change). */
    onlyIncrease: boolean
    /** SALARY_REVISION: ignore changes smaller than this many rupees a month (e.g. VDA / minimum-wage updates); 0 = any. */
    minChange: number
    /** Issue automatically on the due date (daily job); off = only listed as due. */
    autoIssue: boolean
    /** In-app note to the employee when it is issued. */
    notify: boolean
    /** Only these employment types / sites; empty = everyone. */
    employmentTypes: string[]
    siteIds: string[]
    /** Only events on/after this date (YYYY-MM-DD); keeps old staff and old events out. */
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
    const rules: LetterRule[] = (Array.isArray(v?.rules) ? v.rules : []).slice(0, 40).flatMap((r: any): LetterRule[] => {
        if (!r || typeof r.typeId !== "string" || !r.typeId) return []
        const trigger: LetterTrigger = r.trigger in LETTER_TRIGGERS ? r.trigger : "JOINING"
        return [{
            id: typeof r.id === "string" && /^[\w-]{4,40}$/.test(r.id) ? r.id : `r${Math.random().toString(36).slice(2, 10)}`,
            typeId: r.typeId, enabled: r.enabled === true, trigger,
            offsetDays: int(r.offsetDays, 0, -90, 365),
            periodMonths: int(r.periodMonths, 6, 1, 36),
            onlyIncrease: r.onlyIncrease !== false,
            minChange: int(r.minChange, 0, 0, 1000000),
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
    if (r.trigger === "ON_DEMAND") return `${typeName} — on demand (HR issues it)`
    const when = r.offsetDays === 0 ? "on" : r.offsetDays > 0 ? `${r.offsetDays} day(s) after` : `${-r.offsetDays} day(s) before`
    if (r.trigger === "CONFIRMATION") {
        const p = r.periodMonths % 12 === 0 ? `${r.periodMonths / 12} year${r.periodMonths > 12 ? "s" : ""}` : `${r.periodMonths} months`
        return `${typeName} — ${when} completing ${p} from joining`
    }
    if (r.trigger === "SALARY_REVISION") return `${typeName} — ${when} each salary ${r.onlyIncrease ? "increase" : "revision"} recorded`
    if (r.trigger === "SITE_CHANGE") return `${typeName} — ${when} each site change`
    if (r.trigger === "EXIT") return `${typeName} — ${when} the last working date, once the person has left`
    return `${typeName} — ${when} ${LETTER_TRIGGERS[r.trigger].toLowerCase()}`
}

/**
 * The standard HR letters (from the client's letter sheet). "Set up standard
 * letters" adds a rule for each — or updates the rule already there for that
 * template — and can create any template that does not exist yet.
 */
export type StandardLetter = { name: string; trigger: LetterTrigger; offsetDays: number; periodMonths?: number; requiresApproval: boolean; note: string }
export const STANDARD_LETTERS: StandardLetter[] = [
    { name: "Joining Letter", trigger: "JOINING", offsetDays: 0, requiresApproval: false, note: "Automatically from the onboarding data" },
    { name: "Offer Letter", trigger: "CONVERTED", offsetDays: 0, requiresApproval: true, note: "Automatically from the onboarding data" },
    { name: "Appointment Letter", trigger: "JOINING", offsetDays: 0, requiresApproval: false, note: "Automatically from the onboarding data" },
    { name: "Confirmation Letter", trigger: "CONFIRMATION", offsetDays: 0, periodMonths: 6, requiresApproval: true, note: "After the confirmation period (6 months or 1 year) from the joining date" },
    { name: "Increment Letter", trigger: "SALARY_REVISION", offsetDays: 0, requiresApproval: true, note: "When a salary revision is recorded — revised salary and the month it applies from" },
    { name: "Transfer Letter", trigger: "SITE_CHANGE", offsetDays: 0, requiresApproval: true, note: "When the assigned site changes" },
    { name: "Experience Letter", trigger: "EXIT", offsetDays: 0, requiresApproval: false, note: "Once the last working date is recorded and the person has left" },
    { name: "Relieving Letter", trigger: "EXIT", offsetDays: 0, requiresApproval: false, note: "Same exit conditions as the experience letter" },
    { name: "Salary Certificate", trigger: "EXIT", offsetDays: 0, requiresApproval: false, note: "Same exit conditions as the experience letter" },
    { name: "Warning Letter", trigger: "ON_DEMAND", offsetDays: 0, requiresApproval: true, note: "On demand, when HR needs it" },
    { name: "Appreciation Letter", trigger: "ON_DEMAND", offsetDays: 0, requiresApproval: true, note: "On demand, when HR needs it" },
]

/** Starter wording for templates that do not exist yet (HR can edit them in HR Letters → Templates). */
export const STARTER_TEMPLATES: Record<string, string> = {
    "Joining Letter": `<p>Date: {{date}}</p><p>To,<br/><b>{{employee_name}}</b> ({{employee_id}})</p><p><b>Subject: Joining Letter</b></p><p>Dear {{employee_name}},</p><p>We are pleased to confirm that you have joined <b>{{company_name}}</b> as <b>{{designation}}</b> on <b>{{joining_date}}</b>.</p><p>Your monthly CTC is ₹{{salary}}. Please keep this letter for your records.</p><p>We wish you a long and successful career with us.</p><p>For {{company_name}}<br/>Authorised Signatory</p>`,
    "Increment Letter": `<p>Date: {{date}}</p><p>To,<br/><b>{{employee_name}}</b> ({{employee_id}})<br/>{{designation}}</p><p><b>Subject: Salary Revision</b></p><p>Dear {{employee_name}},</p><p>We are pleased to inform you that your salary has been revised with effect from <b>{{effective_month}}</b>.</p><p>Previous monthly CTC: ₹{{old_salary}}<br/>Revised monthly CTC: <b>₹{{new_salary}}</b><br/>Increase: ₹{{increment_amount}}</p><p>All other terms of your employment remain the same. We appreciate your contribution and look forward to your continued good work.</p><p>For {{company_name}}<br/>Authorised Signatory</p>`,
    "Transfer Letter": `<p>Date: {{date}}</p><p>To,<br/><b>{{employee_name}}</b> ({{employee_id}})<br/>{{designation}}</p><p><b>Subject: Transfer Letter</b></p><p>Dear {{employee_name}},</p><p>You are hereby transferred from <b>{{from_site}}</b> to <b>{{to_site}}</b> with effect from <b>{{transfer_date}}</b>.</p><p>Please report to the site in-charge at {{to_site}} on that date. Your salary and other terms of employment remain unchanged.</p><p>For {{company_name}}<br/>Authorised Signatory</p>`,
    "Appreciation Letter": `<p>Date: {{date}}</p><p>To,<br/><b>{{employee_name}}</b> ({{employee_id}})<br/>{{designation}}</p><p><b>Subject: Letter of Appreciation</b></p><p>Dear {{employee_name}},</p><p>On behalf of <b>{{company_name}}</b>, we appreciate your dedication and the excellent work you have done. Your effort sets a fine example for the team.</p><p>Keep up the good work.</p><p>For {{company_name}}<br/>Authorised Signatory</p>`,
    "Confirmation Letter": `<p>Date: {{date}}</p><p>To,<br/><b>{{employee_name}}</b> ({{employee_id}})</p><p><b>Subject: Confirmation of Employment</b></p><p>Dear {{employee_name}},</p><p>Further to your joining on {{joining_date}}, you have completed your probation period of {{probation_months}} months. We are pleased to confirm your employment as <b>{{designation}}</b> with effect from <b>{{confirmation_date}}</b>.</p><p>For {{company_name}}<br/>Authorised Signatory</p>`,
    "Experience Letter": `<p>Date: {{date}}</p><p><b>TO WHOM IT MAY CONCERN</b></p><p>This is to certify that <b>{{employee_name}}</b> ({{employee_id}}) worked with {{company_name}} as {{designation}} from {{joining_date}} to {{last_working_date}}.</p><p>We wish them all the best.</p><p>For {{company_name}}<br/>Authorised Signatory</p>`,
    "Relieving Letter": `<p>Date: {{date}}</p><p>To,<br/><b>{{employee_name}}</b> ({{employee_id}})</p><p>This is to confirm that you have been relieved from your duties as {{designation}} at {{company_name}} at the close of working hours on {{last_working_date}}.</p><p>For {{company_name}}<br/>Authorised Signatory</p>`,
    "Salary Certificate": `<p>Date: {{date}}</p><p><b>SALARY CERTIFICATE</b></p><p>This is to certify that <b>{{employee_name}}</b> ({{employee_id}}) worked with {{company_name}} as {{designation}} from {{joining_date}} to {{last_working_date}}, and was drawing a monthly CTC of ₹{{salary}}.</p><p>For {{company_name}}<br/>Authorised Signatory</p>`,
    "Warning Letter": `<p>Date: {{date}}</p><p>To,<br/><b>{{employee_name}}</b> ({{employee_id}})<br/>{{designation}}</p><p><b>Subject: Warning Letter</b></p><p>Dear {{employee_name}},</p><p>This letter is a formal warning regarding [describe the issue]. You are advised to improve immediately. Any repetition may lead to strict disciplinary action.</p><p>For {{company_name}}<br/>Authorised Signatory</p>`,
    "Offer Letter": `<p>Date: {{date}}</p><p>Dear {{employee_name}},</p><p>We are pleased to offer you the position of <b>{{designation}}</b> at {{company_name}} with a monthly CTC of ₹{{salary}}. Your expected joining date is {{joining_date}}.</p><p>For {{company_name}}<br/>Authorised Signatory</p>`,
    "Appointment Letter": `<p>Date: {{date}}</p><p>Dear {{employee_name}},</p><p>You are appointed as <b>{{designation}}</b> at {{company_name}} from {{joining_date}} at a monthly CTC of ₹{{salary}}.</p><p>For {{company_name}}<br/>Authorised Signatory</p>`,
}
