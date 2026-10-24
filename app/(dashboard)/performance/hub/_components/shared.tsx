"use client"
// Performance Hub — shared types, HTTP helper, formula mirror and UI bits.
//
// Everything here codes against the /api/perf-hub contract. When the hub's
// tables haven't been created the API answers 503: pages then swap their body
// for <SetupNotice/> (see useHub + HubShell).
import { useCallback, useState } from "react"
import type React from "react"
import { toast } from "sonner"
import { X, Loader2, AlertTriangle, Upload, Paperclip } from "lucide-react"
import { format } from "date-fns"

// ─── Contract types ──────────────────────────────────────────────────────────

export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY"
export type ValueType = "COUNT" | "PERCENT" | "NUMBER" | "CURRENCY" | "YESNO"
export type Direction = "HIGHER" | "LOWER"
export type Rollup = "AVG" | "SUM" | "LAST" | "MIN" | "MAX"
export type SourceType = "MANUAL" | "REGISTER" | "SYSTEM"
export type Aggregate = "SUM" | "AVG" | "COUNT" | "LAST" | "MAX" | "MIN"
export type Rag = "GREEN" | "AMBER" | "RED"
export type TemplateStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED"
export type ReportStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "RETURNED"

export type KPI = {
    id: string; kraId: string; name: string; code: string | null
    frequency: Frequency; measurable: string | null; valueType: ValueType; direction: Direction
    target: number | string | null; targetLabel: string | null; weightage: number; rollup: Rollup
    greenAt: number; amberAt: number; evidenceRequired: boolean
    sourceType: SourceType; registerId: string | null; registerMode: "SINGLE" | "RATIO" | null
    valueField: string | null; numeratorField: string | null; denominatorField: string | null
    aggregate: Aggregate | null; systemMetric: string | null; sortOrder: number
}

export type KRA = { id: string; title: string; weight: number; sortOrder: number; kpis: KPI[] }

export type TemplateSummary = {
    id: string; name: string; roleLabel: string | null; version: number; status: TemplateStatus
    familyId: string; publishedAt: string | null; kraCount: number; kpiCount: number
    weightTotal: number; assignedCount: number
}

export type Template = {
    id: string; name: string; roleLabel: string | null; version: number; status: TemplateStatus
    familyId: string; kras: KRA[]
}

export type RegisterField = {
    key: string; label: string; type: "number" | "text" | "date" | "select" | "yesno"
    options?: string[]; required?: boolean
}

export type Register = {
    id: string; name: string; code: string; frequency: Frequency; description: string | null
    fields: RegisterField[]; isActive: boolean; entryCount: number
}

export type EmpLite = { id: string; employeeId: string; firstName: string; lastName: string; designation?: string | null }

export type RegisterEntry = {
    id: string; date: string; values: Record<string, unknown>; employee: EmpLite; createdAt: string
}

export type ReportRow = {
    id: string; frequency: Frequency; periodStart: string; periodEnd: string; status: ReportStatus
    score: number | null; submittedAt: string | null; employee: EmpLite
    template: { id: string; name: string; version: number }
    kpiTotal: number; kpiWithValues: number; redCount: number
}

export type KpiValue = {
    actual: number | null; isAuto: boolean; achievementPct: number | null; rag: Rag | null
    remark: string | null; evidenceUrl: string | null
}

export type ReportDetail = {
    id: string; frequency: Frequency; periodStart: string; periodEnd: string; status: ReportStatus
    score: number | null; decisionNote: string | null
    employee: EmpLite; template: { id: string; name: string; version: number }
    kras: { id: string; title: string; weight: number; kpis: (KPI & { value: KpiValue | null })[] }[]
    activity: { action: string; user: { name: string | null } | null; note: string | null; createdAt: string }[]
    canEdit: boolean; canSubmit: boolean; canReview: boolean
}

export type ScoreRow = {
    employee: EmpLite; roleLabel: string | null; kras: { title: string; pct: number | null }[]
    overall: number | null; grade: string | null; compliance: number | null; red: number; pending: number
}

export type Scorecards = {
    month: string
    summary: { employees: number; avgScore: number | null; avgCompliance: number | null; pendingReview: number; redKpis: number; below70: number }
    rows: ScoreRow[]
}

