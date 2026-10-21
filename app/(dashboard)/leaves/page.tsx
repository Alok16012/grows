"use client"
import { useState, useEffect, useCallback, useMemo } from "react"
import { fetchAllEmployees } from "@/lib/fetch-all-employees"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    Plus, Search, Loader2, CheckCircle, XCircle, Clock, X, Calendar, CalendarOff,
    ChevronRight, ChevronLeft, User, Download, AlertTriangle, Info, Save, RotateCcw,
    Wallet, Users, Settings2, ListChecks,
} from "lucide-react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths } from "date-fns"
import { can } from "@/lib/can"
import { StatCard, statGridClass, type StatTone } from "@/components/StatCard"
import { OpenFromQuery } from "@/components/OpenFromQuery"
import type { LeavePolicy, LeaveTypeRule, LeaveBalance } from "@/lib/leave-policy"

// ─── Types ────────────────────────────────────────────────────────────────────

type Leave = {
    id: string
    employeeId: string
    type: string
    startDate: string
    endDate: string
    days: number
    reason?: string
    status: string
    approvedBy?: string
    approvedAt?: string
    rejectedAt?: string
    rejectionReason?: string
    createdAt: string
    employee: {
        id: string
        firstName: string
        lastName: string
        employeeId: string
        designation?: string
        photo?: string
        branch?: { name: string } | null
    }
}

type Employee = { id: string; firstName: string; lastName: string; employeeId: string }
type BalanceRow = { employee: Employee & { designation?: string | null; dateOfJoining?: string | null }; balances: LeaveBalance[] }

