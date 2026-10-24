"use client"
import { createContext, useContext, useState } from "react"
import type React from "react"
import { toast } from "sonner"
import {
    X, Shirt, CreditCard, Wrench, Shield, Box, Smartphone, Car, Sofa, AlertTriangle, Loader2, Upload, Paperclip,
} from "lucide-react"
import { format } from "date-fns"

// ─── Workflow types (mirror the /api/assets/* contract) ──────────────────────

export type RequestStatus = "SUBMITTED" | "APPROVED" | "PARTIALLY_APPROVED" | "REJECTED" | "CANCELLED"
export type FulfilmentStatus = "NOT_ISSUED" | "PARTIALLY_ISSUED" | "FULFILLED"
export type RequestReason = "NEW_JOINING" | "REPLACEMENT" | "DAMAGED" | "ADDITIONAL" | "OTHER"
export type IssueStatus = "ACTIVE" | "RETURNED" | "REPLACED" | "LOST" | "DAMAGED" | "WRITTEN_OFF"

export type RequestItem = {
    id: string
    employee: {
        id: string; employeeId: string; firstName: string; lastName: string
        department: { name: string } | null; designation?: string | null; siteName?: string | null
    }
    asset: { id: string; assetCode: string; name: string; category: string; available: number }
    size?: string | null
    requestedQty: number
    approvedQty: number | null
    issuedQty: number
    remarks?: string | null
}

export type AssetRequest = {
    id: string
    requestNo: string
    requestType: "INDIVIDUAL" | "MULTIPLE"
    reason: RequestReason
    remarks?: string | null
    attachmentUrl?: string | null
    status: RequestStatus
    fulfilmentStatus: FulfilmentStatus
    createdAt: string
    requestedBy: { id: string; name: string }
    decidedBy: { id: string; name: string } | null
    decidedAt?: string | null
    decisionNote?: string | null
    items: RequestItem[]
}

export type AuditEntry = {
    action: string; userId?: string | null; reason?: string | null
    before?: unknown; after?: unknown; createdAt: string
    user?: { name?: string | null } | null
}

export type AssetIssue = {
    id: string
    issueNo: string
    quantity: number
    size?: string | null
    serialNo?: string | null
    status: IssueStatus
    returnedQty: number
    issuedAt: string
    acknowledgedAt?: string | null
    remarks?: string | null
    employee: { id: string; employeeId: string; firstName: string; lastName: string }
    asset: { id: string; assetCode: string; name: string; category: string }
    request: { id: string; requestNo: string } | null
    issuedBy: { id: string; name: string }
}

export type StockItem = {
    id: string; assetCode: string; name: string; category: string
    location?: string | null; size?: string | null
    quantity: number; available: number; issued: number
    reorderLevel?: number | null; trackSerial: boolean; low: boolean
}

/** Employee row as returned by GET /api/employees (only the bits we use). */
export type PickerEmployee = {
    id: string; employeeId: string; firstName: string; lastName: string
    designation?: string | null
    department?: { id?: string; name: string } | null
    deployments?: { site?: { id?: string; name: string } | null }[]
    photo?: string | null
}

/** Pre-fill for the Raise Request form (Replace flow). */
export type RequestPrefill = {
    employeeId: string; assetId: string; size?: string | null; quantity: number; reason: RequestReason
    employee?: { id: string; employeeId: string; firstName: string; lastName: string }
    remarks?: string
}

// ─── Labels / colours ─────────────────────────────────────────────────────────

export const REASON_LABEL: Record<RequestReason, string> = {
    NEW_JOINING: "New joining",
    REPLACEMENT: "Replacement",
    DAMAGED: "Damaged item",
    ADDITIONAL: "Additional requirement",
    OTHER: "Other",
}

type Tone = { label: string; bg: string; color: string }

export const REQUEST_STATUS: Record<RequestStatus, Tone> = {
    SUBMITTED: { label: "Pending", bg: "#fef3c7", color: "#b45309" },
    APPROVED: { label: "Approved", bg: "#dcfce7", color: "#15803d" },
    PARTIALLY_APPROVED: { label: "Partially approved", bg: "#e0f2fe", color: "#0369a1" },
    REJECTED: { label: "Rejected", bg: "#fef2f2", color: "#dc2626" },
    CANCELLED: { label: "Cancelled", bg: "#f3f4f6", color: "#6b7280" },
}

