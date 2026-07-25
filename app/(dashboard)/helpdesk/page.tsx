"use client"
import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { can } from "@/lib/can"
import {
    Plus, Search, Loader2, X, Headphones,
    Clock, CheckCircle2, AlertCircle, Timer,
    ChevronRight, Send, Lock, User, Calendar
} from "lucide-react"
import { format, formatDistanceToNow } from "date-fns"

// ─── Types ─────────────────────────────────────────────────────────────────────

type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED"
type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT"

type TicketUser = {
    id: string
    name: string
    email: string
}

type Comment = {
    id: string
    ticketId: string
    userId: string
    content: string
    isInternal: boolean
    createdAt: string
    user: TicketUser | null
}

type Ticket = {
    id: string
    ticketNo: string
    title: string
    description: string
    category: string
    priority: TicketPriority
    status: TicketStatus
    raisedBy: string
    assignedTo: string | null
    employeeId: string | null
    resolvedAt: string | null
    closedAt: string | null
    dueDate: string | null
    createdAt: string
    updatedAt: string
    raisedByUser: TicketUser | null
    assignedToUser: TicketUser | null
    _count?: { comments: number }
    comments?: Comment[]
}

type Employee = {
    id: string
    firstName: string
    lastName: string
    employeeId: string
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = ["IT", "HR", "Payroll", "Attendance", "General", "Compliance", "Other"]
const PRIORITIES: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"]
const STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]

// ─── Helpers ───────────────────────────────────────────────────────────────────

function priorityBadge(priority: TicketPriority) {
    const map: Record<TicketPriority, { bg: string; color: string; label: string }> = {
        URGENT: { bg: "#fef2f2", color: "#ef4444", label: "Urgent" },
        HIGH: { bg: "#fff7ed", color: "#f97316", label: "High" },
        MEDIUM: { bg: "#fffbeb", color: "#f59e0b", label: "Medium" },
        LOW: { bg: "#f9fafb", color: "#6b7280", label: "Low" },
    }
    return map[priority]
}

function statusBadge(status: TicketStatus) {
    const map: Record<TicketStatus, { bg: string; color: string; label: string }> = {
        OPEN: { bg: "#eff6ff", color: "#3b82f6", label: "Open" },
        IN_PROGRESS: { bg: "#fffbeb", color: "#f59e0b", label: "In Progress" },
        RESOLVED: { bg: "#e8f7f1", color: "#1a9e6e", label: "Resolved" },
        CLOSED: { bg: "#f9fafb", color: "#6b7280", label: "Closed" },
    }
    return map[status]
}

function categoryColor(cat: string): { bg: string; color: string } {
    const map: Record<string, { bg: string; color: string }> = {
        IT: { bg: "#eff6ff", color: "#3b82f6" },
        HR: { bg: "#fdf4ff", color: "#a855f7" },
        Payroll: { bg: "#f0fdf4", color: "#22c55e" },
        Attendance: { bg: "#fff7ed", color: "#f97316" },
        General: { bg: "#f0f9ff", color: "#0ea5e9" },
        Compliance: { bg: "#fef2f2", color: "#ef4444" },
        Other: { bg: "#f9fafb", color: "#6b7280" },
    }
    return map[cat] || { bg: "#f9fafb", color: "#6b7280" }
}

function avatarColors(name: string) {
    const colors = ["#1a9e6e", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#0ea5e9"]
    const idx = name ? name.charCodeAt(0) % colors.length : 0
    return colors[idx]
}

function UserAvatar({ name, size = 32 }: { name: string; size?: number }) {
    const initials = name
        ? name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2)
        : "?"
    const bg = avatarColors(name || "")
    return (
        <div
            style={{ width: size, height: size, background: bg, fontSize: size * 0.35 }}
            className="rounded-full flex items-center justify-center text-white font-semibold shrink-0"
        >
            {initials}
        </div>
    )
}

// ─── New Ticket Modal ──────────────────────────────────────────────────────────