type Preview = {
    ok: boolean
    error?: string
    type?: string
    days?: number
    calendarDays?: number
    weeklyOffs?: number
    holidays?: { date: string; name: string }[]
    balance?: LeaveBalance | null
    balanceAfter?: number | null
    warnings?: string[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
    PENDING:   { label: "Pending",   color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
    APPROVED:  { label: "Approved",  color: "#16a34a", bg: "#dcfce7", border: "#bbf7d0" },
    REJECTED:  { label: "Rejected",  color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
    CANCELLED: { label: "Cancelled", color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb" },
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

const inputCls = "w-full h-9 rounded-[8px] border border-[var(--border2)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
const fmtDays = (n: number | null | undefined) => n === null || n === undefined ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(1)
const dateOnly = (s: string) => new Date(s.slice(0, 10) + "T00:00:00")

// A leave's type colour comes from the policy, so a new type HR adds shows up
// in its own colour everywhere without touching this file.
function useTypeLookup(policy: LeavePolicy | null) {
    return useCallback((code: string): LeaveTypeRule | undefined => policy?.types.find(t => t.code === code), [policy])
}

async function readError(res: Response): Promise<string> {
    const text = await res.text()
    try { const j = JSON.parse(text); return j.error || j.message || text } catch { return text || `Request failed (${res.status})` }
}

// ─── Small pieces ─────────────────────────────────────────────────────────────

function Avatar({ firstName, lastName, photo, size = 36 }: {
    firstName: string; lastName: string; photo?: string; size?: number
}) {
    const [imgErr, setImgErr] = useState(false)
    const initials = `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase()
    const colors = ["#0b5cff", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444"]
    const bg = colors[((firstName?.charCodeAt(0) || 0) + (lastName?.charCodeAt(0) || 0)) % colors.length]
    if (photo && !imgErr) return <img src={photo} alt="" style={{ width: size, height: size }} className="rounded-full object-cover shrink-0" onError={() => setImgErr(true)} />
    return (
        <div style={{ width: size, height: size, background: bg, fontSize: size * 0.33 }}
            className="rounded-full flex items-center justify-center text-white font-semibold shrink-0 select-none">
            {initials}
        </div>
    )
}

function TypeBadge({ code, rule }: { code: string; rule?: LeaveTypeRule }) {
    const color = rule?.color || "#6b7280"
    return (
        <span title={rule?.name} style={{ color, background: `${color}14`, borderColor: `${color}40` }}
            className="px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap">
            {code}
        </span>
    )
}

function StatusBadge({ status }: { status: string }) {
    const s = STATUS_CONFIG[status]
    if (!s) return null
    return (
        <span style={{ color: s.color, background: s.bg, borderColor: s.border }}
            className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap">
            {s.label}
        </span>
    )
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <div className={`bg-[var(--surface)] border border-[var(--border)] rounded-[14px] ${className}`}>{children}</div>
}

function EmptyState({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
    return (
        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[14px] bg-[var(--surface)] border border-dashed border-[var(--border2)] text-center px-6">
            <div className="text-[var(--text3)] mb-2">{icon}</div>
            <p className="text-[14px] font-semibold text-[var(--text)]">{title}</p>
            <p className="text-[13px] text-[var(--text3)] mt-1">{sub}</p>
        </div>
    )
}

// ─── Balance cards (an employee's own view, and the apply form) ─────────────

function BalanceCards({ balances, compact = false }: { balances: LeaveBalance[]; compact?: boolean }) {
    if (!balances.length) return null
    return (
        <div className={`grid gap-3 ${compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-5"}`}>
            {balances.map(b => {
                const total = b.entitled === null ? null : b.entitled + b.carriedForward
                const pct = total ? Math.min(100, Math.max(0, ((b.used + b.pending) / total) * 100)) : 0
                return (
                    <Panel key={b.code} className="p-4">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[12px] font-semibold text-[var(--text2)] truncate">{b.name}</span>
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: b.color }} />
                        </div>
                        <p className="mt-2 text-[24px] font-bold tracking-[-0.5px] text-[var(--text)] leading-none">
                            {b.available === null ? "∞" : fmtDays(b.available)}
                            <span className="ml-1 text-[12px] font-medium text-[var(--text3)]">{b.available === null ? "no limit" : `of ${fmtDays(total)} left`}</span>
                        </p>
                        {total !== null && (
                            <div className="mt-3 h-1.5 rounded-full bg-[var(--surface2)] overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: b.color }} />
                            </div>
                        )}
                        <p className="mt-2 text-[11px] text-[var(--text3)]">
                            Used {fmtDays(b.used)}{b.pending > 0 ? ` · ${fmtDays(b.pending)} pending` : ""}{b.carriedForward > 0 ? ` · ${fmtDays(b.carriedForward)} carried` : ""}{!b.paid ? " · unpaid" : ""}
                        </p>
                    </Panel>
                )
            })}
        </div>
    )
}

// ─── Apply Leave Modal ────────────────────────────────────────────────────────

function ApplyLeaveModal({ open, onClose, onSaved, canManage, policy }: {
    open: boolean; onClose: () => void; onSaved: () => void; canManage: boolean; policy: LeavePolicy | null
}) {
    const [loading, setLoading] = useState(false)
    const [employees, setEmployees] = useState<Employee[]>([])
    const [empSearch, setEmpSearch] = useState("")
    const [balances, setBalances] = useState<LeaveBalance[]>([])
    const [preview, setPreview] = useState<Preview | null>(null)
    const [previewing, setPreviewing] = useState(false)
    const [confirmWarnings, setConfirmWarnings] = useState<string[] | null>(null)
    const activeTypes = useMemo(() => policy?.types.filter(t => t.active) ?? [], [policy])
    const [form, setForm] = useState({ employeeId: "", type: "CL", startDate: "", endDate: "", halfDay: false, reason: "" })

    useEffect(() => {
        if (!open) return
        // Only managers pick an employee. Everyone else applies for themselves,
        // and /api/employees would 403 for them anyway.
        if (canManage) {
            fetchAllEmployees({ status: "ACTIVE" }).then(r => setEmployees(r.employees as any)).catch(() => {})
        }
        setForm({ employeeId: "", type: activeTypes[0]?.code || "CL", startDate: "", endDate: "", halfDay: false, reason: "" })
        setPreview(null); setConfirmWarnings(null); setEmpSearch(""); setBalances([])
    }, [open, canManage, activeTypes])

    // Balances of whoever the leave is for.
    useEffect(() => {
        if (!open) return
        if (canManage && !form.employeeId) { setBalances([]); return }
        const qs = canManage ? `?employeeId=${form.employeeId}` : ""
        fetch(`/api/leaves/balance${qs}`).then(r => r.ok ? r.json() : null)
            .then(d => setBalances(d?.employees?.[0]?.balances ?? [])).catch(() => {})
    }, [open, canManage, form.employeeId])

    // Live check: the server runs the same rules it will apply on submit.
    useEffect(() => {
        if (!open || !form.startDate || !form.endDate || (canManage && !form.employeeId)) { setPreview(null); return }
        setPreviewing(true)
        const t = setTimeout(async () => {
            try {
                const res = await fetch("/api/leaves/preview", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...form, employeeId: canManage ? form.employeeId : undefined }),
                })
                setPreview(res.ok ? await res.json() : { ok: false, error: await readError(res) })
            } catch { setPreview(null) } finally { setPreviewing(false) }
        }, 300)
        return () => clearTimeout(t)
    }, [open, canManage, form.employeeId, form.type, form.startDate, form.endDate, form.halfDay]) // eslint-disable-line react-hooks/exhaustive-deps

    const rule = activeTypes.find(t => t.code === form.type)
    const sameDay = form.startDate && form.startDate === form.endDate
    useEffect(() => {
        if (form.halfDay && (!sameDay || !rule?.allowHalfDay)) setForm(f => ({ ...f, halfDay: false }))
    }, [sameDay, rule, form.halfDay])

    const submit = async (override = false) => {
        setLoading(true)
        try {
            const payload: Record<string, unknown> = { type: form.type, startDate: form.startDate, endDate: form.endDate, halfDay: form.halfDay, reason: form.reason, override }
            if (canManage) payload.employeeId = form.employeeId
            const res = await fetch("/api/leaves", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
            if (res.status === 409) {
                const text = await res.text()
                try {
                    const j = JSON.parse(text)
                    if (j.needsConfirm) { setConfirmWarnings(j.warnings); return }
                } catch { /* plain-text overlap error */ }
                throw new Error(text)
            }
            if (!res.ok) throw new Error(await readError(res))
            toast.success(canManage ? "Leave recorded" : "Leave applied — your approver has been notified")
            onSaved()
            onClose()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to apply leave")
        } finally {
            setLoading(false)
        }
    }

    if (!open) return null
    const filteredEmployees = empSearch
        ? employees.filter(e => `${e.firstName} ${e.lastName} ${e.employeeId}`.toLowerCase().includes(empSearch.toLowerCase()))
        : employees
    const balFor = (code: string) => balances.find(b => b.code === code)
    const blocked = !!preview && !preview.ok

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-[var(--surface)] rounded-[16px] border border-[var(--border)] w-full max-w-lg shadow-xl max-h-[92vh] flex flex-col">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
                    <div>
                        <h2 className="text-[15px] font-semibold text-[var(--text)]">{canManage ? "Record Leave" : "Apply for Leave"}</h2>
                        <p className="text-[12px] text-[var(--text3)]">Weekly offs and holidays in the range are not counted.</p>
                    </div>
                    <button onClick={onClose} aria-label="Close" className="p-1 text-[var(--text3)] hover:text-[var(--text)] rounded-md hover:bg-[var(--surface2)] transition-colors"><X size={18} /></button>
                </div>

                <form onSubmit={e => { e.preventDefault(); submit(false) }} className="p-5 space-y-4 overflow-y-auto">
                    {canManage && (
                        <div>
                            <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Employee *</label>
                            <input value={empSearch} onChange={e => setEmpSearch(e.target.value)} placeholder="Search name or ID…" className={`${inputCls} mb-1.5`} />
                            <select value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))} required className={inputCls}>
                                <option value="">Select employee ({filteredEmployees.length})</option>
                                {filteredEmployees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeId})</option>)}
                            </select>
                        </div>
                    )}

                    <div>
                        <label className="block text-[12px] font-medium text-[var(--text2)] mb-1.5">Leave type *</label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {activeTypes.map(t => {
                                const b = balFor(t.code)
                                const on = form.type === t.code
                                return (
                                    <button type="button" key={t.code} onClick={() => setForm(f => ({ ...f, type: t.code }))}
                                        className="text-left rounded-[10px] border px-3 py-2 transition-colors"
                                        style={{ borderColor: on ? t.color : "var(--border2)", background: on ? `${t.color}10` : "var(--surface)" }}>
                                        <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--text)]">
                                            <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />{t.code}
                                        </span>
                                        <span className="block text-[11px] text-[var(--text3)] truncate">
                                            {b ? (b.available === null ? t.name : `${fmtDays(b.available)} left`) : t.name}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">From *</label>
                            <input type="date" value={form.startDate} required className={inputCls}
                                onChange={e => setForm(f => ({ ...f, startDate: e.target.value, endDate: !f.endDate || f.endDate < e.target.value ? e.target.value : f.endDate }))} />
                        </div>
                        <div>
                            <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">To *</label>
                            <input type="date" value={form.endDate} min={form.startDate} required className={inputCls}
                                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
                        </div>
                    </div>

                    {rule?.allowHalfDay && sameDay && (
                        <label className="flex items-center gap-2 text-[13px] text-[var(--text2)] cursor-pointer select-none">
                            <input type="checkbox" checked={form.halfDay} onChange={e => setForm(f => ({ ...f, halfDay: e.target.checked }))} className="accent-[var(--accent)] w-4 h-4" />
                            Half day only
                        </label>
                    )}

                    {/* Live summary */}
                    {(previewing || preview) && (
                        <div className={`rounded-[10px] border px-3.5 py-3 text-[12.5px] ${blocked ? "bg-[var(--red-light)] border-[#fecaca] text-[var(--red)]" : "bg-[var(--surface2)] border-[var(--border)] text-[var(--text2)]"}`}>
                            {previewing && !preview ? (
                                <span className="inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Checking…</span>
                            ) : preview && !preview.ok ? (
                                <span className="flex gap-2"><AlertTriangle size={15} className="shrink-0 mt-px" />{preview.error}</span>
                            ) : preview && (
                                <div className="space-y-1">
                                    <p className="font-semibold text-[var(--text)]">
                                        {fmtDays(preview.days)} working day{preview.days === 1 ? "" : "s"} will be charged
                                        {preview.balanceAfter !== null && preview.balanceAfter !== undefined && <> · balance after: <span style={{ color: preview.balanceAfter < 0 ? "var(--red)" : undefined }}>{fmtDays(preview.balanceAfter)}</span></>}
                                    </p>
                                    {(preview.weeklyOffs! > 0 || preview.holidays!.length > 0) && (
                                        <p className="text-[var(--text3)]">
                                            {preview.calendarDays} calendar days
                                            {preview.weeklyOffs! > 0 && ` · ${preview.weeklyOffs} weekly off`}
                                            {preview.holidays!.length > 0 && ` · holiday: ${preview.holidays!.map(h => h.name).join(", ")}`}
                                        </p>
                                    )}
                                    {preview.warnings?.map(w => (
                                        <p key={w} className="flex gap-1.5 text-[var(--amber)]"><AlertTriangle size={13} className="shrink-0 mt-px" />{w}</p>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <div>
                        <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Reason</label>
                        <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                            className="w-full rounded-[8px] border border-[var(--border2)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors resize-none"
                            rows={3} placeholder="Reason for leave…" maxLength={500} />
                    </div>

                    {confirmWarnings && (
                        <div className="rounded-[10px] border border-[#fde68a] bg-[#fffbeb] p-3.5 space-y-2">
                            <p className="text-[12.5px] font-semibold text-[#92400e]">This goes past the leave policy:</p>
                            <ul className="text-[12.5px] text-[#92400e] list-disc pl-5">{confirmWarnings.map(w => <li key={w}>{w}</li>)}</ul>
                            <div className="flex gap-2 justify-end">
                                <button type="button" onClick={() => setConfirmWarnings(null)} className="px-3 py-1.5 text-[12.5px] rounded-[8px] text-[var(--text2)] hover:bg-white">Go back</button>
                                <button type="button" onClick={() => submit(true)} disabled={loading} className="px-3 py-1.5 text-[12.5px] font-semibold rounded-[8px] bg-[#d97706] text-white disabled:opacity-50">Record anyway</button>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-1">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-[var(--text2)] hover:text-[var(--text)] rounded-[8px] hover:bg-[var(--surface2)] transition-colors">Cancel</button>
                        <button type="submit" disabled={loading || blocked || !!confirmWarnings}
                            className="inline-flex items-center gap-2 px-5 py-2 bg-[var(--accent)] text-white rounded-[8px] text-[13px] font-semibold hover:opacity-90 disabled:opacity-50">
                            {loading && <Loader2 size={14} className="animate-spin" />}
                            {canManage ? "Record Leave" : "Apply"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// ─── Leave Detail Drawer ──────────────────────────────────────────────────────

function LeaveDrawer({ leave, onClose, onUpdated, isApprover, isOwnView, allLeaves, typeOf }: {
    leave: Leave | null
    onClose: () => void
    onUpdated: () => void
    isApprover: boolean
    isOwnView: boolean
    allLeaves: Leave[]
    typeOf: (c: string) => LeaveTypeRule | undefined
}) {
    const [loading, setLoading] = useState(false)
    const [rejectionReason, setRejectionReason] = useState("")
    const [showRejectForm, setShowRejectForm] = useState(false)
    const [balance, setBalance] = useState<LeaveBalance | null>(null)
    const [confirm, setConfirm] = useState<string[] | null>(null)

    useEffect(() => {
        setRejectionReason(""); setShowRejectForm(false); setBalance(null); setConfirm(null)
        if (!leave) return
        const qs = isApprover ? `?employeeId=${leave.employeeId}&asOf=${leave.startDate.slice(0, 10)}` : `?asOf=${leave.startDate.slice(0, 10)}`
        fetch(`/api/leaves/balance${qs}`).then(r => r.ok ? r.json() : null)
            .then(d => setBalance(d?.employees?.[0]?.balances?.find((b: LeaveBalance) => b.code === leave.type) ?? null))
            .catch(() => {})
    }, [leave, isApprover])

    const act = async (status: string, extra: Record<string, unknown> = {}) => {
        if (!leave) return
        setLoading(true)
        try {
            const res = await fetch(`/api/leaves/${leave.id}`, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status, ...extra }),
            })
            if (res.status === 409) {
                const text = await res.text()
                try { const j = JSON.parse(text); if (j.needsConfirm) { setConfirm(j.warnings); return } } catch { /* plain text */ }
                throw new Error(text)
            }
            if (!res.ok) throw new Error(await readError(res))
            toast.success(status === "APPROVED" ? "Leave approved" : status === "REJECTED" ? "Leave rejected" : "Leave cancelled")
            onUpdated()
            onClose()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Action failed")
        } finally {
            setLoading(false)
        }
    }

    // Who else is off on any of these dates — what an approver actually needs
    // to know before saying yes.
    const alsoOff = leave ? allLeaves.filter(l =>
        l.id !== leave.id && l.employeeId !== leave.employeeId &&
        (l.status === "APPROVED" || l.status === "PENDING") &&
        l.startDate.slice(0, 10) <= leave.endDate.slice(0, 10) && l.endDate.slice(0, 10) >= leave.startDate.slice(0, 10),
    ) : []
    const startsLater = leave ? dateOnly(leave.startDate) > new Date() : false
    const canWithdraw = !!leave && isOwnView && (leave.status === "PENDING" || (leave.status === "APPROVED" && startsLater))
    const rule = leave ? typeOf(leave.type) : undefined

    return (
        <>
            {leave && <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />}
            {/* Parked off-screen right inside a clipped, click-through layer:
                Android WebView counts an off-screen `fixed` element as page width,
                which made the whole panel scroll sideways in the mobile app. */}
            <div className="fixed inset-0 z-50 overflow-hidden pointer-events-none" aria-hidden={!leave}>
            <div className={`absolute top-0 right-0 h-full w-[420px] max-w-full pointer-events-auto bg-[var(--surface)] border-l border-[var(--border)] shadow-2xl transition-transform duration-300 flex flex-col ${leave ? "translate-x-0" : "translate-x-full"}`}>
                {leave && (
                    <>
                        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
                            <h2 className="text-[15px] font-semibold text-[var(--text)]">Leave Details</h2>
                            <button onClick={onClose} aria-label="Close" className="p-1 text-[var(--text3)] hover:text-[var(--text)] rounded-md hover:bg-[var(--surface2)]"><X size={18} /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 space-y-5">
                            <div className="flex items-center gap-3 p-4 bg-[var(--surface2)] rounded-[12px] border border-[var(--border)]">
                                <Avatar firstName={leave.employee.firstName} lastName={leave.employee.lastName} photo={leave.employee.photo} size={48} />
                                <div className="min-w-0">
                                    <p className="text-[14px] font-semibold text-[var(--text)] truncate">{leave.employee.firstName} {leave.employee.lastName}</p>
                                    <p className="text-[12px] text-[var(--text3)]">{leave.employee.employeeId} · {leave.employee.designation || "—"}</p>
                                    {leave.employee.branch?.name && <p className="text-[12px] text-[var(--text3)]">{leave.employee.branch.name}</p>}
                                </div>
                            </div>

                            <div className="space-y-3">
                                {[
                                    ["Leave Type", <span key="t" className="flex items-center gap-2"><TypeBadge code={leave.type} rule={rule} /><span className="text-[12px] text-[var(--text2)]">{rule?.name}</span></span>],
                                    ["Status", <StatusBadge key="s" status={leave.status} />],
                                    ["Dates", <span key="d" className="text-[13px] font-medium text-[var(--text)]">{format(dateOnly(leave.startDate), "EEE, dd MMM")} — {format(dateOnly(leave.endDate), "EEE, dd MMM yyyy")}</span>],
                                    ["Days Charged", <span key="n" className="text-[13px] font-semibold text-[var(--text)]">{leave.days === 0.5 ? "Half day" : `${fmtDays(leave.days)} day${leave.days !== 1 ? "s" : ""}`}</span>],
                                    ["Applied On", <span key="a" className="text-[13px] text-[var(--text2)]">{format(new Date(leave.createdAt), "dd MMM yyyy, h:mm a")}</span>],
                                ].map(([k, v]) => (
                                    <div key={k as string} className="flex items-center justify-between gap-3">
                                        <span className="text-[12px] text-[var(--text3)]">{k}</span>{v}
                                    </div>
                                ))}
                                {leave.reason && (
                                    <div className="pt-2 border-t border-[var(--border)]">
                                        <p className="text-[12px] text-[var(--text3)] mb-1">Reason</p>
                                        <p className="text-[13px] text-[var(--text2)]">&ldquo;{leave.reason}&rdquo;</p>
                                    </div>
                                )}
                            </div>

                            {balance && (
                                <div className="rounded-[12px] border border-[var(--border)] p-4">
                                    <p className="text-[12px] font-semibold text-[var(--text2)] mb-2">{balance.name} balance</p>
                                    <div className="grid grid-cols-4 gap-2 text-center">
                                        {[["Entitled", balance.entitled === null ? "∞" : fmtDays(balance.entitled + balance.carriedForward)], ["Used", fmtDays(balance.used)], ["Pending", fmtDays(balance.pending)], ["Left", balance.available === null ? "∞" : fmtDays(balance.available)]].map(([k, v]) => (
                                            <div key={k}>
                                                <p className="text-[16px] font-bold text-[var(--text)]" style={{ color: k === "Left" && Number(v) < 0 ? "var(--red)" : undefined }}>{v}</p>
                                                <p className="text-[10.5px] text-[var(--text3)] uppercase tracking-wide">{k}</p>
                                            </div>
                                        ))}
                                    </div>
                                    {leave.status === "PENDING" && <p className="mt-2 text-[11px] text-[var(--text3)]">&ldquo;Pending&rdquo; includes this request.</p>}
                                </div>
                            )}

                            {isApprover && (
                                <div>
                                    <p className="text-[12px] font-semibold text-[var(--text2)] mb-2 flex items-center gap-1.5"><Users size={13} /> Also off on these dates ({alsoOff.length})</p>
                                    {alsoOff.length === 0 ? (
                                        <p className="text-[12px] text-[var(--text3)]">Nobody else in this list.</p>
                                    ) : (
                                        <div className="space-y-1.5">
                                            {alsoOff.slice(0, 8).map(l => (
                                                <div key={l.id} className="flex items-center justify-between text-[12px]">
                                                    <span className="text-[var(--text)] truncate">{l.employee.firstName} {l.employee.lastName}</span>
                                                    <span className="text-[var(--text3)] shrink-0">{format(dateOnly(l.startDate), "dd MMM")}–{format(dateOnly(l.endDate), "dd MMM")} · {STATUS_CONFIG[l.status]?.label}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {leave.status === "APPROVED" && leave.approvedAt && (
                                <div className="p-3 bg-[var(--success-light)] border border-[var(--success-border)] rounded-[10px]">
                                    <p className="text-[12px] font-medium text-[var(--success-strong)]">Approved on {format(new Date(leave.approvedAt), "dd MMM yyyy")}</p>
                                </div>
                            )}
                            {leave.status === "REJECTED" && leave.rejectedAt && (
                                <div className="p-3 bg-[var(--red-light)] border border-[#fecaca] rounded-[10px]">
                                    <p className="text-[12px] font-medium text-[var(--red)]">Rejected on {format(new Date(leave.rejectedAt), "dd MMM yyyy")}</p>
                                    {leave.rejectionReason && <p className="text-[12px] text-[var(--red)] mt-1">{leave.rejectionReason}</p>}
                                </div>
                            )}

                            {confirm && (
                                <div className="rounded-[10px] border border-[#fde68a] bg-[#fffbeb] p-3.5 space-y-2">
                                    {confirm.map(w => <p key={w} className="text-[12.5px] text-[#92400e] flex gap-1.5"><AlertTriangle size={13} className="shrink-0 mt-px" />{w}</p>)}
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => setConfirm(null)} className="px-3 py-1.5 text-[12.5px] rounded-[8px] text-[var(--text2)] hover:bg-white">Back</button>
                                        <button onClick={() => act("APPROVED", { override: true })} disabled={loading} className="px-3 py-1.5 text-[12.5px] font-semibold rounded-[8px] bg-[#d97706] text-white disabled:opacity-50">Approve anyway</button>
                                    </div>
                                </div>
                            )}

                            {showRejectForm && (
                                <div className="space-y-2">
                                    <label className="block text-[12px] text-[var(--text2)]">Rejection reason *</label>
                                    <textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} autoFocus
                                        className="w-full rounded-[8px] border border-[var(--border2)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--red)] transition-colors resize-none"
                                        rows={3} placeholder="This is shown to the employee…" />
                                </div>
                            )}
                        </div>

                        {isApprover && leave.status === "PENDING" && !confirm && (
                            <div className="px-5 py-4 border-t border-[var(--border)] shrink-0">
                                {!showRejectForm ? (
                                    <div className="flex gap-2">
                                        <button onClick={() => setShowRejectForm(true)}
                                            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-[8px] border border-[#fecaca] bg-[var(--red-light)] text-[var(--red)] text-[13px] font-semibold hover:bg-[#fee2e2] transition-colors">
                                            <XCircle size={14} /> Reject
                                        </button>
                                        <button onClick={() => act("APPROVED")} disabled={loading}
                                            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-[8px] bg-[var(--accent)] text-white text-[13px] font-semibold hover:opacity-90 disabled:opacity-50">
                                            {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Approve
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex gap-2">
                                        <button onClick={() => setShowRejectForm(false)} className="flex-1 py-2.5 rounded-[8px] border border-[var(--border)] text-[13px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)]">Back</button>
                                        <button onClick={() => act("REJECTED", { rejectionReason })} disabled={loading || !rejectionReason.trim()}
                                            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-[8px] bg-[var(--red)] text-white text-[13px] font-semibold hover:bg-[#b91c1c] disabled:opacity-50">
                                            {loading && <Loader2 size={14} className="animate-spin" />} Confirm Reject
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                        {isApprover && leave.status === "APPROVED" && (
                            <div className="px-5 py-4 border-t border-[var(--border)] shrink-0">
                                <button onClick={() => act("CANCELLED")} disabled={loading}
                                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-[8px] border border-[var(--border2)] text-[13px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] disabled:opacity-50">
                                    {loading && <Loader2 size={14} className="animate-spin" />} Revoke approval (cancel leave)
                                </button>
                            </div>
                        )}
                        {!isApprover && canWithdraw && (
                            <div className="px-5 py-4 border-t border-[var(--border)] shrink-0">
                                <button onClick={() => act("CANCELLED")} disabled={loading}
                                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-[8px] border border-[var(--border2)] text-[13px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] disabled:opacity-50">
                                    {loading && <Loader2 size={14} className="animate-spin" />} {leave.status === "PENDING" ? "Withdraw request" : "Cancel this leave"}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
            </div>
        </>
    )
}

// ─── Calendar tab ─────────────────────────────────────────────────────────────

function LeaveCalendar({ typeOf, onOpen }: { typeOf: (c: string) => LeaveTypeRule | undefined; onOpen: (l: Leave) => void }) {
    const [month, setMonth] = useState(() => startOfMonth(new Date()))
    const [leaves, setLeaves] = useState<Leave[]>([])
    const [holidays, setHolidays] = useState<{ date: string; name: string }[]>([])
    const [loading, setLoading] = useState(true)
    const [showPending, setShowPending] = useState(true)

    useEffect(() => {
        setLoading(true)
        const m = format(month, "yyyy-MM")
        Promise.all([
            fetch(`/api/leaves?month=${m}`).then(r => r.ok ? r.json() : []),
            fetch(`/api/holidays?year=${month.getFullYear()}`).then(r => r.ok ? r.json() : []),
        ]).then(([l, h]) => {
            setLeaves(Array.isArray(l) ? l.filter((x: Leave) => x.status === "APPROVED" || x.status === "PENDING") : [])
            setHolidays(Array.isArray(h) ? h : [])
        }).catch(() => toast.error("Failed to load calendar")).finally(() => setLoading(false))
    }, [month])

    const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
    const lead = getDay(days[0])
    const shown = leaves.filter(l => showPending || l.status === "APPROVED")
    const onDay = (d: Date) => {
        const k = format(d, "yyyy-MM-dd")
        return shown.filter(l => l.startDate.slice(0, 10) <= k && l.endDate.slice(0, 10) >= k)
    }
    const holidayOn = (d: Date) => holidays.find(h => h.date.slice(0, 10) === format(d, "yyyy-MM-dd"))
    const todayKey = format(new Date(), "yyyy-MM-dd")
    const peak = Math.max(0, ...days.map(d => onDay(d).length))

    return (
        <Panel className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                    <button onClick={() => setMonth(m => addMonths(m, -1))} aria-label="Previous month" className="w-9 h-9 rounded-[9px] border border-[var(--border)] flex items-center justify-center text-[var(--text2)] hover:bg-[var(--surface2)]"><ChevronLeft size={16} /></button>
                    <h2 className="text-[16px] font-semibold text-[var(--text)] min-w-[150px] text-center">{format(month, "MMMM yyyy")}</h2>
                    <button onClick={() => setMonth(m => addMonths(m, 1))} aria-label="Next month" className="w-9 h-9 rounded-[9px] border border-[var(--border)] flex items-center justify-center text-[var(--text2)] hover:bg-[var(--surface2)]"><ChevronRight size={16} /></button>
                    <button onClick={() => setMonth(startOfMonth(new Date()))} className="h-9 px-3 rounded-[9px] text-[12.5px] font-medium text-[var(--accent)] hover:bg-[var(--accent-light)]">Today</button>
                </div>
                <div className="flex items-center gap-4 text-[12px] text-[var(--text2)]">
                    <span>{shown.length} leave{shown.length === 1 ? "" : "s"} · busiest day {peak} off</span>
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input type="checkbox" checked={showPending} onChange={e => setShowPending(e.target.checked)} className="accent-[var(--accent)]" /> Show pending
                    </label>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-16"><Loader2 size={26} className="animate-spin text-[var(--accent)]" /></div>
            ) : (
                <div className="overflow-x-auto">
                    <div className="grid grid-cols-7 gap-px bg-[var(--border)] rounded-[10px] overflow-hidden border border-[var(--border)] min-w-[640px]">
                        {WEEKDAYS.map(w => <div key={w} className="bg-[var(--surface2)] px-2 py-2 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide">{w}</div>)}
                        {Array.from({ length: lead }).map((_, i) => <div key={`b${i}`} className="bg-[var(--surface)] min-h-[96px]" />)}
                        {days.map(d => {
                            const list = onDay(d)
                            const hol = holidayOn(d)
                            const k = format(d, "yyyy-MM-dd")
                            const weekend = getDay(d) === 0
                            return (
                                <div key={k} className={`min-h-[96px] p-1.5 ${hol ? "bg-[#fff8eb]" : weekend ? "bg-[var(--surface2)]" : "bg-[var(--surface)]"}`}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className={`text-[12px] font-semibold w-6 h-6 flex items-center justify-center rounded-full ${k === todayKey ? "bg-[var(--accent)] text-white" : "text-[var(--text2)]"}`}>{format(d, "d")}</span>
                                        {list.length > 0 && <span className="text-[10.5px] font-semibold text-[var(--text3)]">{list.length} off</span>}
                                    </div>
                                    {hol && <p className="text-[10.5px] font-semibold text-[#b45309] truncate mb-1" title={hol.name}>🎉 {hol.name}</p>}
                                    <div className="space-y-0.5">
                                        {list.slice(0, 3).map(l => {
                                            const c = typeOf(l.type)?.color || "#6b7280"
                                            return (
                                                <button key={l.id} onClick={() => onOpen(l)} title={`${l.employee.firstName} ${l.employee.lastName} · ${l.type} · ${STATUS_CONFIG[l.status]?.label}`}
                                                    className="w-full text-left truncate rounded-[5px] px-1.5 py-0.5 text-[10.5px] font-medium"
                                                    style={{ color: c, background: l.status === "APPROVED" ? `${c}1f` : "transparent", border: `1px ${l.status === "APPROVED" ? "solid" : "dashed"} ${c}66` }}>
                                                    {l.employee.firstName} {l.employee.lastName?.[0] || ""}. · {l.type}
                                                </button>
                                            )
                                        })}
                                        {list.length > 3 && <p className="text-[10.5px] text-[var(--text3)] px-1">+{list.length - 3} more</p>}
                                    </div>
                                </div>
                            )
                        })}
                        {Array.from({ length: (7 - ((lead + days.length) % 7)) % 7 }).map((_, i) => <div key={`a${i}`} className="bg-[var(--surface)] min-h-[96px]" />)}
                    </div>
                </div>
            )}
            <p className="mt-3 text-[11.5px] text-[var(--text3)]">Solid = approved · dashed = awaiting approval. Click a name to open the request.</p>
        </Panel>
    )
}

// ─── Balances tab ─────────────────────────────────────────────────────────────

function BalancesTab({ policy }: { policy: LeavePolicy | null }) {
    const [rows, setRows] = useState<BalanceRow[]>([])
    const [year, setYear] = useState("")
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(1)
    const perPage = 50

    useEffect(() => {
        fetch("/api/leaves/balance?all=1").then(r => r.ok ? r.json() : Promise.reject())
            .then(d => { setRows(d.employees || []); setYear(d.year) })
            .catch(() => toast.error("Failed to load balances")).finally(() => setLoading(false))
    }, [])
    useEffect(() => setPage(1), [search])

    const types = policy?.types.filter(t => t.active && t.annualQuota !== null) ?? []
    const filtered = search
        ? rows.filter(r => `${r.employee.firstName} ${r.employee.lastName} ${r.employee.employeeId}`.toLowerCase().includes(search.toLowerCase()))
        : rows
    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
    const pageRows = filtered.slice((page - 1) * perPage, page * perPage)

    const exportCsv = () => {
        const head = ["Employee", "Emp ID", ...types.flatMap(t => [`${t.code} entitled`, `${t.code} used`, `${t.code} pending`, `${t.code} available`])]
        const lines = filtered.map(r => [
            `${r.employee.firstName} ${r.employee.lastName}`, r.employee.employeeId,
            ...types.flatMap(t => { const b = r.balances.find(x => x.code === t.code); return b ? [(b.entitled ?? 0) + b.carriedForward, b.used, b.pending, b.available ?? ""] : ["", "", "", ""] }),
        ])
        const csv = [head, ...lines].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
        const a = document.createElement("a")
        a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
        a.download = `leave_balances_${year}.csv`
        a.click()
    }

    if (loading) return <div className="flex justify-center py-16"><Loader2 size={26} className="animate-spin text-[var(--accent)]" /></div>

    return (
        <Panel className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
                <div>
                    <p className="text-[14px] font-semibold text-[var(--text)]">Leave balances · {year}</p>
                    <p className="text-[12px] text-[var(--text3)]">Available = entitlement + carried forward − used − pending. Joiners this year are pro-rated.</p>
                </div>
                <div className="relative ml-auto w-full sm:w-[260px]">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee…" className={`${inputCls} pl-9`} />
                </div>
                <button onClick={exportCsv} className="inline-flex items-center gap-2 h-9 px-3 rounded-[9px] border border-[var(--border)] text-[12.5px] font-semibold text-[var(--text2)] hover:bg-[var(--surface2)]"><Download size={14} /> Export</button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full" style={{ minWidth: 300 + types.length * 120 }}>
                    <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--surface2)]">
                            <th className="text-left text-[11.5px] font-semibold text-[var(--text3)] px-4 py-3">Employee</th>
                            {types.map(t => (
                                <th key={t.code} className="text-center text-[11.5px] font-semibold px-3 py-3 whitespace-nowrap" style={{ color: t.color }}>{t.code}<span className="block text-[10.5px] font-normal text-[var(--text3)]">left / total</span></th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {pageRows.map(r => (
                            <tr key={r.employee.id} className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface2)]">
                                <td className="px-4 py-2.5">
                                    <p className="text-[13px] font-semibold text-[var(--text)]">{r.employee.firstName} {r.employee.lastName}</p>
                                    <p className="text-[11px] font-mono text-[var(--text3)]">{r.employee.employeeId}</p>
                                </td>
                                {types.map(t => {
                                    const b = r.balances.find(x => x.code === t.code)
                                    if (!b) return <td key={t.code} className="text-center text-[var(--text3)]">—</td>
                                    const total = (b.entitled ?? 0) + b.carriedForward
                                    return (
                                        <td key={t.code} className="px-3 py-2.5 text-center" title={`Used ${b.used} · Pending ${b.pending}${b.carriedForward ? ` · Carried ${b.carriedForward}` : ""}`}>
                                            <span className="text-[13px] font-semibold" style={{ color: (b.available ?? 0) < 0 ? "var(--red)" : "var(--text)" }}>{fmtDays(b.available)}</span>
                                            <span className="text-[12px] text-[var(--text3)]"> / {fmtDays(total)}</span>
                                        </td>
                                    )
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {filtered.length === 0 && <p className="text-center text-[13px] text-[var(--text3)] py-10">No employees match.</p>}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)] text-[12.5px] text-[var(--text3)]">
                    <span>{filtered.length} employees</span>
                    <div className="flex items-center gap-2">
                        <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="w-8 h-8 rounded-[8px] border border-[var(--border)] flex items-center justify-center disabled:opacity-40"><ChevronLeft size={15} /></button>
                        <span>Page {page} of {totalPages}</span>
                        <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="w-8 h-8 rounded-[8px] border border-[var(--border)] flex items-center justify-center disabled:opacity-40"><ChevronRight size={15} /></button>
                    </div>
                </div>
            )}
        </Panel>
    )
}

// ─── Policy tab ───────────────────────────────────────────────────────────────

function PolicyTab({ policy, defaults, onSaved }: { policy: LeavePolicy; defaults: LeavePolicy | null; onSaved: (p: LeavePolicy) => void }) {
    const [draft, setDraft] = useState<LeavePolicy>(policy)
    const [saving, setSaving] = useState(false)
    useEffect(() => setDraft(policy), [policy])
    const dirty = JSON.stringify(draft) !== JSON.stringify(policy)

    const setType = (i: number, patch: Partial<LeaveTypeRule>) =>
        setDraft(d => ({ ...d, types: d.types.map((t, j) => j === i ? { ...t, ...patch } : t) }))

    const save = async () => {
        setSaving(true)
        try {
            const res = await fetch("/api/leaves/policy", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) })
            if (!res.ok) throw new Error(await readError(res))
            const j = await res.json()
            onSaved(j.policy)
            toast.success("Leave policy saved")
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Failed to save")
        } finally { setSaving(false) }
    }

    const numIn = (v: number | null, on: (n: number | null) => void, nullable = false) => (
        <input type="number" min={0} step={0.5} value={v ?? ""} placeholder={nullable ? "No limit" : "0"}
            onChange={e => on(e.target.value === "" ? (nullable ? null : 0) : Number(e.target.value))}
            className="w-[84px] h-8 rounded-[7px] border border-[var(--border2)] bg-[var(--surface)] px-2 text-[12.5px] text-[var(--text)] outline-none focus:border-[var(--accent)]" />
    )

    return (
        <div className="space-y-4">
            <Panel className="p-5">
                <h3 className="text-[14px] font-semibold text-[var(--text)] mb-1">General rules</h3>
                <p className="text-[12px] text-[var(--text3)] mb-4">Used to count leave days and to decide which year a balance belongs to.</p>
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                    <div>
                        <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Leave year starts in</label>
                        <select value={draft.yearStartMonth} onChange={e => setDraft(d => ({ ...d, yearStartMonth: Number(e.target.value) }))} className={inputCls}>
                            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Weekly off (not charged)</label>
                        <div className="flex flex-wrap gap-1.5">
                            {WEEKDAYS.map((w, i) => {
                                const on = draft.weeklyOff.includes(i)
                                return (
                                    <button key={w} type="button" onClick={() => setDraft(d => ({ ...d, weeklyOff: on ? d.weeklyOff.filter(x => x !== i) : [...d.weeklyOff, i] }))}
                                        className={`h-8 px-2.5 rounded-[7px] text-[12px] font-semibold border ${on ? "bg-[var(--accent)] border-[var(--accent)] text-white" : "border-[var(--border2)] text-[var(--text2)]"}`}>{w}</button>
                                )
                            })}
                        </div>
                    </div>
                    <div>
                        <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Balances tracked from (leave year)</label>
                        <input type="number" min={2000} max={2100} value={draft.trackingStartYear} onChange={e => setDraft(d => ({ ...d, trackingStartYear: Number(e.target.value) }))} className={inputCls} />
                        <p className="text-[11px] text-[var(--text3)] mt-1">Carry-forward never reaches back before this year.</p>
                    </div>
                    <div className="space-y-2 pt-1">
                        <label className="flex items-center gap-2 text-[13px] text-[var(--text2)] cursor-pointer">
                            <input type="checkbox" checked={draft.excludeHolidays} onChange={e => setDraft(d => ({ ...d, excludeHolidays: e.target.checked }))} className="accent-[var(--accent)] w-4 h-4" />
                            Don&apos;t charge public / company holidays
                        </label>
                        <label className="flex items-center gap-2 text-[13px] text-[var(--text2)] cursor-pointer">
                            <input type="checkbox" checked={draft.allowBackdated} onChange={e => setDraft(d => ({ ...d, allowBackdated: e.target.checked }))} className="accent-[var(--accent)] w-4 h-4" />
                            Employees may apply for past dates
                        </label>
                    </div>
                </div>
            </Panel>

            <Panel className="overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h3 className="text-[14px] font-semibold text-[var(--text)]">Leave types</h3>
                        <p className="text-[12px] text-[var(--text3)]">Leave the quota empty for types without a balance (LWP, comp-off). HR can override notice and balance rules, employees cannot.</p>
                    </div>
                    <button onClick={() => setDraft(d => ({ ...d, types: [...d.types, { code: `NEW${d.types.length}`, name: "New leave type", annualQuota: 0, paid: true, allowHalfDay: true, proRata: true, carryForwardMax: 0, minNoticeDays: 0, maxConsecutive: null, color: "#0ea5e9", active: true }] }))}
                        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[9px] border border-[var(--border)] text-[12.5px] font-semibold text-[var(--text2)] hover:bg-[var(--surface2)]"><Plus size={14} /> Add type</button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full" style={{ minWidth: 1080 }}>
                        <thead>
                            <tr className="bg-[var(--surface2)] text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide">
                                {["Active", "Code", "Name", "Quota / yr", "Carry fwd max", "Notice (days)", "Max at once", "Paid", "Half day", "Pro-rata", "Colour"].map(h => <th key={h} className="text-left px-3 py-2.5 whitespace-nowrap">{h}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {draft.types.map((t, i) => {
                                const isExisting = policy.types.some(p => p.code === t.code)
                                return (
                                    <tr key={i} className="border-t border-[var(--border)] text-[12.5px]">
                                        <td className="px-3 py-2"><input type="checkbox" checked={t.active} onChange={e => setType(i, { active: e.target.checked })} className="accent-[var(--accent)] w-4 h-4" /></td>
                                        <td className="px-3 py-2">
                                            <input value={t.code} disabled={isExisting} title={isExisting ? "Codes are stored on existing leaves and can't be renamed" : ""}
                                                onChange={e => setType(i, { code: e.target.value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 16) })}
                                                className="w-[80px] h-8 rounded-[7px] border border-[var(--border2)] bg-[var(--surface)] px-2 font-mono text-[12px] disabled:bg-[var(--surface2)] disabled:text-[var(--text3)]" />
                                        </td>
                                        <td className="px-3 py-2"><input value={t.name} onChange={e => setType(i, { name: e.target.value })} className="w-[180px] h-8 rounded-[7px] border border-[var(--border2)] bg-[var(--surface)] px-2" /></td>
                                        <td className="px-3 py-2">{numIn(t.annualQuota, n => setType(i, { annualQuota: n }), true)}</td>
                                        <td className="px-3 py-2">{numIn(t.carryForwardMax, n => setType(i, { carryForwardMax: n ?? 0 }))}</td>
                                        <td className="px-3 py-2">{numIn(t.minNoticeDays, n => setType(i, { minNoticeDays: n ?? 0 }))}</td>
                                        <td className="px-3 py-2">{numIn(t.maxConsecutive, n => setType(i, { maxConsecutive: n }), true)}</td>
                                        {(["paid", "allowHalfDay", "proRata"] as const).map(k => (
                                            <td key={k} className="px-3 py-2"><input type="checkbox" checked={t[k]} onChange={e => setType(i, { [k]: e.target.checked } as Partial<LeaveTypeRule>)} className="accent-[var(--accent)] w-4 h-4" /></td>
                                        ))}
                                        <td className="px-3 py-2"><input type="color" value={t.color} onChange={e => setType(i, { color: e.target.value })} className="w-9 h-8 rounded border border-[var(--border2)] cursor-pointer" /></td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </Panel>

            <div className="flex flex-wrap items-center justify-end gap-2">
                {defaults && (
                    <button onClick={() => setDraft(defaults)} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-[10px] text-[13px] font-medium text-[var(--text2)] hover:bg-[var(--surface)]"><RotateCcw size={14} /> Load defaults</button>
                )}
                <button onClick={() => setDraft(policy)} disabled={!dirty} className="h-10 px-4 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] text-[13px] font-medium text-[var(--text2)] disabled:opacity-40">Discard</button>
                <button onClick={save} disabled={!dirty || saving} className="inline-flex items-center gap-2 h-10 px-5 rounded-[10px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save policy
                </button>
            </div>
        </div>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = "requests" | "calendar" | "balances" | "policy"

export default function LeavesPage({ searchParams }: { searchParams?: { status?: string } }) {
    const { data: session, status } = useSession()
    const router = useRouter()

    const [leaves, setLeaves] = useState<Leave[]>([])
    const [loading, setLoading] = useState(true)
    // ?status=PENDING (dashboard "Pending approvals") opens on that filter.
    const [statusFilter, setStatusFilter] = useState(() => {
        const s = searchParams?.status?.toUpperCase() ?? ""
        return ["PENDING", "APPROVED", "REJECTED", "CANCELLED"].includes(s) ? s : ""
    })
    const [typeFilter, setTypeFilter] = useState("")
    const [monthFilter, setMonthFilter] = useState("")
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const [showApply, setShowApply] = useState(false)
    const [selectedLeave, setSelectedLeave] = useState<Leave | null>(null)
    const [page, setPage] = useState(1)
    const [perPage, setPerPage] = useState(25)
    const [tab, setTab] = useState<Tab>("requests")
    const [policy, setPolicy] = useState<LeavePolicy | null>(null)
    const [defaults, setDefaults] = useState<LeavePolicy | null>(null)
    const [myBalances, setMyBalances] = useState<LeaveBalance[]>([])
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [bulkBusy, setBulkBusy] = useState(false)

    const isApprover = can(session, "leaves.approve") || can(session, "leaves.manage")
    const canView = can(session, "leaves.view")
    const canManage = can(session, "leaves.manage")
    const typeOf = useTypeLookup(policy)

    useEffect(() => { if (status === "unauthenticated") router.push("/login") }, [status, router])
    useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 300); return () => clearTimeout(t) }, [search])
    useEffect(() => { setPage(1); setSelected(new Set()) }, [statusFilter, typeFilter, monthFilter, debouncedSearch, perPage])

    useEffect(() => {
        if (status !== "authenticated") return
        fetch("/api/leaves/policy").then(r => r.ok ? r.json() : null).then(d => { if (d) { setPolicy(d.policy); setDefaults(d.defaults) } }).catch(() => {})
    }, [status])

    const fetchMine = useCallback(() => {
        fetch("/api/leaves/balance").then(r => r.ok ? r.json() : null).then(d => setMyBalances(d?.employees?.[0]?.balances ?? [])).catch(() => {})
    }, [])
    useEffect(() => { if (status === "authenticated" && !canView) fetchMine() }, [status, canView, fetchMine])

    const fetchLeaves = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (statusFilter) params.set("status", statusFilter)
            if (typeFilter) params.set("type", typeFilter)
            if (monthFilter) params.set("month", monthFilter)
            if (debouncedSearch) params.set("search", debouncedSearch)
            const res = await fetch(`/api/leaves?${params}`)
            const data = await res.json()
            setLeaves(Array.isArray(data) ? data : [])
        } catch {
            toast.error("Failed to load leaves")
        } finally {
            setLoading(false)
        }
    }, [statusFilter, typeFilter, monthFilter, debouncedSearch])

    useEffect(() => { if (status === "authenticated") fetchLeaves() }, [fetchLeaves, status])

    const refresh = () => { fetchLeaves(); if (!canView) fetchMine() }

    // A notification link (?id=…) opens that one leave in the drawer — from the
    // loaded list when it's there, else by id (it may be outside the filters).
    const openLeaveById = useCallback(async (id: string) => {
        const inList = leaves.find(l => l.id === id)
        if (inList) { setSelectedLeave(inList); return }
        const res = await fetch(`/api/leaves/${id}`).catch(() => null)
        if (res?.ok) setSelectedLeave(await res.json())
        else toast.error("This record is no longer available")
    }, [leaves])

    // Pending first (oldest first — first come, first served), then the rest newest first.
    const sorted = useMemo(() => {
        const p = leaves.filter(l => l.status === "PENDING").sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        const r = leaves.filter(l => l.status !== "PENDING")
        return [...p, ...r]
    }, [leaves])

    const now = new Date()
    const todayKey = format(now, "yyyy-MM-dd")
    const pending = leaves.filter(l => l.status === "PENDING")
    const onLeaveToday = leaves.filter(l => l.status === "APPROVED" && l.startDate.slice(0, 10) <= todayKey && l.endDate.slice(0, 10) >= todayKey).length
    const approvedThisMonth = leaves.filter(l => {
        if (l.status !== "APPROVED") return false
        const d = dateOnly(l.startDate)
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
    const oldestPendingDays = pending.length ? Math.floor((Date.now() - new Date(pending.reduce((a, b) => a.createdAt < b.createdAt ? a : b).createdAt).getTime()) / 86400000) : 0

    const statsCards = canView ? [
        { label: "Awaiting Approval", value: pending.length, sub: pending.length ? `oldest ${oldestPendingDays}d ago` : "all clear", tone: "amber" as StatTone, icon: Clock, onClick: () => { setTab("requests"); setStatusFilter("PENDING") } },
        { label: "On Leave Today", value: onLeaveToday, sub: format(now, "EEE, dd MMM"), tone: "blue" as StatTone, icon: CalendarOff, onClick: () => setTab("calendar") },
        { label: "Approved This Month", value: approvedThisMonth.length, sub: `${fmtDays(approvedThisMonth.reduce((s, l) => s + l.days, 0))} days`, tone: "teal" as StatTone, icon: CheckCircle, onClick: () => { setTab("requests"); setStatusFilter("APPROVED") } },
        { label: "Rejected", value: leaves.filter(l => l.status === "REJECTED").length, sub: "in this list", tone: "rose" as StatTone, icon: XCircle, onClick: () => { setTab("requests"); setStatusFilter("REJECTED") } },
    ] : []

    const exportCsv = () => {
        const rows = [["Employee", "Emp ID", "Type", "Start", "End", "Days", "Status", "Reason", "Applied", "Rejection reason"]]
        for (const l of sorted) rows.push([
            `${l.employee.firstName} ${l.employee.lastName}`, l.employee.employeeId, l.type,
            format(dateOnly(l.startDate), "dd/MM/yyyy"), format(dateOnly(l.endDate), "dd/MM/yyyy"),
            String(l.days), l.status, l.reason || "", format(new Date(l.createdAt), "dd/MM/yyyy"), l.rejectionReason || "",
        ])
        const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
        const a = document.createElement("a")
        a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
        a.download = `leaves_${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        toast.success(`Exported ${sorted.length} leaves`)
    }

    // Bulk approve: anything that needs a policy override is skipped and left
    // for a one-by-one decision rather than silently pushed through.
    const bulkApprove = async () => {
        setBulkBusy(true)
        let ok = 0, skipped = 0
        for (const id of Array.from(selected)) {
            try {
                const res = await fetch(`/api/leaves/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "APPROVED" }) })
                if (res.ok) ok++; else skipped++
            } catch { skipped++ }
        }
        setBulkBusy(false)
        setSelected(new Set())
        toast[skipped ? "warning" : "success"](`${ok} approved${skipped ? ` · ${skipped} need individual review (balance or overlap)` : ""}`)
        fetchLeaves()
    }

    const totalPages = Math.max(1, Math.ceil(sorted.length / perPage))
    const safePage = Math.min(page, totalPages)
    const pageRows = sorted.slice((safePage - 1) * perPage, safePage * perPage)
    const pendingOnPage = pageRows.filter(l => l.status === "PENDING")
    const allPageSelected = pendingOnPage.length > 0 && pendingOnPage.every(l => selected.has(l.id))

    const tabs: { key: Tab; label: string; icon: React.ElementType; show: boolean }[] = [
        { key: "requests", label: canView ? "Requests" : "My Requests", icon: ListChecks, show: true },
        { key: "calendar", label: "Team Calendar", icon: Calendar, show: canView },
        { key: "balances", label: "Balances", icon: Wallet, show: canView },
        { key: "policy", label: "Policy", icon: Settings2, show: canManage },
    ]

    return (
        <div className="p-4 lg:p-0 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-[26px] font-bold tracking-[-0.5px] text-[var(--text)]">{canView ? "Leaves" : "My Leaves"}</h1>
                    <p className="text-[13.5px] text-[var(--text3)] mt-1">
                        {canView ? "Requests, approvals, balances and the team calendar in one place." : "Check your balance, apply for leave and track your requests."}
                    </p>
                </div>
                <div className="flex items-center gap-2.5">
                    {tab === "requests" && (
                        <button onClick={exportCsv}
                            className="inline-flex items-center gap-2 h-[42px] px-4 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] text-[13px] font-semibold text-[var(--text2)] hover:bg-[var(--surface2)]">
                            <Download size={16} /> Export
                        </button>
                    )}
                    <button onClick={() => setShowApply(true)} disabled={!policy}
                        className="inline-flex items-center gap-2 h-[42px] px-5 bg-[var(--accent)] text-white rounded-[10px] text-[13px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
                        <Plus size={16} /> {canManage ? "Record Leave" : "Apply Leave"}
                    </button>
                </div>
            </div>

            {/* KPI cards (managers) or own balances (employees) */}
            {canView ? (
                <div className={statGridClass(statsCards.length)}>
                    {statsCards.map((s, i) => (
                        <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} icon={<s.icon size={20} />} tone={s.tone} seed={i} onClick={s.onClick} />
                    ))}
                </div>
            ) : (
                <BalanceCards balances={myBalances} />
            )}

            {tabs.filter(t => t.show).length > 1 && (
                <div className="z-tabs-wrap"><div className="z-tabs" role="tablist">
                    {tabs.filter(t => t.show).map(t => (
                        <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={`z-tab ${tab === t.key ? "is-active" : ""}`}>
                            <t.icon size={14} /> {t.label}
                            {t.key === "requests" && pending.length > 0 && canView && (
                                <span className={`ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-bold flex items-center justify-center ${tab === t.key ? "bg-white/25 text-white" : "bg-[#fef3c7] text-[#b45309]"}`}>{pending.length}</span>
                            )}
                        </button>
                    ))}
                </div></div>
            )}

            {tab === "calendar" && canView && <LeaveCalendar typeOf={typeOf} onOpen={setSelectedLeave} />}
            {tab === "balances" && canView && <BalancesTab policy={policy} />}
            {tab === "policy" && canManage && policy && <PolicyTab policy={policy} defaults={defaults} onSaved={setPolicy} />}

            {tab === "requests" && (
                <>
                    <div className="flex flex-wrap items-center gap-2.5">
                        <div className="z-tabs-wrap"><div className="z-tabs" role="tablist">
                            {(["", "PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const).map(s => (
                                <button key={s} role="tab" aria-selected={statusFilter === s} onClick={() => setStatusFilter(s)} className={`z-tab ${statusFilter === s ? "is-active" : ""}`}>
                                    {s === "" ? "All" : STATUS_CONFIG[s]?.label}
                                </button>
                            ))}
                        </div></div>
                        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                            className="h-9 px-3 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] text-[12.5px] text-[var(--text2)] outline-none cursor-pointer">
                            <option value="">All types</option>
                            {policy?.types.map(t => <option key={t.code} value={t.code}>{t.code} — {t.name}</option>)}
                        </select>
                        <input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
                            className="h-9 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[12.5px] text-[var(--text2)] outline-none cursor-pointer" />
                        {(monthFilter || typeFilter || statusFilter || search) && (
                            <button onClick={() => { setMonthFilter(""); setTypeFilter(""); setStatusFilter(""); setSearch("") }}
                                className="inline-flex items-center gap-1 h-9 px-3 rounded-[9px] text-[12.5px] font-medium text-[var(--text2)] hover:bg-[var(--surface)]">
                                <X size={13} /> Clear
                            </button>
                        )}
                        {canView && (
                            <div className="relative flex-1 min-w-[200px] max-w-[320px] ml-auto">
                                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by employee name or ID…"
                                    className="w-full h-9 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] pl-9 pr-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors" />
                            </div>
                        )}
                    </div>

                    {isApprover && selected.size > 0 && (
                        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-[12px] bg-[var(--accent-light)] border border-[#c7dbff]">
                            <span className="text-[13px] font-semibold text-[var(--accent-text)]">{selected.size} selected</span>
                            <button onClick={bulkApprove} disabled={bulkBusy} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[8px] bg-[var(--accent)] text-white text-[12.5px] font-semibold disabled:opacity-50">
                                {bulkBusy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />} Approve selected
                            </button>
                            <button onClick={() => setSelected(new Set())} className="text-[12.5px] text-[var(--text2)] hover:underline">Clear</button>
                            <span className="text-[11.5px] text-[var(--text3)] flex items-center gap-1"><Info size={12} /> Requests that break balance or overlap rules are skipped for individual review.</span>
                        </div>
                    )}

                    {loading ? (
                        <div className="flex items-center justify-center py-16"><Loader2 size={28} className="animate-spin text-[var(--accent)]" /></div>
                    ) : sorted.length === 0 ? (
                        <EmptyState icon={<CalendarOff size={36} />} title="No leave requests" sub={canView ? "Nothing matches these filters." : "When you apply for leave it will show up here."} />
                    ) : (
                        <Panel className="overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full" style={{ minWidth: 920 }}>
                                    <thead>
                                        <tr className="border-b border-[var(--border)]">
                                            {isApprover && (
                                                <th className="pl-5 pr-1 py-3.5 w-8">
                                                    <input type="checkbox" aria-label="Select all pending on this page" checked={allPageSelected} disabled={!pendingOnPage.length}
                                                        onChange={e => setSelected(s => { const n = new Set(s); pendingOnPage.forEach(l => e.target.checked ? n.add(l.id) : n.delete(l.id)); return n })}
                                                        className="accent-[var(--accent)] w-4 h-4" />
                                                </th>
                                            )}
                                            {["Employee", "Type", "Dates", "Reason", "Status", "Applied"].map(h => (
                                                <th key={h} className="text-left text-[11.5px] font-semibold text-[var(--text3)] px-4 py-3.5 whitespace-nowrap">{h}</th>
                                            ))}
                                            <th className="text-right text-[11.5px] font-semibold text-[var(--text3)] px-5 py-3.5 whitespace-nowrap">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pageRows.map(leave => (
                                            <tr key={leave.id} onClick={() => setSelectedLeave(leave)}
                                                className={`border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface2)] transition-colors cursor-pointer ${selected.has(leave.id) ? "bg-[var(--accent-light)]/50" : ""}`}>
                                                {isApprover && (
                                                    <td className="pl-5 pr-1 py-3" onClick={e => e.stopPropagation()}>
                                                        {leave.status === "PENDING" && (
                                                            <input type="checkbox" aria-label="Select" checked={selected.has(leave.id)}
                                                                onChange={e => setSelected(s => { const n = new Set(s); e.target.checked ? n.add(leave.id) : n.delete(leave.id); return n })}
                                                                className="accent-[var(--accent)] w-4 h-4" />
                                                        )}
                                                    </td>
                                                )}
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-3">
                                                        <Avatar firstName={leave.employee.firstName} lastName={leave.employee.lastName} photo={leave.employee.photo} />
                                                        <div className="min-w-0">
                                                            <p className="text-[13px] font-semibold text-[var(--text)] truncate">{leave.employee.firstName} {leave.employee.lastName}</p>
                                                            <p className="text-[11px] font-mono text-[var(--text3)]">{leave.employee.employeeId}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3"><TypeBadge code={leave.type} rule={typeOf(leave.type)} /></td>
                                                <td className="px-4 py-3">
                                                    <p className="text-[13px] text-[var(--text)] whitespace-nowrap">
                                                        {format(dateOnly(leave.startDate), "dd MMM")}{leave.startDate.slice(0, 10) !== leave.endDate.slice(0, 10) && <> — {format(dateOnly(leave.endDate), "dd MMM yy")}</>}
                                                        {leave.startDate.slice(0, 10) === leave.endDate.slice(0, 10) && <> {format(dateOnly(leave.startDate), "yy")}</>}
                                                    </p>
                                                    <p className="text-[11px] text-[var(--text3)]">{leave.days === 0.5 ? "Half day" : `${fmtDays(leave.days)} day${leave.days !== 1 ? "s" : ""}`}</p>
                                                </td>
                                                <td className="px-4 py-3 max-w-[200px]"><p className="text-[12px] text-[var(--text2)] truncate">{leave.reason || "—"}</p></td>
                                                <td className="px-4 py-3"><StatusBadge status={leave.status} /></td>
                                                <td className="px-4 py-3 text-[12px] text-[var(--text3)] whitespace-nowrap">{format(new Date(leave.createdAt), "dd MMM yyyy")}</td>
                                                <td className="px-5 py-3 text-right" onClick={e => e.stopPropagation()}>
                                                    {isApprover && leave.status === "PENDING" ? (
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <button onClick={() => setSelectedLeave(leave)}
                                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[7px] border border-[#fecaca] bg-[var(--red-light)] text-[var(--red)] text-[12px] font-medium hover:bg-[#fee2e2]">
                                                                <XCircle size={12} /> Reject
                                                            </button>
                                                            <button onClick={() => setSelectedLeave(leave)}
                                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[7px] border border-[#c7dbff] bg-[var(--accent-light)] text-[var(--accent)] text-[12px] font-medium hover:bg-[#dbe7ff]">
                                                                <CheckCircle size={12} /> Review
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button onClick={() => setSelectedLeave(leave)}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[7px] border border-[var(--border)] text-[11.5px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)]">
                                                            <User size={12} /> View
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)] flex-wrap gap-3">
                                <span className="text-[12.5px] text-[var(--text3)]">
                                    Showing {(safePage - 1) * perPage + 1} to {(safePage - 1) * perPage + pageRows.length} of {sorted.length} requests
                                </span>
                                <div className="flex items-center gap-3">
                                    {totalPages > 1 && (
                                        <div className="flex items-center gap-1.5">
                                            <button disabled={safePage === 1} onClick={() => setPage(p => Math.max(1, p - 1))} aria-label="Previous page"
                                                className="w-9 h-9 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] flex items-center justify-center text-[var(--text2)] disabled:opacity-40"><ChevronLeft size={16} /></button>
                                            <span className="text-[12.5px] text-[var(--text2)] px-1">Page {safePage} of {totalPages}</span>
                                            <button disabled={safePage === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} aria-label="Next page"
                                                className="w-9 h-9 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] flex items-center justify-center text-[var(--text2)] disabled:opacity-40"><ChevronRight size={16} /></button>
                                        </div>
                                    )}
                                    <select value={perPage} onChange={e => setPerPage(Number(e.target.value))}
                                        className="h-9 px-3 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] text-[12.5px] text-[var(--text2)] outline-none cursor-pointer">
                                        {[25, 50, 100].map(n => <option key={n} value={n}>{n} per page</option>)}
                                    </select>
                                </div>
                            </div>
                        </Panel>
                    )}
                </>
            )}

            <OpenFromQuery ready={status === "authenticated" && !loading} onOpen={openLeaveById} />
            <LeaveDrawer
                leave={selectedLeave}
                onClose={() => setSelectedLeave(null)}
                onUpdated={refresh}
                isApprover={isApprover}
                isOwnView={!isApprover}
                allLeaves={leaves}
                typeOf={typeOf}
            />

            <ApplyLeaveModal open={showApply} onClose={() => setShowApply(false)} onSaved={refresh} canManage={canManage} policy={policy} />
        </div>
    )
}