export type EmployeeScorecard = {
    kras: {
        title: string; weight: number; pct: number | null
        kpis: { name: string; target: number | string | null; targetLabel: string | null; rollup: Rollup; value: number | null; achievementPct: number | null; rag: Rag | null; periodValues: unknown }[]
    }[]
    overall: number | null; grade: string | null; compliance: number | null
}

// ─── Labels ──────────────────────────────────────────────────────────────────

export const FREQ_LABEL: Record<Frequency, string> = { DAILY: "Daily", WEEKLY: "Weekly", MONTHLY: "Monthly" }
export const FREQ_SHORT: Record<Frequency, string> = { DAILY: "D", WEEKLY: "W", MONTHLY: "M" }

type Tone = { label: string; bg: string; color: string }

export const TEMPLATE_STATUS: Record<TemplateStatus, Tone> = {
    DRAFT: { label: "Draft", bg: "#f3f4f6", color: "#4b5563" },
    PUBLISHED: { label: "Published", bg: "#dcfce7", color: "#15803d" },
    ARCHIVED: { label: "Archived", bg: "#f3f4f6", color: "#9ca3af" },
}

export const REPORT_STATUS: Record<ReportStatus, Tone> = {
    DRAFT: { label: "Draft", bg: "#f3f4f6", color: "#4b5563" },
    SUBMITTED: { label: "Submitted", bg: "#fef3c7", color: "#b45309" },
    APPROVED: { label: "Approved", bg: "#dcfce7", color: "#15803d" },
    RETURNED: { label: "Returned", bg: "#fef2f2", color: "#dc2626" },
}

export const SOURCE_TONE: Record<SourceType, Tone> = {
    MANUAL: { label: "Manual", bg: "#f3f4f6", color: "#4b5563" },
    REGISTER: { label: "Register", bg: "#e8effe", color: "#0847c7" },
    SYSTEM: { label: "System", bg: "#f3e8ff", color: "#7e22ce" },
}

export const RAG_COLOR: Record<Rag, string> = { GREEN: "#16a34a", AMBER: "#d97706", RED: "#dc2626" }

/** Colour for an achievement / score %: ≥90 green, ≥70 amber, else red. */
export function pctColor(p: number | null | undefined, green = 90, amber = 70) {
    if (p === null || p === undefined || isNaN(p)) return "var(--text3)"
    return p >= green ? RAG_COLOR.GREEN : p >= amber ? RAG_COLOR.AMBER : RAG_COLOR.RED
}

/** A distinct colour per KRA (weight bar, card accents). */
export const KRA_COLORS = ["#0b5cff", "#16a34a", "#f5a623", "#9b4dff", "#0ea5e9", "#f43f5e", "#14b8a6", "#64748b"]

// ─── Formula mirror (keep in step with the server) ──────────────────────────

export function toNum(v: unknown): number | null {
    if (v === null || v === undefined || v === "") return null
    const n = typeof v === "number" ? v : Number(v)
    return isNaN(n) ? null : n
}

export function achievementOf(kpi: Pick<KPI, "valueType" | "direction" | "target">, actual: number | null): number | null {
    if (actual === null) return null
    if (kpi.valueType === "YESNO") return actual >= 1 ? 100 : 0
    const t = toNum(kpi.target) ?? 0
    if (kpi.direction === "LOWER") return t > 0 ? (actual <= t ? 100 : Math.max(0, (t / actual) * 100)) : (actual <= 0 ? 100 : 0)
    return t > 0 ? (actual / t) * 100 : (actual > 0 ? 100 : 0)
}

export function ragOf(kpi: Pick<KPI, "greenAt" | "amberAt">, ach: number | null): Rag | null {
    if (ach === null) return null
    if (ach >= (kpi.greenAt ?? 90)) return "GREEN"
    if (ach >= (kpi.amberAt ?? 70)) return "AMBER"
    return "RED"
}

/** Σ min(ach,100)·w / Σw over KPIs that have a value; null when none do. */
export function scoreOf(items: { ach: number | null; weight: number }[]): number | null {
    let num = 0, den = 0
    for (const i of items) {
        if (i.ach === null) continue
        num += Math.min(i.ach, 100) * (i.weight || 0)
        den += i.weight || 0
    }
    return den > 0 ? num / den : null
}

export function fmtPct(p: number | null | undefined, digits = 0) {
    if (p === null || p === undefined || isNaN(p)) return "—"
    return `${p.toFixed(digits)}%`
}

