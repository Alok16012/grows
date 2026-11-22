// Recruitment v2 — client-safe constants, settings and name tidying.

export const STAGES = [
    { key: "NEW_LEAD", label: "New" },
    { key: "CONTACTED", label: "Contacted" },
    { key: "INTERESTED", label: "Interested" },
    { key: "INTERVIEW_SCHEDULED", label: "Interview scheduled" },
    { key: "INTERVIEW_DONE", label: "Interview done" },
    { key: "SELECTED", label: "Selected" },
    { key: "OFFERED", label: "Offered" },
    { key: "JOINED", label: "Joined" },
    { key: "ON_SITE_JOINED", label: "Joined on site" },
    { key: "REJECTED", label: "Rejected" },
    { key: "DROPPED", label: "Dropped" },
] as const
export type Stage = typeof STAGES[number]["key"]
export const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGES.map(s => [s.key, s.label]))
export const CLOSED_STAGES = ["JOINED", "ON_SITE_JOINED", "REJECTED", "DROPPED"]
export const JOINED_STAGES = ["JOINED", "ON_SITE_JOINED"]
/** How far along a stage is — used to keep the most advanced record when merging duplicates. */
export const STAGE_RANK: Record<string, number> = { DROPPED: 0, REJECTED: 0, NEW_LEAD: 1, CONTACTED: 2, INTERESTED: 3, INTERVIEW_SCHEDULED: 4, INTERVIEW_DONE: 5, SELECTED: 6, OFFERED: 7, JOINED: 8, ON_SITE_JOINED: 9 }

export const REQUEST_STATUS: Record<string, string> = { PENDING: "Waiting for approval", APPROVED: "Open — hiring", REJECTED: "Rejected", FILLED: "Filled", CANCELLED: "Cancelled" }
export const REQUEST_REASONS: Record<string, string> = { NEW: "New position", REPLACEMENT: "Replacement", TEMPORARY: "Temporary / short-term" }
export const INTERVIEW_STATUS: Record<string, string> = { SCHEDULED: "Scheduled", DONE: "Done", NO_SHOW: "Did not come", CANCELLED: "Cancelled" }
export const INTERVIEW_RESULT: Record<string, string> = { PASS: "Pass", FAIL: "Fail", HOLD: "On hold" }

export type RecruitmentSettings = {
    /** Give new candidates without a recruiter to one automatically. */
    autoAssign: boolean
    /** Recruiters taking part in auto-assign (user ids). */
    recruiterIds: string[]
    /** round_robin = in turn; least_open = whoever has the fewest open candidates. */
    assignMode: "round_robin" | "least_open"
    /** A candidate left this many days in a stage counts as stuck (0 = never). */
    stuckDays: Record<string, number>
    /** Daily in-app note to the recruiter about stuck candidates and today's follow-ups/interviews. */
    dailyDigest: boolean
    /** Manpower requests must be approved before hiring starts. */
    requestNeedsApproval: boolean
    /** On approval, create a draft job opening from the request. */
    autoCreateJob: boolean
    /** Interview scorecard items, each scored 1–5. */
    scoreItems: string[]
    /** WhatsApp / copy text for an offer. {name} {designation} {site} {salary} {date} {link} {company} */
    offerMessage: string
}

export const DEFAULT_SETTINGS: RecruitmentSettings = {
    autoAssign: false,
    recruiterIds: [],
    assignMode: "round_robin",
    stuckDays: { NEW_LEAD: 2, CONTACTED: 3, INTERESTED: 3, INTERVIEW_SCHEDULED: 3, INTERVIEW_DONE: 2, SELECTED: 3, OFFERED: 7 },
    dailyDigest: true,
    requestNeedsApproval: true,
    autoCreateJob: true,
    scoreItems: ["Communication", "Technical skill", "Attitude", "Experience fit"],
    offerMessage: "Hello {name}, congratulations! You are selected for {designation}{site} at {company}. Salary: ₹{salary} per month. Joining date: {date}. Please fill your joining form here: {link}",
}

const num = (v: unknown, d: number, max = 365) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(max, Math.round(n))) : d }
export function sanitizeSettings(v: any): RecruitmentSettings {
    const d = DEFAULT_SETTINGS
    const stuck: Record<string, number> = {}
    for (const k of Object.keys(d.stuckDays)) stuck[k] = num(v?.stuckDays?.[k], d.stuckDays[k])
    const items = Array.isArray(v?.scoreItems) ? v.scoreItems.map((x: unknown) => String(x).trim().slice(0, 40)).filter(Boolean).slice(0, 8) : d.scoreItems
    return {
        autoAssign: typeof v?.autoAssign === "boolean" ? v.autoAssign : d.autoAssign,
        recruiterIds: Array.isArray(v?.recruiterIds) ? v.recruiterIds.filter((x: unknown) => typeof x === "string").slice(0, 100) : d.recruiterIds,
        assignMode: v?.assignMode === "least_open" ? "least_open" : "round_robin",
        stuckDays: stuck,
        dailyDigest: typeof v?.dailyDigest === "boolean" ? v.dailyDigest : d.dailyDigest,
        requestNeedsApproval: typeof v?.requestNeedsApproval === "boolean" ? v.requestNeedsApproval : d.requestNeedsApproval,
        autoCreateJob: typeof v?.autoCreateJob === "boolean" ? v.autoCreateJob : d.autoCreateJob,
        scoreItems: items.length ? items : d.scoreItems,
        offerMessage: typeof v?.offerMessage === "string" && v.offerMessage.trim() ? v.offerMessage.slice(0, 1000) : d.offerMessage,
    }
}

/** "quality  inspector" → "Quality Inspector"; known spellings of sources merged. */
export function titleCase(s: string) {
    // Short all-capital words are abbreviations (QRE, CMM, HR) — keep them as typed.
    return s.trim().replace(/\s+/g, " ").split(" ").map(w => /^[A-Z0-9&.]{2,4}$/.test(w) ? w : w.toLowerCase().replace(/(^|[/(-])([a-z])/g, (_, a, b) => a + b.toUpperCase())).join(" ")
        .replace(/\b(Hr|Qa|Qc|Iti|Cnc|Vmc|Ppe|Mis|It|Cmm)\b/g, m => m.toUpperCase())
}
const SOURCE_ALIASES: Record<string, string> = { workindia: "WorkIndia", "work india": "WorkIndia", naukri: "Naukri", "naukri.com": "Naukri", indeed: "Indeed", linkedin: "LinkedIn", "walk in": "Walk-in", "walk-in": "Walk-in", walkin: "Walk-in", referral: "Referral", reference: "Referral", whatsapp: "WhatsApp", "whats app": "WhatsApp" }
export function canonicalSource(s: string) { const k = s.trim().toLowerCase(); return SOURCE_ALIASES[k] ?? s.trim() }

export function fillOffer(tpl: string, v: { name: string; designation: string; site?: string | null; salary?: number | null; date?: string | null; link: string; company: string }) {
    return tpl.replace(/\{name\}/g, v.name).replace(/\{designation\}/g, v.designation).replace(/\{site\}/g, v.site ? ` at ${v.site}` : "")
        .replace(/\{salary\}/g, v.salary ? Math.round(v.salary).toLocaleString("en-IN") : "—").replace(/\{date\}/g, v.date || "to be confirmed")
        .replace(/\{link\}/g, v.link).replace(/\{company\}/g, v.company)
}
