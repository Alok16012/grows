// Call Dialer — shared constants and helpers (safe to import on the client).

export const TARGET_TYPES = {
    SALES_LEAD: "Sales lead",
    CANDIDATE: "Candidate",
    EMPLOYEE: "Employee",
    UNKNOWN: "Unknown number",
} as const
export type TargetType = keyof typeof TARGET_TYPES

export const STAGES = {
    NEW: { label: "New", color: "bg-gray-100 text-gray-700" },
    CONTACTED: { label: "Contacted", color: "bg-blue-50 text-blue-700" },
    INTERESTED: { label: "Interested", color: "bg-indigo-50 text-indigo-700" },
    MEETING: { label: "Meeting", color: "bg-violet-50 text-violet-700" },
    PROPOSAL: { label: "Proposal", color: "bg-amber-50 text-amber-800" },
    WON: { label: "Won", color: "bg-green-50 text-green-700" },
    LOST: { label: "Lost", color: "bg-red-50 text-red-700" },
} as const
export type Stage = keyof typeof STAGES
export const OPEN_STAGES: Stage[] = ["NEW", "CONTACTED", "INTERESTED", "MEETING", "PROPOSAL"]

/** What happened on the call — picked by the caller after the call. `positive` counts toward conversion. */
export type Outcome = { key: string; label: string; positive?: boolean; followUp?: boolean; stage?: Stage }
export const DEFAULT_OUTCOMES: Outcome[] = [
    { key: "INTERESTED", label: "Interested", positive: true, followUp: true, stage: "INTERESTED" },
    { key: "MEETING", label: "Meeting fixed", positive: true, followUp: true, stage: "MEETING" },
    { key: "CALLBACK", label: "Call back later", followUp: true, stage: "CONTACTED" },
    { key: "NOT_INTERESTED", label: "Not interested", stage: "LOST" },
    { key: "NO_ANSWER", label: "No answer / busy", followUp: true },
    { key: "SWITCHED_OFF", label: "Switched off / not reachable", followUp: true },
    { key: "WRONG_NUMBER", label: "Wrong number" },
    { key: "INFO_GIVEN", label: "Information given" },
    { key: "DONE", label: "Work done / resolved", positive: true },
]

/** Talking points (scripts) and WhatsApp messages, per kind of call. Placeholders: {name} {company} {me} {our_company}. */
export type TextBlock = { key: string; title: string; for: "ALL" | TargetType; body: string }
export const DEFAULT_SCRIPTS: TextBlock[] = [
    { key: "SALES_INTRO", title: "Sales — first call", for: "SALES_LEAD", body: `Namaste {name}, this is {me} from {our_company}.
1. We provide manpower, security and inspection services to manufacturing companies.
2. Ask: How do you manage manpower / quality inspection today? Any shortage or attrition issues?
3. Ask: How many people, which shifts, from when?
4. Offer: a short visit or a quote by WhatsApp / email.
5. Fix the next step: meeting date or call-back time.` },
    { key: "SALES_FOLLOWUP", title: "Sales — follow-up", for: "SALES_LEAD", body: `Namaste {name}, {me} from {our_company} — following up on our last talk.
1. Did you get a chance to look at our proposal / brochure?
2. Any questions on rates, shifts or start date?
3. Ask for the decision maker and timeline.
4. Fix the next step.` },
    { key: "CANDIDATE_SCREEN", title: "Candidate screening", for: "CANDIDATE", body: `Namaste {name}, this is {me} from {our_company} about the job you applied for.
1. Confirm: current location, experience, current / expected salary.
2. Confirm: notice period / can join from when?
3. Explain: job role, site location, shift, salary, PF / ESIC.
4. If interested: fix interview date and time, ask to bring Aadhaar, PAN, bank passbook, photos.` },
    { key: "EMPLOYEE_HR", title: "Employee — HR call", for: "EMPLOYEE", body: `Namaste {name}, this is {me} from HR, {our_company}.
1. Reason for the call (attendance / documents / salary / joining).
2. Listen to the issue and note it.
3. Tell them the next step and by when.` },
]
export const DEFAULT_WA: TextBlock[] = [
    { key: "SALES_THANKS", title: "Thanks + brochure", for: "SALES_LEAD", body: "Namaste {name}, thank you for your time on the call. I am {me} from {our_company}. As discussed, sharing our details — please let me know a convenient time to meet. 🙏" },
    { key: "SALES_NOANSWER", title: "Tried to call", for: "SALES_LEAD", body: "Namaste {name}, this is {me} from {our_company}. I tried calling you regarding manpower / inspection services. Please let me know a good time to talk. 🙏" },
    { key: "CANDIDATE_INTERVIEW", title: "Interview details", for: "CANDIDATE", body: "Namaste {name}, this is {me} from {our_company}. As discussed, please come for the interview on ____ at ____. Bring Aadhaar, PAN, bank passbook and 2 photos. Location: ____" },
    { key: "CANDIDATE_NOANSWER", title: "Tried to call", for: "CANDIDATE", body: "Namaste {name}, this is {me} from {our_company} about your job application. I tried calling you — please call back or reply here when free." },
    { key: "EMPLOYEE_NOTE", title: "HR message", for: "EMPLOYEE", body: "Namaste {name}, this is {me} from HR, {our_company}. " },
]
/** Fills {name} {company} {me} {our_company}. A "Contact (Company)" display name is split into the two. */
export function fillText(body: string, v: { name?: string | null; me?: string | null; ourCompany?: string }) {
    const m = /^(.*?)\s*\((.+)\)\s*$/.exec(v.name ?? "")
    const name = (m ? m[1] : v.name ?? "").trim(), company = (m ? m[2] : "").trim()
    return body.replace(/\{name\}/g, name || "Sir/Madam").replace(/\{company\}/g, company).replace(/\{me\}/g, v.me ?? "").replace(/\{our_company\}/g, v.ourCompany ?? "")
}
export const forTarget = (list: TextBlock[], t?: string | null) => list.filter(x => x.for === "ALL" || x.for === t)