export function fmtNum(n: number | null | undefined) {
    if (n === null || n === undefined || isNaN(n)) return "—"
    return Number.isInteger(n) ? n.toLocaleString("en-IN") : n.toLocaleString("en-IN", { maximumFractionDigits: 2 })
}

export function fmtDate(d?: string | null, pattern = "dd MMM yyyy") {
    if (!d) return "—"
    const dt = new Date(d)
    return isNaN(dt.getTime()) ? "—" : format(dt, pattern)
}

export function isoDay(d?: string | Date | null) {
    if (!d) return ""
    const dt = typeof d === "string" ? new Date(d) : d
    return isNaN(dt.getTime()) ? "" : format(dt, "yyyy-MM-dd")
}

export function fullName(e?: { firstName?: string; lastName?: string } | null) {
    if (!e) return "—"
    return `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim() || "—"
}

export function periodLabel(r: { frequency: Frequency; periodStart: string; periodEnd: string }) {
    if (r.frequency === "DAILY") return isoDay(r.periodStart)
    if (r.frequency === "MONTHLY") return fmtDate(r.periodStart, "MMM yyyy")
    return `${isoDay(r.periodStart)} → ${isoDay(r.periodEnd)}`
}

export function slugKey(label: string) {
    return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40)
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

export const HUB = "/api/perf-hub"

export class ApiError extends Error {
    status: number
    constructor(status: number, message: string) { super(message); this.status = status }
}

async function readError(res: Response) {
    const text = await res.text().catch(() => "")
    try {
        const j = JSON.parse(text)
        return String(j.error || j.message || text || `Request failed (${res.status})`)
    } catch {
        // A non-JSON body is an HTML error page (e.g. a 404 before the API exists): don't toast markup.
        return text && !/^\s*</.test(text) && text.length < 300 ? text : `Request failed (${res.status})`
    }
}

/** fetch + JSON with a typed error carrying the HTTP status. `url` is relative to /api/perf-hub unless it starts with /api. */
export async function api<T = any>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const full = url.startsWith("/api") ? url : `${HUB}${url}`
    const res = await fetch(full, init?.body !== undefined ? {
        method: init.method ?? "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(init.body),
    } : { method: init?.method ?? "GET" })
    if (!res.ok) throw new ApiError(res.status, await readError(res))
    if (res.status === 204) return undefined as T
    const txt = await res.text()
    return (txt ? JSON.parse(txt) : undefined) as T
}

export function qs(params: Record<string, string | number | boolean | null | undefined>) {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null || v === "" || v === false) continue
        p.set(k, v === true ? "1" : String(v))
    }
    const s = p.toString()
    return s ? `?${s}` : ""
}

/**
 * Page-level hub state: `fail(e)` flips the page into "not set up" mode on a
 * 503 and toasts anything else. Pass `missing` to <HubShell/>.
 */
export function useHub() {
    const [missing, setMissing] = useState(false)
    const fail = useCallback((e: unknown, fallback = "Something went wrong") => {
        if (e instanceof ApiError && e.status === 503) { setMissing(true); return }
        toast.error(e instanceof Error && e.message ? e.message : fallback)
    }, [])
    return { missing, fail }
}

export type Fail = (e: unknown, fallback?: string) => void

export function SetupNotice() {
    return (
        <div className="w-full flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div>
                <p className="font-semibold">Performance Hub isn&apos;t set up yet — ask an admin to run scripts/perf-hub.sql</p>
                <p className="text-[12px] mt-0.5 opacity-90">Performance reviews keep working as before until then.</p>
            </div>
        </div>
    )
}

// ─── Small UI ────────────────────────────────────────────────────────────────

export function Pill({ tone, children, className = "" }: { tone: Tone; children?: React.ReactNode; className?: string }) {
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${className}`}
            style={{ background: tone.bg, color: tone.color }}>
            {children ?? tone.label}
        </span>
    )
}

export function AutoPill() {
    return <span className="inline-flex items-center px-1.5 py-[1px] rounded-full text-[9.5px] font-bold tracking-[0.4px] bg-[var(--success-light)] text-[var(--success)]">AUTO</span>
}

export function PtsPill({ pts }: { pts: number }) {
    return <span className="inline-flex items-center px-1.5 py-[1px] rounded-full text-[10px] font-semibold bg-[var(--surface2)] border border-[var(--border)] text-[var(--text2)] whitespace-nowrap font-mono">{fmtNum(pts)} pts</span>
}

