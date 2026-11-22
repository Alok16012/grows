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
}
export const DEFAULT_SETTINGS: DialerSettings = {
    targetCalls: 100, targetConnected: 50, targetTalkMin: 90, minConnectedSec: 10, idleAfterMin: 15,
    syncIncoming: true, syncUnknown: true, appUrl: "", workStart: "09:30", workEnd: "18:30", outcomes: DEFAULT_OUTCOMES,
}
const num = (v: unknown, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d }
const hhmm = (v: unknown, d: string) => typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? v : d
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