export type DialerSettings = {
    /** daily targets per caller */
    targetCalls: number
    targetConnected: number
    targetTalkMin: number
    /** a call shorter than this many seconds does not count as connected */
    minConnectedSec: number
    /** gap between calls (minutes) shown as idle in the live view */
    idleAfterMin: number
    /** sync incoming calls too (outgoing are always synced) */
    syncIncoming: boolean
    /** sync calls to numbers not in the ERP (shown as Unknown number) */
    syncUnknown: boolean
    /** where telecallers download the Growus Dialer APK (shown on the My phone tab) */
    appUrl: string
    workStart: string
    workEnd: string
    outcomes: Outcome[]
    scripts: TextBlock[]
    waTemplates: TextBlock[]
    /** seconds before auto-dial calls the next number */
    autoDialGapSec: number
}
export const DEFAULT_SETTINGS: DialerSettings = {
    targetCalls: 100, targetConnected: 50, targetTalkMin: 90, minConnectedSec: 10, idleAfterMin: 15,
    syncIncoming: true, syncUnknown: true, appUrl: "", workStart: "09:30", workEnd: "18:30", outcomes: DEFAULT_OUTCOMES,
    scripts: DEFAULT_SCRIPTS, waTemplates: DEFAULT_WA, autoDialGapSec: 5,
}
const num = (v: unknown, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d }
const hhmm = (v: unknown, d: string) => typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? v : d
function blocks(v: unknown, d: TextBlock[]): TextBlock[] {
    if (!Array.isArray(v)) return d
    return v.filter((b: any) => b && typeof b.title === "string" && b.title.trim() && typeof b.body === "string").slice(0, 30).map((b: any, i: number): TextBlock => ({
        key: String(b.key || b.title).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || `T${i}`,
        title: b.title.trim().slice(0, 60), body: b.body.slice(0, 3000),
        for: ["ALL", "SALES_LEAD", "CANDIDATE", "EMPLOYEE"].includes(b.for) ? b.for : "ALL",
    }))
}
export function sanitizeSettings(v: any): DialerSettings {
    const d = DEFAULT_SETTINGS
    const outs = Array.isArray(v?.outcomes) ? v.outcomes.filter((o: any) => o && typeof o.label === "string" && o.label.trim()).slice(0, 30).map((o: any): Outcome => ({
        key: String(o.key || o.label).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "OTHER",
        label: String(o.label).trim().slice(0, 60), positive: !!o.positive, followUp: !!o.followUp,
        stage: o.stage && o.stage in STAGES ? o.stage : undefined,
    })) : null
    return {
        targetCalls: num(v?.targetCalls, d.targetCalls, 0, 1000), targetConnected: num(v?.targetConnected, d.targetConnected, 0, 1000),
        targetTalkMin: num(v?.targetTalkMin, d.targetTalkMin, 0, 1000), minConnectedSec: num(v?.minConnectedSec, d.minConnectedSec, 0, 120),
        idleAfterMin: num(v?.idleAfterMin, d.idleAfterMin, 1, 240),
        syncIncoming: typeof v?.syncIncoming === "boolean" ? v.syncIncoming : d.syncIncoming,
        syncUnknown: typeof v?.syncUnknown === "boolean" ? v.syncUnknown : d.syncUnknown,
        appUrl: typeof v?.appUrl === "string" && /^https:\/\/\S+$/.test(v.appUrl.trim()) ? v.appUrl.trim().slice(0, 500) : "",
        workStart: hhmm(v?.workStart, d.workStart), workEnd: hhmm(v?.workEnd, d.workEnd),
        outcomes: outs && outs.length ? outs : d.outcomes,
        scripts: blocks(v?.scripts, d.scripts), waTemplates: blocks(v?.waTemplates, d.waTemplates),
        autoDialGapSec: num(v?.autoDialGapSec, d.autoDialGapSec, 2, 60),
    }
}

/** The last 10 digits — how one number is matched across "+91 98…", "098…", "98…". */
export function phoneKey(p: unknown): string {
    const d = String(p ?? "").replace(/\D/g, "")
    return d.length > 10 ? d.slice(-10) : d
}
/** A dialable number: keeps a leading + and digits. */
export function cleanPhone(p: unknown): string {
    const s = String(p ?? "").trim()
    return (s.startsWith("+") ? "+" : "") + s.replace(/\D/g, "")
}
export const fmtDur = (sec: number) => {
    const s = Math.max(0, Math.round(sec || 0)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
    return h ? `${h}h ${m}m` : m ? `${m}m ${String(r).padStart(2, "0")}s` : `${r}s`
}