export function RagDot({ rag, size = 10 }: { rag: Rag | null | undefined; size?: number }) {
    return (
        <span title={rag ?? "No value"} className="inline-block rounded-full shrink-0"
            style={{ width: size, height: size, background: rag ? RAG_COLOR[rag] : "var(--border2)" }} />
    )
}

export function RagPill({ rag }: { rag: Rag | null | undefined }) {
    if (!rag) return <span className="text-[var(--text3)] text-[12px]">—</span>
    const bg = rag === "GREEN" ? "#dcfce7" : rag === "AMBER" ? "#fef3c7" : "#fef2f2"
    return <Pill tone={{ label: rag, bg, color: RAG_COLOR[rag] }}><RagDot rag={rag} size={6} />{rag[0] + rag.slice(1).toLowerCase()}</Pill>
}

export function PctText({ value, className = "" }: { value: number | null | undefined; className?: string }) {
    return <span className={`font-mono font-semibold tabular-nums ${className}`} style={{ color: pctColor(value ?? null) }}>{fmtPct(value ?? null)}</span>
}

export function ScoreRing({ score, size = 72 }: { score: number | null; size?: number }) {
    const r = (size - 8) / 2
    const c = 2 * Math.PI * r
    const pct = score === null ? 0 : Math.max(0, Math.min(100, score))
    const color = score === null ? "var(--border2)" : pctColor(score)
    return (
        <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface2)" strokeWidth={7} />
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round"
                    strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} style={{ transition: "stroke-dashoffset .3s ease" }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[17px] font-bold font-mono tabular-nums leading-none" style={{ color: score === null ? "var(--text3)" : color }}>
                    {score === null ? "—" : Math.round(score)}
                </span>
                <span className="text-[9px] text-[var(--text3)] uppercase tracking-[0.5px] mt-0.5">score</span>
            </div>
        </div>
    )
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <div className={`bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden ${className}`}>{children}</div>
}

export function CardHead({ title, sub, right, accent }: { title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; accent?: string }) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[var(--border)]">
            <div className="flex items-center gap-2.5 min-w-0">
                {accent && <span className="w-1 h-5 rounded-full shrink-0" style={{ background: accent }} />}
                <div className="min-w-0">
                    <h3 className="text-[14px] font-semibold text-[var(--text)] truncate">{title}</h3>
                    {sub && <p className="text-[11.5px] text-[var(--text3)]">{sub}</p>}
                </div>
            </div>
            {right && <div className="flex items-center gap-1.5 flex-wrap">{right}</div>}
        </div>
    )
}

export function Loading() {
    return <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-[var(--accent)]" /></div>
}

