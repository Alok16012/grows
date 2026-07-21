"use client"
import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    Plus, Search, Loader2, CheckCircle, XCircle,
    Clock, X, Calendar, FileText, CalendarOff,
    ChevronRight, ChevronLeft, User, Download,
} from "lucide-react"
import { format } from "date-fns"
import { can } from "@/lib/can"

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
        deployments?: { site: { name: string } }[]
    }
}

type Employee = { id: string; firstName: string; lastName: string; employeeId: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
    PENDING:   { label: "Pending",   color: "#f59e0b", bg: "#fffbeb", border: "#fde68a" },
    APPROVED:  { label: "Approved",  color: "#1a9e6e", bg: "#e8f7f1", border: "#6ee7b7" },
    REJECTED:  { label: "Rejected",  color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
    CANCELLED: { label: "Cancelled", color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb" },
}

const LEAVE_TYPE_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
    CL:      { color: "#3b82f6", bg: "#eff6ff", border: "#bfdbfe" },
    SL:      { color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
    PL:      { color: "#1a9e6e", bg: "#e8f7f1", border: "#6ee7b7" },
    LWP:     { color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb" },
    CompOff: { color: "#8b5cf6", bg: "#f5f3ff", border: "#ddd6fe" },
}

const LEAVE_TYPES = ["CL", "SL", "PL", "LWP", "CompOff"]

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ firstName, lastName, photo, size = 36 }: {
    firstName: string; lastName: string; photo?: string; size?: number
}) {
    const [imgErr, setImgErr] = useState(false)
    const initials = `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase()
    const colors = ["#1a9e6e", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444"]
    const bg = colors[(firstName.charCodeAt(0) + lastName.charCodeAt(0)) % colors.length]
    if (photo && !imgErr) return <img src={photo} alt="" style={{ width: size, height: size }} className="rounded-full object-cover shrink-0" onError={() => setImgErr(true)} />
    return (
        <div style={{ width: size, height: size, background: bg, fontSize: size * 0.33 }}
            className="rounded-full flex items-center justify-center text-white font-semibold shrink-0 select-none">
            {initials}
        </div>
    )
}

function LeaveTypeBadge({ type }: { type: string }) {
    const cfg = LEAVE_TYPE_CONFIG[type]
    if (!cfg) return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-[#f9fafb] text-[#6b7280] border-[#e5e7eb]">{type}</span>
    return (
        <span style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}
            className="px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap">
            {type}
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

// ─── Apply Leave Modal ────────────────────────────────────────────────────────

function ApplyLeaveModal({ open, onClose, onSaved }: {
    open: boolean; onClose: () => void; onSaved: () => void
}) {
    const [loading, setLoading] = useState(false)
    const [employees, setEmployees] = useState<Employee[]>([])
    const [form, setForm] = useState({
        employeeId: "", type: "CL", startDate: "", endDate: "", days: "", reason: "",
    })

    useEffect(() => {
        if (open) {
            fetch("/api/employees?status=ACTIVE")
                .then(r => r.json())
                .then(data => setEmployees(Array.isArray(data) ? data : []))
                .catch(() => {})
            setForm({ employeeId: "", type: "CL", startDate: "", endDate: "", days: "", reason: "" })
        }
    }, [open])

    useEffect(() => {
        if (form.startDate && form.endDate) {
            const start = new Date(form.startDate)
            const end = new Date(form.endDate)
            const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
            if (diff > 0) setForm(f => ({ ...f, days: diff.toString() }))
        }
    }, [form.startDate, form.endDate])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const res = await fetch("/api/leaves", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Leave applied successfully!")
            onSaved()
            onClose()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to apply leave")
        } finally {
            setLoading(false)
        }
    }

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-[var(--surface)] rounded-[16px] border border-[var(--border)] w-full max-w-md shadow-xl">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                    <h2 className="text-[15px] font-semibold text-[var(--text)]">Apply Leave</h2>
                    <button onClick={onClose} className="p-1 text-[var(--text3)] hover:text-[var(--text)] rounded-md hover:bg-[var(--surface2)] transition-colors"><X size={18} /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="block text-[12px] text-[var(--text2)] mb-1">Employee *</label>
                        <select value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))} required
                            className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors">
                            <option value="">Select employee</option>
                            {employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeId})</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[12px] text-[var(--text2)] mb-1">Leave Type *</label>
                        <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} required
                            className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors">
                            {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[12px] text-[var(--text2)] mb-1">Start Date *</label>
                            <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} required
                                className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors" />
                        </div>
                        <div>
                            <label className="block text-[12px] text-[var(--text2)] mb-1">End Date *</label>
                            <input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} min={form.startDate} required
                                className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-[12px] text-[var(--text2)] mb-1">Days</label>
                        <input type="number" min="0.5" step="0.5" value={form.days} onChange={e => setForm(f => ({ ...f, days: e.target.value }))} required
                            className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors" />
                    </div>
                    <div>
                        <label className="block text-[12px] text-[var(--text2)] mb-1">Reason</label>
                        <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                            className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors resize-none"
                            rows={3} placeholder="Reason for leave..." />
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-1">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-[var(--text2)] hover:text-[var(--text)] rounded-[8px] hover:bg-[var(--surface2)] transition-colors">Cancel</button>
                        <button type="submit" disabled={loading}
                            className="inline-flex items-center gap-2 px-5 py-2 bg-[var(--accent)] text-white rounded-[8px] text-[13px] font-medium hover:opacity-90 disabled:opacity-50">
                            {loading && <Loader2 size={14} className="animate-spin" />}
                            Apply Leave
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// ─── Leave Detail Drawer ──────────────────────────────────────────────────────

function LeaveDrawer({ leave, onClose, onUpdated, isAdminOrManager }: {
    leave: Leave | null
    onClose: () => void
    onUpdated: () => void
    isAdminOrManager: boolean
}) {
    const [loading, setLoading] = useState(false)
    const [rejectionReason, setRejectionReason] = useState("")
    const [showRejectForm, setShowRejectForm] = useState(false)

    useEffect(() => {
        if (leave) { setRejectionReason(""); setShowRejectForm(false) }
    }, [leave])

    const handleApprove = async () => {
        if (!leave) return
        setLoading(true)
        try {
            const res = await fetch(`/api/leaves/${leave.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "APPROVED" }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Leave approved!")
            onUpdated()
            onClose()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to approve")
        } finally {
            setLoading(false)
        }
    }

    const handleReject = async () => {
        if (!leave || !rejectionReason.trim()) return toast.error("Rejection reason is required")
        setLoading(true)
        try {
            const res = await fetch(`/api/leaves/${leave.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "REJECTED", rejectionReason }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Leave rejected")
            onUpdated()
            onClose()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to reject")
        } finally {
            setLoading(false)
        }
    }

    const handleCancel = async () => {
        if (!leave) return
        setLoading(true)
        try {
            const res = await fetch(`/api/leaves/${leave.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "CANCELLED" }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Leave cancelled")
            onUpdated()
            onClose()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to cancel")
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            {/* Backdrop */}
            {leave && <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />}
            {/* Drawer */}
            <div className={`fixed top-0 right-0 h-full w-[400px] max-w-full z-50 bg-[var(--surface)] border-l border-[var(--border)] shadow-2xl transition-transform duration-300 flex flex-col ${leave ? "translate-x-0" : "translate-x-full"}`}>
                {leave && (
                    <>
                        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
                            <h2 className="text-[15px] font-semibold text-[var(--text)]">Leave Details</h2>
                            <button onClick={onClose} className="p-1 text-[var(--text3)] hover:text-[var(--text)] rounded-md hover:bg-[var(--surface2)]"><X size={18} /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 space-y-5">
                            {/* Employee */}
                            <div className="flex items-center gap-3 p-4 bg-[var(--surface2)]/50 rounded-[12px] border border-[var(--border)]">
                                <Avatar firstName={leave.employee.firstName} lastName={leave.employee.lastName} photo={leave.employee.photo} size={48} />
                                <div>
                                    <p className="text-[14px] font-semibold text-[var(--text)]">{leave.employee.firstName} {leave.employee.lastName}</p>
                                    <p className="text-[12px] text-[var(--text3)]">{leave.employee.employeeId} · {leave.employee.designation || "—"}</p>
                                    <p className="text-[12px] text-[var(--text3)]">{leave.employee.deployments?.[0]?.site?.name || "—"}</p>
                                </div>
                            </div>

                            {/* Leave Info */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-[12px] text-[var(--text3)]">Leave Type</span>
                                    <LeaveTypeBadge type={leave.type} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[12px] text-[var(--text3)]">Status</span>
                                    <StatusBadge status={leave.status} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[12px] text-[var(--text3)]">Duration</span>
                                    <span className="text-[13px] font-medium text-[var(--text)]">
                                        {format(new Date(leave.startDate), "dd MMM")} — {format(new Date(leave.endDate), "dd MMM yyyy")}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[12px] text-[var(--text3)]">Days</span>
                                    <span className="text-[13px] font-semibold text-[var(--text)]">{leave.days} day{leave.days !== 1 ? "s" : ""}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[12px] text-[var(--text3)]">Applied On</span>
                                    <span className="text-[13px] text-[var(--text2)]">{format(new Date(leave.createdAt), "dd MMM yyyy")}</span>
                                </div>
                                {leave.reason && (
                                    <div className="pt-2 border-t border-[var(--border)]">
                                        <p className="text-[12px] text-[var(--text3)] mb-1">Reason</p>
                                        <p className="text-[13px] text-[var(--text2)] italic">&ldquo;{leave.reason}&rdquo;</p>
                                    </div>
                                )}
                            </div>

                            {/* Approved/Rejected info */}
                            {leave.status === "APPROVED" && leave.approvedAt && (
                                <div className="p-3 bg-[#e8f7f1] border border-[#6ee7b7] rounded-[10px]">
                                    <p className="text-[12px] font-medium text-[#1a9e6e]">Approved on {format(new Date(leave.approvedAt), "dd MMM yyyy")}</p>
                                </div>
                            )}
                            {leave.status === "REJECTED" && leave.rejectedAt && (
                                <div className="p-3 bg-[#fef2f2] border border-[#fecaca] rounded-[10px]">
                                    <p className="text-[12px] font-medium text-[#dc2626]">Rejected on {format(new Date(leave.rejectedAt), "dd MMM yyyy")}</p>
                                    {leave.rejectionReason && (
                                        <p className="text-[12px] text-[#dc2626] mt-1">{leave.rejectionReason}</p>
                                    )}
                                </div>
                            )}

                            {/* Reject form */}
                            {showRejectForm && (
                                <div className="space-y-2">
                                    <label className="block text-[12px] text-[var(--text2)]">Rejection Reason *</label>
                                    <textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)}
                                        className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--red)] transition-colors resize-none"
                                        rows={3} placeholder="Provide a reason for rejection..." />
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        {isAdminOrManager && leave.status === "PENDING" && (
                            <div className="px-5 py-4 border-t border-[var(--border)] space-y-2 shrink-0">
                                {!showRejectForm ? (
                                    <div className="flex gap-2">
                                        <button onClick={() => setShowRejectForm(true)}
                                            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-[8px] border border-[#fecaca] bg-[#fef2f2] text-[#dc2626] text-[13px] font-medium hover:bg-[#fee2e2] transition-colors">
                                            <XCircle size={14} /> Reject
                                        </button>
                                        <button onClick={handleApprove} disabled={loading}
                                            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-[8px] bg-[var(--accent)] text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-50">
                                            {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                                            Approve
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex gap-2">
                                        <button onClick={() => setShowRejectForm(false)}
                                            className="flex-1 py-2.5 rounded-[8px] border border-[var(--border)] text-[13px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors">
                                            Cancel
                                        </button>
                                        <button onClick={handleReject} disabled={loading || !rejectionReason.trim()}
                                            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-[8px] bg-[#dc2626] text-white text-[13px] font-medium hover:bg-[#b91c1c] disabled:opacity-50">
                                            {loading && <Loader2 size={14} className="animate-spin" />}
                                            Confirm Reject
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                        {!isAdminOrManager && leave.status === "PENDING" && (
                            <div className="px-5 py-4 border-t border-[var(--border)] shrink-0">
                                <button onClick={handleCancel} disabled={loading}
                                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-[8px] border border-[var(--border)] text-[13px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] disabled:opacity-50">
                                    {loading && <Loader2 size={14} className="animate-spin" />}
                                    Cancel Leave
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LeavesPage() {
    const { data: session, status } = useSession()
    const router = useRouter()

    const [leaves, setLeaves] = useState<Leave[]>([])
    const [loading, setLoading] = useState(true)
    const [statusFilter, setStatusFilter] = useState("")
    const [typeFilter, setTypeFilter] = useState("")
    const [monthFilter, setMonthFilter] = useState("")
    const [search, setSearch] = useState("")
    const [showApply, setShowApply] = useState(false)
    const [selectedLeave, setSelectedLeave] = useState<Leave | null>(null)
    const [page, setPage] = useState(1)
    const [perPage, setPerPage] = useState(25)
    useEffect(() => { setPage(1) }, [statusFilter, typeFilter, monthFilter, search, perPage])

    const isAdminOrManager = can(session, "leaves.view")

    useEffect(() => {
        if (status !== "unauthenticated") return
        router.push("/login")
    }, [status, router])

    const fetchLeaves = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (statusFilter) params.set("status", statusFilter)
            if (typeFilter) params.set("type", typeFilter)
            if (monthFilter) params.set("month", monthFilter)
            if (search) params.set("search", search)
            const res = await fetch(`/api/leaves?${params}`)
            const data = await res.json()
            setLeaves(Array.isArray(data) ? data : [])
        } catch {
            toast.error("Failed to load leaves")
        } finally {
            setLoading(false)
        }
    }, [statusFilter, typeFilter, monthFilter, search])

    useEffect(() => {
        if (status === "authenticated") fetchLeaves()
    }, [status, fetchLeaves])

    // Stats
    const pending = leaves.filter(l => l.status === "PENDING").length
    const approvedThisMonth = (() => {
        const now = new Date()
        return leaves.filter(l => {
            if (l.status !== "APPROVED") return false
            const d = new Date(l.startDate)
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
        }).length
    })()
    const totalLeaveDays = (() => {
        const now = new Date()
        return leaves.filter(l => {
            if (l.status !== "APPROVED") return false
            const d = new Date(l.startDate)
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
        }).reduce((s, l) => s + l.days, 0)
    })()
    const rejected = leaves.filter(l => l.status === "REJECTED").length

    const totalReq = leaves.length
    const pctOf = (n: number) => totalReq > 0 ? `${((n / totalReq) * 100).toFixed(1)}% of total` : "—"
    const statsCards = [
        { label: "Pending Requests",        value: pending,           sub: pctOf(pending),        color: "#d97706", bg: "#fef3c7", icon: Clock },
        { label: "Approved This Month",     value: approvedThisMonth, sub: "current month",       color: "#1a9e6e", bg: "#e8f7f1", icon: CheckCircle },
        { label: "Leave Days (Month)",      value: totalLeaveDays,    sub: "approved days",       color: "#3b82f6", bg: "#eff6ff", icon: Calendar },
        { label: "Rejected",                value: rejected,          sub: pctOf(rejected),       color: "#dc2626", bg: "#fef2f2", icon: XCircle },
    ]

    const exportCsv = () => {
        const rows = [["Employee", "Emp ID", "Type", "Start", "End", "Days", "Status", "Reason", "Applied"]]
        for (const l of leaves) rows.push([
            `${l.employee.firstName} ${l.employee.lastName}`, l.employee.employeeId, l.type,
            format(new Date(l.startDate), "dd/MM/yyyy"), format(new Date(l.endDate), "dd/MM/yyyy"),
            String(l.days), l.status, l.reason || "", format(new Date(l.createdAt), "dd/MM/yyyy"),
        ])
        const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
        const a = document.createElement("a")
        a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
        a.download = `leaves_${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        toast.success(`Exported ${leaves.length} leaves`)
    }

    const totalPages = Math.max(1, Math.ceil(leaves.length / perPage))
    const safePage = Math.min(page, totalPages)
    const pageRows = leaves.slice((safePage - 1) * perPage, safePage * perPage)

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-[26px] font-bold tracking-[-0.5px] text-[var(--text)]">Leaves</h1>
                    <p className="text-[13.5px] text-[var(--text3)] mt-1">Manage employee leave requests and approvals.</p>
                </div>
                <div className="flex items-center gap-2.5">
                    <button onClick={exportCsv}
                        className="inline-flex items-center gap-2 h-[42px] px-4 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] text-[13px] font-semibold text-[var(--text2)] hover:bg-[var(--surface2)]">
                        <Download size={16} /> Export
                    </button>
                    <button onClick={() => setShowApply(true)}
                        className="inline-flex items-center gap-2 h-[42px] px-5 bg-[var(--accent)] text-white rounded-[10px] text-[13px] font-semibold hover:opacity-90 transition-opacity"
                        style={{ boxShadow: "0 1px 3px rgba(26,158,110,0.35)" }}>
                        <Plus size={16} /> Apply Leave
                    </button>
                </div>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                {statsCards.map(s => (
                    <div key={s.label} className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-[18px] flex items-center gap-3.5">
                        <div style={{ background: s.bg }} className="w-11 h-11 rounded-[12px] flex items-center justify-center shrink-0">
                            <s.icon size={20} style={{ color: s.color }} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[12px] text-[var(--text3)] whitespace-nowrap">{s.label}</p>
                            <p className="text-[24px] font-bold leading-tight tabular-nums" style={{ color: s.color }}>{s.value}</p>
                            <p className="text-[11px] text-[var(--text3)]">{s.sub}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Filter tabs + search */}
            <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center gap-1">
                    {(["", "PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const).map(s => (
                        <button key={s} onClick={() => setStatusFilter(s)}
                            className={`px-3.5 h-9 rounded-[9px] text-[12.5px] font-semibold transition-colors ${statusFilter === s ? "bg-[var(--accent)] text-white" : "text-[var(--text2)] hover:bg-[var(--surface2)]"}`}>
                            {s === "" ? "All" : STATUS_CONFIG[s]?.label}
                        </button>
                    ))}
                </div>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                    className="h-9 px-3 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] text-[12.5px] text-[var(--text2)] outline-none cursor-pointer">
                    <option value="">All Types</option>
                    {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
                    className="h-9 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[12.5px] text-[var(--text2)] outline-none cursor-pointer" />
                {(monthFilter || typeFilter || statusFilter) && (
                    <button onClick={() => { setMonthFilter(""); setTypeFilter(""); setStatusFilter("") }}
                        className="inline-flex items-center gap-1 h-9 px-3 rounded-[9px] text-[12.5px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)]">
                        <X size={13} /> Clear
                    </button>
                )}
                <div className="relative flex-1 min-w-[200px] max-w-[320px] ml-auto">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by employee name or ID..."
                        className="w-full h-9 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] pl-9 pr-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors" />
                </div>
            </div>

            {/* Leave Table */}
            {loading ? (
                <div className="flex items-center justify-center py-16"><Loader2 size={28} className="animate-spin text-[var(--accent)]" /></div>
            ) : leaves.length === 0 ? (
                <div className="flex min-h-[250px] flex-col items-center justify-center rounded-[14px] bg-[var(--surface)] border border-dashed border-[var(--border)]">
                    <CalendarOff size={36} className="text-[var(--text3)] mb-2" />
                    <p className="text-[14px] font-semibold text-[var(--text)]">No leave requests</p>
                    <p className="text-[13px] text-[var(--text3)] mt-1">No matching leaves found</p>
                </div>
            ) : (
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full" style={{ minWidth: 900 }}>
                            <thead>
                                <tr className="border-b border-[var(--border)]">
                                    <th className="text-left text-[11.5px] font-semibold text-[var(--text3)] px-5 py-3.5 whitespace-nowrap">Employee</th>
                                    <th className="text-left text-[11.5px] font-semibold text-[var(--text3)] px-4 py-3.5 whitespace-nowrap">Type</th>
                                    <th className="text-left text-[11.5px] font-semibold text-[var(--text3)] px-4 py-3.5 whitespace-nowrap">Duration</th>
                                    <th className="text-left text-[11.5px] font-semibold text-[var(--text3)] px-4 py-3.5 max-w-[160px] whitespace-nowrap">Reason</th>
                                    <th className="text-left text-[11.5px] font-semibold text-[var(--text3)] px-4 py-3.5 whitespace-nowrap">Status</th>
                                    <th className="text-left text-[11.5px] font-semibold text-[var(--text3)] px-4 py-3.5 whitespace-nowrap">Applied</th>
                                    <th className="text-right text-[11.5px] font-semibold text-[var(--text3)] px-5 py-3.5 whitespace-nowrap">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pageRows.map((leave, i) => (
                                    <tr key={leave.id}
                                        onClick={() => setSelectedLeave(leave)}
                                        className={`border-b border-[var(--border)] hover:bg-[var(--surface2)] transition-colors cursor-pointer ${i === pageRows.length - 1 ? "border-b-0" : ""}`}>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-3">
                                                <Avatar firstName={leave.employee.firstName} lastName={leave.employee.lastName} photo={leave.employee.photo} />
                                                <div>
                                                    <p className="text-[13px] font-semibold text-[var(--text)]">{leave.employee.firstName} {leave.employee.lastName}</p>
                                                    <p className="text-[11px] font-mono text-[var(--text3)]">{leave.employee.employeeId}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <LeaveTypeBadge type={leave.type} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-[13px] text-[var(--text)]">
                                                {format(new Date(leave.startDate), "dd MMM")} — {format(new Date(leave.endDate), "dd MMM yy")}
                                            </p>
                                            <p className="text-[11px] text-[var(--text3)]">{leave.days} day{leave.days !== 1 ? "s" : ""}</p>
                                        </td>
                                        <td className="px-4 py-3 max-w-[160px]">
                                            <p className="text-[12px] text-[var(--text2)] truncate">{leave.reason || "—"}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge status={leave.status} />
                                        </td>
                                        <td className="px-4 py-3 text-[12px] text-[var(--text3)]">
                                            {format(new Date(leave.createdAt), "dd MMM yyyy")}
                                        </td>
                                        <td className="px-5 py-3 text-right" onClick={e => e.stopPropagation()}>
                                            {isAdminOrManager && leave.status === "PENDING" && (
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button onClick={() => setSelectedLeave(leave)}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[7px] border border-[#fecaca] bg-[#fef2f2] text-[#dc2626] text-[11px] font-medium hover:bg-[#fee2e2] transition-colors">
                                                        <XCircle size={11} /> Reject
                                                    </button>
                                                    <button onClick={async (e) => {
                                                        e.stopPropagation()
                                                        try {
                                                            const res = await fetch(`/api/leaves/${leave.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "APPROVED" }) })
                                                            if (!res.ok) throw new Error(await res.text())
                                                            toast.success("Leave approved!")
                                                            fetchLeaves()
                                                        } catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Failed") }
                                                    }}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[7px] border border-[#6ee7b7] bg-[#e8f7f1] text-[#1a9e6e] text-[11px] font-medium hover:bg-[#d1f5e6] transition-colors">
                                                        <CheckCircle size={11} /> Approve
                                                    </button>
                                                </div>
                                            )}
                                            {!isAdminOrManager && leave.status === "PENDING" && (
                                                <button onClick={e => { e.stopPropagation(); setSelectedLeave(leave) }}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[7px] border border-[var(--border)] text-[11px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors">
                                                    Cancel
                                                </button>
                                            )}
                                            {leave.status !== "PENDING" && (
                                                <button onClick={e => { e.stopPropagation(); setSelectedLeave(leave) }}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[7px] border border-[var(--border)] text-[11px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors">
                                                    <User size={11} /> View
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)] flex-wrap gap-3">
                        <span className="text-[12.5px] text-[var(--text3)]">
                            Showing {(safePage - 1) * perPage + 1} to {(safePage - 1) * perPage + pageRows.length} of {leaves.length} requests
                        </span>
                        <div className="flex items-center gap-3">
                            {totalPages > 1 && (
                                <div className="flex items-center gap-1.5">
                                    <button disabled={safePage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                                        className="w-9 h-9 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] flex items-center justify-center text-[var(--text2)] disabled:opacity-40">
                                        <ChevronLeft size={16} />
                                    </button>
                                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                        const start = Math.max(1, Math.min(totalPages - 4, safePage - 2))
                                        const p = start + i
                                        if (p > totalPages) return null
                                        return (
                                            <button key={p} onClick={() => setPage(p)}
                                                className="min-w-[36px] h-9 rounded-[9px] text-[13px] font-semibold"
                                                style={{
                                                    border: p === safePage ? "1px solid var(--accent)" : "1px solid var(--border)",
                                                    background: p === safePage ? "var(--accent)" : "var(--surface)",
                                                    color: p === safePage ? "#fff" : "var(--text2)",
                                                }}>{p}</button>
                                        )
                                    })}
                                    <button disabled={safePage === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        className="w-9 h-9 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] flex items-center justify-center text-[var(--text2)] disabled:opacity-40">
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            )}
                            <select value={perPage} onChange={e => setPerPage(Number(e.target.value))}
                                className="h-9 px-3 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] text-[12.5px] text-[var(--text2)] outline-none cursor-pointer">
                                {[25, 50, 100].map(n => <option key={n} value={n}>{n} per page</option>)}
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {/* Drawer */}
            <LeaveDrawer
                leave={selectedLeave}
                onClose={() => setSelectedLeave(null)}
                onUpdated={fetchLeaves}
                isAdminOrManager={isAdminOrManager}
            />

            {/* Apply Modal */}
            <ApplyLeaveModal open={showApply} onClose={() => setShowApply(false)} onSaved={fetchLeaves} />
        </div>
    )
}
