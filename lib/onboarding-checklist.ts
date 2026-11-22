// Onboarding → joining checklist. A template of tasks (a setting); many tick
// themselves from what really happened elsewhere (document uploaded, salary set,
// kit issued …). Tasks marked "before approval" gate the Approve button.
// Client-safe.

export const AUTO_CHECKS = {
    DOC_AADHAAR: "Aadhaar card uploaded",
    DOC_PAN: "PAN card uploaded",
    DOC_PHOTO: "Photo uploaded",
    DOC_BANK: "Bank passbook / cheque uploaded",
    POLICIES: "Joining policies signed",
    SITE: "Posted to a site",
    SALARY: "Salary structure set",
    BANK: "Bank account and IFSC filled",
    MANAGER: "Reporting manager set",
    UAN: "UAN filled",
    ESIC: "ESIC number filled",
    KIT: "Uniform / kit issued (Assets)",
    LEARNING: "Course assigned (Learning)",
    LETTER: "Joining letter issued",
    LOGIN: "Login active",
} as const
export type AutoCheck = keyof typeof AUTO_CHECKS

export const OWNERS = ["HR", "Recruiter", "Site manager", "Payroll", "Stores", "Employee"] as const

export type CheckTask = {
    id: string
    title: string
    owner: (typeof OWNERS)[number]
    /** Ticks itself from the real data; null = someone ticks it by hand. */
    auto: AutoCheck | null
    /** Must be done before onboarding can be approved. */
    beforeApproval: boolean
    /** Due this many days after the joining date (negative = before). */
    dueDays: number
    /** Only for these; empty = everyone. Designations match by "contains". */
    employmentTypes: string[]
    siteIds: string[]
    designations: string[]
}

export type ChecklistSettings = {
    tasks: CheckTask[]
    /** Who may approve with checks still open: approvers, only admins, or nobody. */
    override: "approvers" | "admins" | "none"
    /** Block approval when Aadhaar / PAN / bank / mobile match another employee. */
    blockDuplicates: boolean
    /** Warn when the joining date is more than this many days in the past (0 = off). */
    oldJoiningDays: number
    /** A person waiting in one stage longer than this is shown as stuck. */
    stuckAfterDays: number
    /** Keep approved joiners on the board this many days while tasks are open. */
    followUpDays: number
}

const t = (id: string, title: string, owner: CheckTask["owner"], auto: AutoCheck | null, beforeApproval: boolean, dueDays: number): CheckTask =>
    ({ id, title, owner, auto, beforeApproval, dueDays, employmentTypes: [], siteIds: [], designations: [] })

export const DEFAULT_CHECKLIST: ChecklistSettings = {
    tasks: [
        t("aadhaar", "Aadhaar card on file", "HR", "DOC_AADHAAR", true, 0),
        t("pan", "PAN card on file", "HR", "DOC_PAN", true, 0),
        t("photo", "Passport photo on file", "HR", "DOC_PHOTO", true, 0),
        t("bankdoc", "Bank passbook / cancelled cheque on file", "HR", "DOC_BANK", true, 0),
        t("policies", "Joining policies signed", "Employee", "POLICIES", true, 0),
        t("site", "Posted to a site", "HR", "SITE", true, 0),
        t("salary", "Salary structure set", "Payroll", "SALARY", true, 0),
        t("manager", "Reporting manager set", "HR", "MANAGER", false, 1),
        t("kit", "Uniform and safety kit issued", "Stores", "KIT", false, 0),
        t("idcard", "ID card issued", "HR", null, false, 3),
        t("briefing", "Site and safety briefing done", "Site manager", null, false, 1),
        t("training", "Safety course assigned", "HR", "LEARNING", false, 3),
        t("uan", "PF registration — UAN filled", "Payroll", "UAN", false, 7),
        t("esic", "ESIC registration — number filled", "Payroll", "ESIC", false, 7),
        t("letter", "Appointment letter issued", "HR", "LETTER", false, 15),
        t("login", "Employee can log in", "HR", "LOGIN", false, 1),
    ],
    override: "approvers",
    blockDuplicates: true,
    oldJoiningDays: 30,
    stuckAfterDays: 3,
    followUpDays: 30,
}

const ids = (v: unknown, max = 100) => Array.isArray(v) ? Array.from(new Set(v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map(x => x.trim().slice(0, 80)))).slice(0, max) : []
const int = (v: unknown, d: number, lo: number, hi: number) => { const n = Math.round(Number(v)); return v !== null && v !== "" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d }

export function sanitizeChecklist(v: any): ChecklistSettings {
    const d = DEFAULT_CHECKLIST
    const tasks: CheckTask[] = Array.isArray(v?.tasks)
        ? v.tasks.slice(0, 60).flatMap((x: any): CheckTask[] => {
            const title = String(x?.title ?? "").trim().slice(0, 120)
            if (!title) return []
            return [{
                id: typeof x.id === "string" && /^[\w-]{2,40}$/.test(x.id) ? x.id : `t${Math.random().toString(36).slice(2, 9)}`,
                title, owner: (OWNERS as readonly string[]).includes(x.owner) ? x.owner : "HR",
                auto: x.auto && x.auto in AUTO_CHECKS ? x.auto : null,
                beforeApproval: x.beforeApproval === true, dueDays: int(x.dueDays, 0, -60, 365),
                employmentTypes: ids(x.employmentTypes), siteIds: ids(x.siteIds, 300), designations: ids(x.designations),
            }]
        })
        : d.tasks
    return {
        tasks,
        override: v?.override === "admins" || v?.override === "none" ? v.override : "approvers",
        blockDuplicates: typeof v?.blockDuplicates === "boolean" ? v.blockDuplicates : d.blockDuplicates,
        oldJoiningDays: int(v?.oldJoiningDays, d.oldJoiningDays, 0, 3650),
        stuckAfterDays: int(v?.stuckAfterDays, d.stuckAfterDays, 1, 90),
        followUpDays: int(v?.followUpDays, d.followUpDays, 1, 365),
    }
}

/** Does this task apply to this person? */
export function applies(task: CheckTask, p: { employmentType: string; siteId: string | null; designation: string | null }): boolean {
    if (task.employmentTypes.length && !task.employmentTypes.includes(p.employmentType)) return false
    if (task.siteIds.length && (!p.siteId || !task.siteIds.includes(p.siteId))) return false
    if (task.designations.length) {
        const d = (p.designation ?? "").toLowerCase()
        if (!task.designations.some(x => d.includes(x.toLowerCase()))) return false
    }
    return true
}

export const STAGES = {
    DOCS: "Documents missing",
    POLICIES: "Policies to sign",
    SETUP: "Setup before approval",
    READY: "Ready to approve",
    ON_HOLD: "On hold / rejected",
    JOINED: "Joined — tasks open",
} as const
export type Stage = keyof typeof STAGES