export function Empty({ icon, title, sub, action }: { icon: React.ReactNode; title: string; sub?: string; action?: React.ReactNode }) {
    return (
        <div className="flex flex-col items-center py-14 px-4 text-center text-[var(--text3)]">
            <div className="mb-3 opacity-40">{icon}</div>
            <p className="text-[14px] font-medium text-[var(--text2)]">{title}</p>
            {sub && <p className="text-[12px] mt-1 max-w-md">{sub}</p>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    )
}

export function inputCls(extra = "") {
    return `w-full px-3 py-2 text-[13px] border border-[var(--border)] rounded-xl bg-[var(--surface2)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text3)] disabled:opacity-60 ${extra}`
}

export const filterCls = "h-8 rounded-[8px] border border-[var(--border)] bg-white px-2 text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"

export function Label({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
    return (
        <label className="block text-[11.5px] font-medium text-[var(--text2)] mb-1">
            {children}
            {hint && <span className="block font-normal text-[10.5px] text-[var(--text3)] mt-0.5">{hint}</span>}
        </label>
    )
}

export const btnPrimary = "inline-flex items-center justify-center gap-2 px-4 py-2 text-[13px] font-semibold bg-[var(--accent)] text-white rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
export const btnGhost = "inline-flex items-center justify-center gap-2 px-4 py-2 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:bg-[var(--surface2)] text-[var(--text2)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
export const btnDanger = "inline-flex items-center justify-center gap-2 px-4 py-2 text-[13px] font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors disabled:opacity-60"
export const btnSuccess = "inline-flex items-center justify-center gap-2 px-4 py-2 text-[13px] font-semibold bg-[var(--success-strong)] text-white rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
export const btnSmall = "inline-flex items-center gap-1 px-2.5 py-1.5 text-[11.5px] font-medium bg-[var(--surface)] border border-[var(--border)] rounded-lg hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
export const btnSmallAccent = "inline-flex items-center gap-1 px-2.5 py-1.5 text-[11.5px] font-semibold bg-[var(--accent)]/10 text-[var(--accent)] rounded-lg hover:bg-[var(--accent)]/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
export const btnIcon = "inline-flex items-center justify-center w-7 h-7 rounded-lg text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors disabled:opacity-40"

export const thCls = "text-left px-3 py-2.5 text-[10.5px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] whitespace-nowrap bg-[var(--surface2)]"
export const tdCls = "px-3 py-2.5 align-middle"

export function Modal({ children, onClose, title, subtitle, wide, footer }: {
    children: React.ReactNode; onClose: () => void; title?: React.ReactNode; subtitle?: React.ReactNode; wide?: boolean; footer?: React.ReactNode
}) {
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.45)" }}
            onClick={e => { if (e.target === e.currentTarget) onClose() }}>
            <div className={`bg-[var(--surface)] rounded-2xl shadow-2xl border border-[var(--border)] w-full ${wide ? "max-w-2xl" : "max-w-lg"} max-h-[90vh] flex flex-col`}>
                {title !== undefined && (
                    <div className="p-5 border-b border-[var(--border)] flex items-start justify-between gap-3 shrink-0">
                        <div className="min-w-0">
                            <h2 className="text-[16px] font-semibold text-[var(--text)]">{title}</h2>
                            {subtitle && <p className="text-[12px] text-[var(--text3)] mt-0.5">{subtitle}</p>}
                        </div>
                        <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-[var(--surface2)] rounded-lg transition-colors text-[var(--text3)]"><X size={18} /></button>
                    </div>
                )}
                <div className="overflow-y-auto flex-1">{children}</div>
                {footer && <div className="shrink-0 px-5 py-3 border-t border-[var(--border)] flex justify-end gap-2">{footer}</div>}
            </div>
        </div>
    )
}

/** Right-hand drawer in the Expenses style. */
export function Drawer({ children, onClose, width = "max-w-md", header, footer }: {
    children: React.ReactNode; onClose: () => void; width?: string
    header: React.ReactNode; footer?: React.ReactNode
}) {
    return (
        <div className="fixed inset-0 z-40 flex">
            <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
            <div className={`w-full ${width} bg-white border-l border-[var(--border)] h-full flex flex-col shadow-xl`}>
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--border)] bg-white shrink-0">
                    <div className="min-w-0 flex-1">{header}</div>
                    <button onClick={onClose} aria-label="Close"
                        className="p-1.5 text-[var(--text3)] hover:text-[var(--text)] rounded-md hover:bg-[var(--surface2)] transition-colors shrink-0">
                        <X size={18} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto">{children}</div>
                {footer && <div className="shrink-0 border-t border-[var(--border)] bg-white px-5 py-3">{footer}</div>}
            </div>
        </div>
    )
}

/** Small file picker that posts to /api/upload and hands back the URL. */
export function UploadButton({ onUploaded, label = "Upload file" }: { onUploaded: (url: string) => void; label?: string }) {
    const [uploading, setUploading] = useState(false)
    async function pick(file: File) {
        setUploading(true)
        try {
            const fd = new FormData()
            fd.append("file", file)
            const res = await fetch("/api/upload", { method: "POST", body: fd })
            const data = await res.json().catch(() => ({}))
            if (res.ok && data.url) { onUploaded(data.url); toast.success("File attached") }
            else toast.error(data.error || "Upload failed")
        } catch { toast.error("Upload error") }
        finally { setUploading(false) }
    }
    return (
        <label className={`${btnGhost} cursor-pointer !py-1.5 text-[12px]`}>
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {uploading ? "Uploading…" : label}
            <input type="file" accept="image/*,application/pdf" className="hidden" disabled={uploading}
                onChange={e => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = "" }} />
        </label>
    )
}

export function EvidenceLink({ url }: { url: string }) {
    return (
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline text-[12px]">
            <Paperclip size={12} /> View
        </a>
    )
}