export const FULFILMENT_STATUS: Record<FulfilmentStatus, Tone> = {
    NOT_ISSUED: { label: "Not issued", bg: "#f3f4f6", color: "#6b7280" },
    PARTIALLY_ISSUED: { label: "Partially issued", bg: "#fef3c7", color: "#b45309" },
    FULFILLED: { label: "Fulfilled", bg: "#dcfce7", color: "#15803d" },
}

export const ISSUE_STATUS: Record<IssueStatus, Tone> = {
    ACTIVE: { label: "Active", bg: "#dcfce7", color: "#15803d" },
    RETURNED: { label: "Returned", bg: "#f3f4f6", color: "#6b7280" },
    REPLACED: { label: "Replaced", bg: "#e0f2fe", color: "#0369a1" },
    LOST: { label: "Lost", bg: "#fef2f2", color: "#dc2626" },
    DAMAGED: { label: "Damaged", bg: "#fff7ed", color: "#c2410c" },
    WRITTEN_OFF: { label: "Written off", bg: "#f3f4f6", color: "#374151" },
}

export function Pill({ tone, children }: { tone: Tone; children?: React.ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
            style={{ background: tone.bg, color: tone.color }}>
            {children ?? tone.label}
        </span>
    )
}

export const LOW_TONE: Tone = { label: "Low", bg: "#fef3c7", color: "#b45309" }

// ─── Categories (shared with the legacy asset modal) ─────────────────────────

export const CATEGORIES = ["All", "Uniform", "ID Card", "Tool", "Safety Equipment", "Electronics", "Vehicle", "Furniture", "Other"]

export const CATEGORY_COLOR: Record<string, { bg: string; color: string }> = {
    "Uniform": { bg: "#eff6ff", color: "#3b82f6" },
    "ID Card": { bg: "#fdf4ff", color: "#a855f7" },
    "Tool": { bg: "#fff7ed", color: "#f97316" },
    "Safety Equipment": { bg: "#fef2f2", color: "#ef4444" },
    "Electronics": { bg: "#ecfdf5", color: "#10b981" },
    "Vehicle": { bg: "#f0f9ff", color: "#0ea5e9" },
    "Furniture": { bg: "#fefce8", color: "#ca8a04" },
    "Other": { bg: "#f9fafb", color: "#6b7280" },
}

export function getCategoryIcon(category: string, size = 16) {
    switch (category) {
        case "Uniform": return <Shirt size={size} />
        case "ID Card": return <CreditCard size={size} />
        case "Tool": return <Wrench size={size} />
        case "Safety Equipment": return <Shield size={size} />
        case "Electronics": return <Smartphone size={size} />
        case "Vehicle": return <Car size={size} />
        case "Furniture": return <Sofa size={size} />
        default: return <Box size={size} />
    }
}

export function CategoryBadge({ category }: { category: string }) {
    const cfg = CATEGORY_COLOR[category] || CATEGORY_COLOR["Other"]
    return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap"
            style={{ background: cfg.bg, color: cfg.color }}>
            {getCategoryIcon(category, 11)}
            {category}
        </span>
    )
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function fmtDate(d?: string | null, pattern = "dd MMM yyyy") {
    if (!d) return "—"
    const dt = new Date(d)
    return isNaN(dt.getTime()) ? "—" : format(dt, pattern)
}