function NewTicketModal({
    open, onClose, onSaved
}: { open: boolean; onClose: () => void; onSaved: () => void }) {
    const [loading, setLoading] = useState(false)
    const [employees, setEmployees] = useState<Employee[]>([])
    const [empSearch, setEmpSearch] = useState("")
    const [form, setForm] = useState({
        title: "",
        description: "",
        category: "IT",
        priority: "MEDIUM" as TicketPriority,
        employeeId: "",
        dueDate: "",
    })

    useEffect(() => {
        if (open) {
            setForm({ title: "", description: "", category: "IT", priority: "MEDIUM", employeeId: "", dueDate: "" })
            setEmpSearch("")
            fetch("/api/employees?status=ACTIVE&limit=200")
                .then(r => r.ok ? r.json() : [])
                .then(data => setEmployees(Array.isArray(data) ? data : []))
                .catch(() => setEmployees([]))
        }
    }, [open])

    const filteredEmps = employees.filter(e => {
        if (!empSearch) return true
        const q = empSearch.toLowerCase()
        return (
            e.firstName.toLowerCase().includes(q) ||
            e.lastName.toLowerCase().includes(q) ||
            e.employeeId.toLowerCase().includes(q)
        )
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const res = await fetch("/api/helpdesk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...form,
                    employeeId: form.employeeId || undefined,
                    dueDate: form.dueDate || undefined,
                }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Ticket created!")
            onSaved()
            onClose()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to create ticket")
        } finally {
            setLoading(false)
        }
    }

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-[16px] border border-[var(--border)] w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] sticky top-0 bg-white rounded-t-[16px]">
                    <h2 className="text-[15px] font-semibold text-[var(--text)]">New Ticket</h2>
                    <button onClick={onClose} className="p-1 text-[var(--text3)] hover:text-[var(--text)] rounded-md hover:bg-[var(--surface2)] transition-colors">
                        <X size={18} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="block text-[12px] text-[var(--text2)] mb-1">Title *</label>
                        <input
                            value={form.title}
                            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                            placeholder="Brief description of the issue"
                            className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-[12px] text-[var(--text2)] mb-1">Description *</label>
                        <textarea
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Detailed description of the issue..."
                            className="w-full rounded-[8px] border border-[var(--border)] bg-white px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors resize-none"
                            rows={4}
                            required
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[12px] text-[var(--text2)] mb-1">Category *</label>
                            <select
                                value={form.category}
                                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                                className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                                required
                            >
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[12px] text-[var(--text2)] mb-1">Priority *</label>
                            <select
                                value={form.priority}
                                onChange={e => setForm(f => ({ ...f, priority: e.target.value as TicketPriority }))}
                                className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                                required
                            >
                                {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-[12px] text-[var(--text2)] mb-1">Related Employee (optional)</label>
                        <input
                            value={empSearch}
                            onChange={e => setEmpSearch(e.target.value)}
                            placeholder="Search employee..."
                            className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors mb-1"
                        />
                        <select
                            value={form.employeeId}
                            onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}
                            className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                        >
                            <option value="">None</option>
                            {filteredEmps.slice(0, 50).map(e => (
                                <option key={e.id} value={e.id}>
                                    {e.firstName} {e.lastName} ({e.employeeId})
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[12px] text-[var(--text2)] mb-1">Due Date (optional)</label>
                        <input
                            type="date"
                            value={form.dueDate}
                            onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                            className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                        />
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-1">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-[var(--text2)] hover:text-[var(--text)] rounded-[8px] hover:bg-[var(--surface2)] transition-colors">
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="inline-flex items-center gap-2 px-5 py-2 bg-[var(--accent)] text-white rounded-[8px] text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                            {loading && <Loader2 size={14} className="animate-spin" />}
                            Create Ticket
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// ─── Ticket Detail Drawer ──────────────────────────────────────────────────────

function TicketDrawer({
    ticket,
    onClose,
    onUpdated,
    isPrivileged,
    users,
}: {
    ticket: Ticket
    onClose: () => void
    onUpdated: () => void
    isPrivileged: boolean
    users: TicketUser[]
}) {
    const [detail, setDetail] = useState<Ticket | null>(null)
    const [loading, setLoading] = useState(true)
    const [comment, setComment] = useState("")
    const [isInternal, setIsInternal] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [updatingStatus, setUpdatingStatus] = useState(false)

    const fetchDetail = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/helpdesk/${ticket.id}`)
            if (!res.ok) throw new Error("Failed to fetch")
            const data = await res.json()
            setDetail(data)
        } catch {
            toast.error("Failed to load ticket details")
        } finally {
            setLoading(false)
        }
    }, [ticket.id])

    useEffect(() => { fetchDetail() }, [fetchDetail])

    const handleStatusChange = async (newStatus: TicketStatus) => {
        if (!detail || detail.status === newStatus) return
        setUpdatingStatus(true)
        try {
            const res = await fetch(`/api/helpdesk/${ticket.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success(`Status updated to ${newStatus.replace("_", " ")}`)
            onUpdated()
            await fetchDetail()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to update")
        } finally {
            setUpdatingStatus(false)
        }
    }

    const handleAssign = async (userId: string) => {
        try {
            const res = await fetch(`/api/helpdesk/${ticket.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assignedTo: userId || null }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Ticket assigned!")
            onUpdated()
            await fetchDetail()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to assign")
        }
    }

    const handleComment = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!comment.trim()) return
        setSubmitting(true)
        try {
            const res = await fetch(`/api/helpdesk/${ticket.id}/comment`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: comment.trim(), isInternal }),
            })
            if (!res.ok) throw new Error(await res.text())
            setComment("")
            setIsInternal(false)
            await fetchDetail()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to post comment")
        } finally {
            setSubmitting(false)
        }
    }

    const t = detail || ticket
    const sb = statusBadge(t.status)
    const pb = priorityBadge(t.priority)
    const cc = categoryColor(t.category)

    return (
        <div className="fixed inset-0 z-40 flex">
            {/* Backdrop */}
            <div className="flex-1 bg-black/30" onClick={onClose} />
            {/* Drawer */}
            <div className="w-full max-w-[520px] bg-white border-l border-[var(--border)] flex flex-col h-full shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-start justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
                    <div className="flex-1 min-w-0 pr-3">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-[13px] font-bold text-[var(--accent)]">{t.ticketNo}</span>
                            <span
                                className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                                style={{ background: sb.bg, color: sb.color }}
                            >
                                {sb.label}
                            </span>
                        </div>
                        <h2 className="text-[15px] font-semibold text-[var(--text)] leading-tight">{t.title}</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-[var(--text3)] hover:text-[var(--text)] rounded-[6px] hover:bg-[var(--surface2)] transition-colors shrink-0">
                        <X size={18} />
                    </button>
                </div>

                {loading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto">
                        {/* Meta */}
                        <div className="px-5 py-4 border-b border-[var(--border)] grid grid-cols-2 gap-3">
                            <div>
                                <p className="text-[11px] text-[var(--text3)] mb-0.5">Category</p>
                                <span
                                    className="text-[12px] font-medium px-2 py-0.5 rounded-full"
                                    style={{ background: cc.bg, color: cc.color }}
                                >
                                    {t.category}
                                </span>
                            </div>
                            <div>
                                <p className="text-[11px] text-[var(--text3)] mb-0.5">Priority</p>
                                <span
                                    className="text-[12px] font-medium px-2 py-0.5 rounded-full"
                                    style={{ background: pb.bg, color: pb.color }}
                                >
                                    {pb.label}
                                </span>
                            </div>
                            <div>
                                <p className="text-[11px] text-[var(--text3)] mb-0.5">Raised by</p>
                                <p className="text-[12px] font-medium text-[var(--text)]">{t.raisedByUser?.name || t.raisedBy}</p>
                            </div>
                            <div>
                                <p className="text-[11px] text-[var(--text3)] mb-0.5">Created</p>
                                <p className="text-[12px] font-medium text-[var(--text)]">{format(new Date(t.createdAt), "dd MMM yyyy, HH:mm")}</p>
                            </div>
                            {t.dueDate && (
                                <div>
                                    <p className="text-[11px] text-[var(--text3)] mb-0.5">Due Date</p>
                                    <p className="text-[12px] font-medium text-[var(--text)]">{format(new Date(t.dueDate), "dd MMM yyyy")}</p>
                                </div>
                            )}
                            {t.resolvedAt && (
                                <div>
                                    <p className="text-[11px] text-[var(--text3)] mb-0.5">Resolved At</p>
                                    <p className="text-[12px] font-medium text-[var(--text)]">{format(new Date(t.resolvedAt), "dd MMM yyyy, HH:mm")}</p>
                                </div>
                            )}
                        </div>

                        {/* Status Pipeline */}
                        <div className="px-5 py-4 border-b border-[var(--border)]">
                            <p className="text-[11px] text-[var(--text3)] mb-3 font-semibold uppercase tracking-wide">Status Pipeline</p>
                            <div className="flex items-center gap-1">
                                {STATUSES.map((s, i) => {
                                    const sb2 = statusBadge(s)
                                    const currentIdx = STATUSES.indexOf(t.status)
                                    const isDone = i <= currentIdx
                                    const isCurrent = s === t.status
                                    return (
                                        <div key={s} className="flex items-center flex-1">
                                            <button
                                                onClick={() => isPrivileged && !updatingStatus && handleStatusChange(s)}
                                                disabled={!isPrivileged || updatingStatus}
                                                className={`flex-1 py-1.5 px-1 text-[10.5px] font-semibold rounded-[6px] text-center transition-all ${
                                                    isCurrent
                                                        ? "text-white"
                                                        : isDone
                                                        ? "opacity-60"
                                                        : "opacity-30"
                                                } ${isPrivileged ? "hover:opacity-100 cursor-pointer" : "cursor-default"}`}
                                                style={{
                                                    background: isDone ? sb2.color : "var(--surface2)",
                                                    color: isDone ? "white" : "var(--text3)",
                                                }}
                                            >
                                                {s.replace("_", " ")}
                                            </button>
                                            {i < STATUSES.length - 1 && (
                                                <ChevronRight size={12} className="text-[var(--text3)] shrink-0 mx-0.5" />
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Assign To */}
                        {isPrivileged && (
                            <div className="px-5 py-4 border-b border-[var(--border)]">
                                <p className="text-[11px] text-[var(--text3)] mb-2 font-semibold uppercase tracking-wide">Assign To</p>
                                <select
                                    value={t.assignedTo || ""}
                                    onChange={e => handleAssign(e.target.value)}
                                    className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                                >
                                    <option value="">Unassigned</option>
                                    {users.map(u => (
                                        <option key={u.id} value={u.id}>{u.name}</option>
                                    ))}
                                </select>
                                {t.assignedToUser && (
                                    <p className="text-[11px] text-[var(--text3)] mt-1">
                                        Currently: <span className="font-medium text-[var(--text)]">{t.assignedToUser.name}</span>
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Description */}
                        <div className="px-5 py-4 border-b border-[var(--border)]">
                            <p className="text-[11px] text-[var(--text3)] mb-2 font-semibold uppercase tracking-wide">Description</p>
                            <p className="text-[13px] text-[var(--text)] leading-relaxed whitespace-pre-wrap">{t.description}</p>
                        </div>

                        {/* Comments */}
                        <div className="px-5 py-4">
                            <p className="text-[11px] text-[var(--text3)] mb-3 font-semibold uppercase tracking-wide">
                                Comments ({detail?.comments?.length ?? 0})
                            </p>
                            <div className="space-y-3 mb-4">
                                {detail?.comments?.length === 0 && (
                                    <p className="text-[13px] text-[var(--text3)] text-center py-4">No comments yet</p>
                                )}
                                {detail?.comments?.map(c => (
                                    <div
                                        key={c.id}
                                        className={`rounded-[10px] p-3 ${c.isInternal ? "border border-amber-200 bg-amber-50" : "bg-[var(--surface2)]"}`}
                                    >
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <UserAvatar name={c.user?.name || "?"} size={24} />
                                            <span className="text-[12px] font-semibold text-[var(--text)]">{c.user?.name || "Unknown"}</span>
                                            {c.isInternal && (
                                                <span className="flex items-center gap-1 text-[10px] text-amber-600 font-medium">
                                                    <Lock size={10} /> Internal Note
                                                </span>
                                            )}
                                            <span className="text-[11px] text-[var(--text3)] ml-auto">
                                                {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                                            </span>
                                        </div>
                                        <p className="text-[13px] text-[var(--text)] leading-relaxed whitespace-pre-wrap">{c.content}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Add Comment */}
                            <form onSubmit={handleComment} className="space-y-2">
                                <textarea
                                    value={comment}
                                    onChange={e => setComment(e.target.value)}
                                    placeholder="Add a comment..."
                                    className="w-full rounded-[8px] border border-[var(--border)] bg-white px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors resize-none"
                                    rows={3}
                                />
                                <div className="flex items-center justify-between">
                                    {isPrivileged && (
                                        <label className="flex items-center gap-1.5 text-[12px] text-[var(--text2)] cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={isInternal}
                                                onChange={e => setIsInternal(e.target.checked)}
                                                className="rounded"
                                            />
                                            <Lock size={12} /> Internal note
                                        </label>
                                    )}
                                    <div className={isPrivileged ? "" : "ml-auto"}>
                                        <button
                                            type="submit"
                                            disabled={submitting || !comment.trim()}
                                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--accent)] text-white rounded-[8px] text-[12px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                                        >
                                            {submitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                            Post
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function HelpdeskPage() {
    const { data: session, status } = useSession()
    const router = useRouter()

    const [tickets, setTickets] = useState<Ticket[]>([])
    const [loading, setLoading] = useState(true)
    const [users, setUsers] = useState<TicketUser[]>([])

    const [statusFilter, setStatusFilter] = useState<string>("ALL")
    const [priorityFilter, setPriorityFilter] = useState<string>("ALL")
    const [categoryFilter, setCategoryFilter] = useState<string>("ALL")
    const [search, setSearch] = useState("")

    const [showNew, setShowNew] = useState(false)
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)

    const isPrivileged = can(session, "helpdesk.view")

    useEffect(() => {
        if (status === "unauthenticated") router.push("/login")
    }, [status, router])

    useEffect(() => {
        if (status === "authenticated" && isPrivileged) {
            fetch("/api/admin/users")
                .then(r => r.ok ? r.json() : [])
                .then(data => setUsers(Array.isArray(data) ? data : []))
                .catch(() => setUsers([]))
        }
    }, [status, isPrivileged])

    const fetchTickets = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (statusFilter !== "ALL") params.set("status", statusFilter)
            if (priorityFilter !== "ALL") params.set("priority", priorityFilter)
            if (categoryFilter !== "ALL") params.set("category", categoryFilter)
            if (search) params.set("search", search)
            const res = await fetch(`/api/helpdesk?${params}`)
            if (!res.ok) throw new Error("Failed to fetch")
            const data = await res.json()
            setTickets(Array.isArray(data) ? data : [])
        } catch {
            toast.error("Failed to load tickets")
        } finally {
            setLoading(false)
        }
    }, [statusFilter, priorityFilter, categoryFilter, search])

    useEffect(() => {
        if (status === "authenticated") fetchTickets()
    }, [status, fetchTickets])

    // Stats
    const openCount = tickets.filter(t => t.status === "OPEN").length
    const inProgressCount = tickets.filter(t => t.status === "IN_PROGRESS").length
    const today = new Date()
    const resolvedToday = tickets.filter(t => {
        if (t.status !== "RESOLVED" || !t.resolvedAt) return false
        const d = new Date(t.resolvedAt)
        return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()
    }).length

    const avgResolution = (() => {
        const resolved = tickets.filter(t => t.resolvedAt && t.createdAt)
        if (resolved.length === 0) return 0
        const total = resolved.reduce((sum, t) => {
            const diff = new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()
            return sum + diff / (1000 * 60 * 60)
        }, 0)
        return Math.round(total / resolved.length)
    })()

    if (status === "loading") {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={28} className="animate-spin text-[var(--accent)]" />
            </div>
        )
    }

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-[26px] font-bold tracking-[-0.5px] text-[var(--text)]">Helpdesk</h1>
                    <p className="text-[13.5px] text-[var(--text3)] mt-1">Manage and track support tickets.</p>
                </div>
                <button
                    onClick={() => setShowNew(true)}
                    className="inline-flex items-center gap-2 bg-[var(--accent)] text-white rounded-[10px] text-[13px] font-semibold h-[42px] px-5 hover:opacity-90 transition-opacity"
                    style={{ boxShadow: "0 1px 3px rgba(26,158,110,0.35)" }}
                >
                    <Plus size={16} /> New Ticket
                </button>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                {[
                    { label: "Open Tickets", value: openCount, color: "#3b82f6", bg: "#eff6ff", icon: <AlertCircle size={20} /> },
                    { label: "In Progress", value: inProgressCount, color: "#d97706", bg: "#fef3c7", icon: <Timer size={20} /> },
                    { label: "Resolved Today", value: resolvedToday, color: "#1a9e6e", bg: "#e8f7f1", icon: <CheckCircle2 size={20} /> },
                    { label: "Avg Resolution (hrs)", value: avgResolution, color: "#8b5cf6", bg: "#f5f3ff", icon: <Clock size={20} /> },
                ].map(s => (
                    <div key={s.label} className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-[18px] flex items-center gap-3.5">
                        <div style={{ background: s.bg, color: s.color }} className="w-11 h-11 rounded-[12px] flex items-center justify-center shrink-0">
                            {s.icon}
                        </div>
                        <div className="min-w-0">
                            <p className="text-[12px] text-[var(--text3)]">{s.label}</p>
                            <p className="text-[24px] font-bold leading-tight tabular-nums" style={{ color: s.color }}>{s.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="bg-white border border-[var(--border)] rounded-[12px] p-4 space-y-3">
                {/* Status pills */}
                <div className="flex flex-wrap gap-2">
                    {[
                        { label: "All", value: "ALL" },
                        { label: "Open", value: "OPEN" },
                        { label: "In Progress", value: "IN_PROGRESS" },
                        { label: "Resolved", value: "RESOLVED" },
                        { label: "Closed", value: "CLOSED" },
                    ].map(s => (
                        <button
                            key={s.value}
                            onClick={() => setStatusFilter(s.value)}
                            className={`px-3 py-1.5 rounded-[7px] text-[12px] font-medium transition-colors ${statusFilter === s.value
                                ? "bg-[var(--accent)] text-white"
                                : "border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)]"
                                }`}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>

                {/* Dropdowns + Search */}
                <div className="flex flex-wrap items-center gap-2">
                    <select
                        value={priorityFilter}
                        onChange={e => setPriorityFilter(e.target.value)}
                        className="h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                    >
                        <option value="ALL">All Priorities</option>
                        {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
                    </select>
                    <select
                        value={categoryFilter}
                        onChange={e => setCategoryFilter(e.target.value)}
                        className="h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                    >
                        <option value="ALL">All Categories</option>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <div className="relative flex-1 min-w-[200px]">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search tickets..."
                            className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface2)]/30 pl-8 pr-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                        />
                    </div>
                </div>
            </div>

            {/* Ticket List */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 size={28} className="animate-spin text-[var(--accent)]" />
                </div>
            ) : tickets.length === 0 ? (
                <div className="flex min-h-[250px] flex-col items-center justify-center rounded-[14px] bg-white border border-dashed border-[var(--border)]">
                    <Headphones size={36} className="text-[var(--text3)] mb-2" />
                    <p className="text-[14px] font-semibold text-[var(--text)]">No tickets found</p>
                    <p className="text-[13px] text-[var(--text3)] mt-1">Create a new ticket to get started</p>
                </div>
            ) : (
                <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-hidden">
                    <div className="divide-y divide-[var(--border)]">
                        {tickets.map(t => {
                            const sb = statusBadge(t.status)
                            const pb = priorityBadge(t.priority)
                            const cc = categoryColor(t.category)
                            return (
                                <div
                                    key={t.id}
                                    onClick={() => setSelectedTicket(t)}
                                    className="flex items-center gap-4 px-4 py-3.5 hover:bg-[var(--surface2)]/40 cursor-pointer transition-colors"
                                >
                                    {/* Ticket No */}
                                    <span className="font-mono text-[12px] font-bold text-[var(--accent)] shrink-0 w-[80px]">{t.ticketNo}</span>

                                    {/* Title + category */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-medium text-[var(--text)] truncate">{t.title}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span
                                                className="text-[10.5px] font-medium px-1.5 py-0.5 rounded-full"
                                                style={{ background: cc.bg, color: cc.color }}
                                            >
                                                {t.category}
                                            </span>
                                            {t._count && t._count.comments > 0 && (
                                                <span className="text-[11px] text-[var(--text3)]">{t._count.comments} comment{t._count.comments !== 1 ? "s" : ""}</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Priority */}
                                    <span
                                        className="hidden md:inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                                        style={{ background: pb.bg, color: pb.color }}
                                    >
                                        {pb.label}
                                    </span>

                                    {/* Status */}
                                    <span
                                        className="hidden md:inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                                        style={{ background: sb.bg, color: sb.color }}
                                    >
                                        {sb.label}
                                    </span>

                                    {/* Raised by + time */}
                                    <div className="hidden lg:flex items-center gap-1.5 shrink-0 w-[150px]">
                                        <User size={12} className="text-[var(--text3)]" />
                                        <div className="min-w-0">
                                            <p className="text-[11px] text-[var(--text)] truncate">{t.raisedByUser?.name || "Unknown"}</p>
                                            <p className="text-[10px] text-[var(--text3)]">
                                                {formatDistanceToNow(new Date(t.createdAt), { addSuffix: true })}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Assigned to */}
                                    <div className="hidden xl:flex items-center gap-1.5 shrink-0 w-[120px]">
                                        {t.assignedToUser ? (
                                            <>
                                                <UserAvatar name={t.assignedToUser.name} size={20} />
                                                <span className="text-[11px] text-[var(--text)] truncate">{t.assignedToUser.name}</span>
                                            </>
                                        ) : (
                                            <span className="text-[11px] text-[var(--text3)] italic">Unassigned</span>
                                        )}
                                    </div>

                                    {/* Due date */}
                                    {t.dueDate && (
                                        <div className="hidden xl:flex items-center gap-1 shrink-0">
                                            <Calendar size={11} className="text-[var(--text3)]" />
                                            <span className="text-[11px] text-[var(--text3)]">{format(new Date(t.dueDate), "dd MMM")}</span>
                                        </div>
                                    )}

                                    <ChevronRight size={16} className="text-[var(--text3)] shrink-0" />
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Modals / Drawer */}
            <NewTicketModal
                open={showNew}
                onClose={() => setShowNew(false)}
                onSaved={fetchTickets}
            />
            {selectedTicket && (
                <TicketDrawer
                    ticket={selectedTicket}
                    onClose={() => setSelectedTicket(null)}
                    onUpdated={fetchTickets}
                    isPrivileged={isPrivileged}
                    users={users}
                />
            )}
        </div>
    )
}