export function fullName(e?: { firstName?: string; lastName?: string } | null) {
    if (!e) return "—"
    return `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim() || "—"
}

/** "Ravi Kumar" or "Ravi Kumar +2" for a multi-employee request. */
export function employeesSummary(items: RequestItem[]) {
    const ids = Array.from(new Set(items.map(i => i.employee.id)))
    const first = items[0]?.employee
    if (!first) return "—"
    return ids.length > 1 ? `${fullName(first)} +${ids.length - 1}` : fullName(first)
}

export function assetsSummary(items: RequestItem[]) {
    const names = Array.from(new Set(items.map(i => i.asset.name)))
    if (names.length === 0) return "—"
    return names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0]
}

export function sumBy<T>(rows: T[], f: (r: T) => number | null | undefined) {
    return rows.reduce((s, r) => s + (f(r) ?? 0), 0)
}

/** Approved minus issued, never below zero. */
export function remainingOf(i: RequestItem) {
    return Math.max(0, (i.approvedQty ?? 0) - (i.issuedQty ?? 0))
}

export function newKey() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

export class ApiError extends Error {
    status: number
    constructor(status: number, message: string) { super(message); this.status = status }
}

export async function readError(res: Response) {
    const text = await res.text().catch(() => "")
    try {
        const j = JSON.parse(text)
        return String(j.error || j.message || text || `Request failed (${res.status})`)
    } catch {
        return text || `Request failed (${res.status})`
    }
}

/** fetch + JSON with a typed error that carries the HTTP status. */
export async function api<T = any>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const res = await fetch(url, init?.body !== undefined ? {
        method: init.method ?? "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(init.body),
    } : { method: init?.method ?? "GET" })
    if (!res.ok) throw new ApiError(res.status, await readError(res))
    if (res.status === 204) return undefined as T
    return res.json()
}

export function qs(params: Record<string, string | number | boolean | null | undefined>) {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null || v === "" || v === false) continue
        p.set(k, v === true ? "1" : String(v))
    }
    return p.toString()
}

// ─── Workflow availability (503 = migration not run) ─────────────────────────

type WorkflowCtx = { missing: boolean; reportMissing: () => void }
export const WorkflowContext = createContext<WorkflowCtx>({ missing: false, reportMissing: () => { } })

/** Returns a handler: 503 flips the page into "not set up" mode, anything else toasts. */
export function useApiError() {
    const { reportMissing } = useContext(WorkflowContext)
    return (e: unknown, fallback = "Something went wrong") => {
        if (e instanceof ApiError && e.status === 503) { reportMissing(); return }
        toast.error(e instanceof Error && e.message ? e.message : fallback)
    }
}

export function SetupNotice() {
    return (
        <div className="w-full flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div>
                <p className="font-semibold">Asset workflow isn&apos;t set up yet — ask an admin to run the asset migration</p>
                <p className="text-[12px] mt-0.5 opacity-90">Inventory and Issued Items keep working in the classic view until then.</p>
            </div>
        </div>
    )
}

// ─── Form bits ────────────────────────────────────────────────────────────────

export function inputCls(extra = "") {
    return `w-full px-3 py-2 text-[13px] border border-[var(--border)] rounded-xl bg-[var(--surface2)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text3)] disabled:opacity-60 ${extra}`
}

export function selectCls(extra = "") {
    return `w-full px-3 py-2 text-[13px] border border-[var(--border)] rounded-xl bg-[var(--surface2)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors ${extra}`
}

export const filterCls = "w-full sm:w-auto h-8 rounded-[8px] border border-[var(--border)] bg-white px-2 text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"

export function Label({ children }: { children: React.ReactNode }) {
    return <label className="block text-[11.5px] font-medium text-[var(--text2)] mb-1">{children}</label>
}

export const btnPrimary = "inline-flex items-center justify-center gap-2 px-4 py-2 text-[13px] font-semibold bg-[var(--accent)] text-white rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
export const btnGhost = "inline-flex items-center justify-center gap-2 px-4 py-2 text-[13px] border border-[var(--border)] rounded-xl hover:bg-[var(--surface2)] text-[var(--text2)] transition-colors disabled:opacity-60"
export const btnDanger = "inline-flex items-center justify-center gap-2 px-4 py-2 text-[13px] font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors disabled:opacity-60"
export const btnSmall = "inline-flex items-center gap-1 px-2.5 py-1.5 text-[11.5px] font-medium border border-[var(--border)] rounded-lg hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
export const btnSmallAccent = "inline-flex items-center gap-1 px-2.5 py-1.5 text-[11.5px] font-semibold bg-[var(--accent)]/10 text-[var(--accent)] rounded-lg hover:bg-[var(--accent)]/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"

export const thCls = "text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] whitespace-nowrap"
export const tdCls = "px-4 py-3 align-middle"

// ─── Modal & drawer shells ────────────────────────────────────────────────────

export function Modal({ children, onClose, title, subtitle, wide }: {
    children: React.ReactNode; onClose: () => void; title?: React.ReactNode; subtitle?: React.ReactNode; wide?: boolean
}) {
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.45)" }}
            onClick={e => { if (e.target === e.currentTarget) onClose() }}>
            <div className={`bg-[var(--surface)] rounded-2xl shadow-2xl border border-[var(--border)] w-full ${wide ? "max-w-2xl" : "max-w-lg"} max-h-[90vh] overflow-y-auto`}>
                {title !== undefined && (
                    <div className="p-5 border-b border-[var(--border)] flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h2 className="text-[16px] font-semibold text-[var(--text)]">{title}</h2>
                            {subtitle && <p className="text-[12px] text-[var(--text3)] mt-0.5">{subtitle}</p>}
                        </div>
                        <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-[var(--surface2)] rounded-lg transition-colors text-[var(--text3)]"><X size={18} /></button>
                    </div>
                )}
                {children}
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

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <div className={`bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden ${className}`}>{children}</div>
}

export function Loading() {
    return <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-[var(--accent)]" /></div>
}

export function Empty({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
    return (
        <div className="flex flex-col items-center py-14 text-[var(--text3)]">
            <div className="mb-3 opacity-40">{icon}</div>
            <p className="text-[14px] font-medium">{title}</p>
            {sub && <p className="text-[12px] mt-1">{sub}</p>}
        </div>
    )
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
    const pages = Math.max(1, Math.ceil(total / pageSize))
    if (total <= pageSize) return null
    return (
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-[var(--border)] text-[12px] text-[var(--text3)]">
            <span>{(page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} of {total}</span>
            <div className="flex items-center gap-1.5">
                <button className={btnSmall} disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</button>
                <span>Page {page} / {pages}</span>
                <button className={btnSmall} disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
            </div>
        </div>
    )
}

/** Small file picker that posts to /api/upload and hands back the URL. */
export function UploadField({ value, onChange, label = "Attachment" }: {
    value: string; onChange: (url: string) => void; label?: string
}) {
    const [uploading, setUploading] = useState(false)
    async function pick(file: File) {
        setUploading(true)
        try {
            const fd = new FormData()
            fd.append("file", file)
            const res = await fetch("/api/upload", { method: "POST", body: fd })
            const data = await res.json().catch(() => ({}))
            if (res.ok && data.url) { onChange(data.url); toast.success("File attached") }
            else toast.error(data.error || "Upload failed")
        } catch { toast.error("Upload error") }
        finally { setUploading(false) }
    }
    return (
        <div>
            <Label>{label}</Label>
            {value ? (
                <div className="flex items-center gap-2 text-[12.5px]">
                    <Paperclip size={13} className="text-[var(--accent)]" />
                    <a href={value} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline truncate">View file</a>
                    <button type="button" onClick={() => onChange("")} className="text-[var(--text3)] hover:text-red-500"><X size={13} /></button>
                </div>
            ) : (
                <label className={`${btnGhost} cursor-pointer !py-1.5 text-[12px]`}>
                    {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                    {uploading ? "Uploading…" : "Choose file"}
                    <input type="file" accept="image/*,application/pdf" className="hidden" disabled={uploading}
                        onChange={e => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = "" }} />
                </label>
            )}
        </div>
    )
}

/** Compact "label: value" tile used in drawers / issue modal. */
export function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "warn" | "ok" | "muted" }) {
    const color = tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-green-700" : "text-[var(--text)]"
    return (
        <div className="bg-[var(--surface2)] rounded-[10px] px-3 py-2 min-w-0">
            <p className="text-[10.5px] text-[var(--text3)] uppercase tracking-[0.4px] truncate">{label}</p>
            <p className={`text-[15px] font-bold tabular-nums ${color}`}>{value}</p>
        </div>
    )
}
