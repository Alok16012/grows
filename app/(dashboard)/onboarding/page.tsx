"use client"
import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    Plus, Loader2, X, Search, Users,
    CheckCircle2, Clock, AlertCircle, PauseCircle,
    ChevronDown, Trash2, CalendarDays
} from "lucide-react"
import { format } from "date-fns"

// ─── Types ────────────────────────────────────────────────────────────────────

type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED"
type OnboardingStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "ON_HOLD"

type OnboardingTask = {
    id: string
    title: string
    description?: string
    category: string
    status: TaskStatus
    dueDate?: string | null
    completedAt?: string | null
    completedBy?: string | null
    isRequired: boolean
    order: number
}

type OnboardingRecord = {
    id: string
    status: OnboardingStatus
    startedAt?: string | null
    completedAt?: string | null
    assignedTo?: string | null
    notes?: string | null
    employee: {
        id: string
        firstName: string
        lastName: string
        employeeId: string
        designation?: string | null
        dateOfJoining?: string | null
        photo?: string | null
        branch: { name: string }
        isKycVerified?: boolean
        kycRejectionNote?: string | null
        aadharNumber?: string | null
        panNumber?: string | null
        bankAccountNumber?: string | null
        bankIFSC?: string | null
        bankName?: string | null
        documents?: any[]
        employeeSalary?: any
    }
    tasks: OnboardingTask[]
}

type EmployeeOption = { id: string; firstName: string; lastName: string; employeeId: string }
type UserOption = { id: string; name: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ["#1a9e6e", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#f97316"]

const CATEGORIES = ["All Tasks", "Verification", "Documents", "Welcome Kit", "Training", "Compliance", "IT Setup", "Orientation"]

const CATEGORY_STYLE: Record<string, { bg: string; color: string }> = {
    "Verification": { bg: "#fef2f2", color: "#dc2626" },
    "Documents":    { bg: "#eff6ff", color: "#3b82f6" },
    "Welcome Kit":  { bg: "#fdf4ff", color: "#9333ea" },
    "Training":     { bg: "#fef3c7", color: "#d97706" },
    "Compliance":   { bg: "#fff7ed", color: "#ea580c" },
    "IT Setup":     { bg: "#f0fdf4", color: "#16a34a" },
    "Orientation":  { bg: "#f0f9ff", color: "#0284c7" },
}

const STATUS_CONFIG: Record<OnboardingStatus, { label: string; color: string; bg: string }> = {
    NOT_STARTED: { label: "Not Started", color: "#6b7280", bg: "#f3f4f6" },
    IN_PROGRESS: { label: "In Progress", color: "#d97706", bg: "#fef3c7" },
    COMPLETED:   { label: "Completed",   color: "#1a9e6e", bg: "#e8f7f1" },
    ON_HOLD:     { label: "On Hold",     color: "#ef4444", bg: "#fef2f2" },
}

const TASK_STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
    { value: "PENDING",     label: "Pending" },
    { value: "IN_PROGRESS", label: "In Progress" },
    { value: "COMPLETED",   label: "Completed" },
    { value: "SKIPPED",     label: "Skipped" },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAvatarColor(first: string, last: string) {
    return AVATAR_COLORS[(first.charCodeAt(0) + (last.charCodeAt(0) || 0)) % AVATAR_COLORS.length]
}

function getTaskProgress(tasks: OnboardingTask[]) {
    const total = tasks.length
    const completed = tasks.filter(t => t.status === "COMPLETED" || t.status === "SKIPPED").length
    return { total, completed, pct: total > 0 ? Math.round((completed / total) * 100) : 0 }
}

function fmtDate(d?: string | null) {
    if (!d) return null
    try { return format(new Date(d), "dd MMM yyyy") } catch { return null }
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ firstName, lastName, photo, size = 38 }: {
    firstName: string; lastName: string; photo?: string | null; size?: number
}) {
    const initials = `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase()
    const bg = getAvatarColor(firstName, lastName)
    if (photo) {
        return <img src={photo} alt={`${firstName} ${lastName}`} style={{ width: size, height: size }} className="rounded-full object-cover shrink-0" />
    }
    return (
        <div style={{ width: size, height: size, background: bg, fontSize: size * 0.33 }}
            className="rounded-full flex items-center justify-center text-white font-semibold shrink-0 select-none">
            {initials}
        </div>
    )
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ value, height = 6 }: { value: number; height?: number }) {
    const color = value === 100 ? "#1a9e6e" : value >= 50 ? "#f59e0b" : "#3b82f6"
    return (
        <div className="w-full bg-[var(--surface2)] rounded-full overflow-hidden" style={{ height }}>
            <div style={{ width: `${value}%`, background: color, height }} className="rounded-full transition-all duration-300" />
        </div>
    )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color, bg, icon }: { label: string; value: number; color: string; bg: string; icon: React.ReactNode }) {
    return (
        <div className="bg-white border border-[var(--border)] rounded-[12px] p-4 flex items-center gap-3">
            <div style={{ background: bg, color }} className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0">{icon}</div>
            <div>
                <p className="text-[22px] font-bold text-[var(--text)] leading-tight">{value}</p>
                <p className="text-[11.5px] text-[var(--text3)]">{label}</p>
            </div>
        </div>
    )
}

// ─── Category Dots ────────────────────────────────────────────────────────────

function CategoryBreakdown({ tasks }: { tasks: OnboardingTask[] }) {
    const cats = Object.keys(CATEGORY_STYLE)
    const counts = cats.map(cat => ({
        cat,
        done: tasks.filter(t => t.category === cat && (t.status === "COMPLETED" || t.status === "SKIPPED")).length,
        total: tasks.filter(t => t.category === cat).length,
    })).filter(c => c.total > 0)

    if (counts.length === 0) return null
    return (
        <div className="flex flex-wrap gap-2 mt-2">
            {counts.map(({ cat, done, total }) => {
                const style = CATEGORY_STYLE[cat] || { bg: "#f3f4f6", color: "#6b7280" }
                return (
                    <div key={cat} className="flex items-center gap-1" title={cat}>
                        <div style={{ background: style.color }} className="w-1.5 h-1.5 rounded-full shrink-0" />
                        <span style={{ color: style.color }} className="text-[10.5px] font-medium">{done}/{total}</span>
                    </div>
                )
            })}
        </div>
    )
}

// ─── Start Onboarding Modal ───────────────────────────────────────────────────

function StartOnboardingModal({ open, onClose, onSaved }: {
    open: boolean; onClose: () => void; onSaved: () => void
}) {
    const [loading, setLoading] = useState(false)
    const [employees, setEmployees] = useState<EmployeeOption[]>([])
    const [users, setUsers] = useState<UserOption[]>([])
    const [onboardedIds, setOnboardedIds] = useState<Set<string>>(new Set())
    const [selectedId, setSelectedId] = useState("")
    const [assignedTo, setAssignedTo] = useState("")
    const [notes, setNotes] = useState("")

    useEffect(() => {
        if (!open) return
        Promise.all([
            fetch("/api/employees?status=ACTIVE").then(r => r.json()),
            fetch("/api/onboarding").then(r => r.json()),
            fetch("/api/users").then(r => r.json()).catch(() => []),
        ]).then(([emps, onboarded, usrs]) => {
            setEmployees(Array.isArray(emps) ? emps : [])
            const ids = new Set<string>((Array.isArray(onboarded) ? onboarded : []).map((r: OnboardingRecord) => r.employee.id))
            setOnboardedIds(ids)
            setUsers(Array.isArray(usrs) ? usrs.filter((u: UserOption & { role?: string }) => u.role === "ADMIN" || u.role === "MANAGER") : [])
        }).catch(() => {})
    }, [open])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedId) return
        setLoading(true)
        try {
            const res = await fetch("/api/onboarding", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ employeeId: selectedId, assignedTo: assignedTo || undefined, notes: notes || undefined }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Onboarding started!")
            onSaved()
            onClose()
            setSelectedId("")
            setAssignedTo("")
            setNotes("")
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to start onboarding")
        } finally {
            setLoading(false)
        }
    }

    if (!open) return null
    const available = employees.filter(e => !onboardedIds.has(e.id))

    const selCls = "w-full h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
    const inpCls = "w-full rounded-[8px] border border-[var(--border)] bg-white px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors resize-none"

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-[16px] border border-[var(--border)] w-full max-w-md shadow-xl">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                    <h2 className="text-[15px] font-semibold text-[var(--text)]">Start Onboarding</h2>
                    <button onClick={onClose} className="p-1 text-[var(--text3)] hover:text-[var(--text)] rounded-md hover:bg-[var(--surface2)] transition-colors"><X size={18} /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="block text-[12px] text-[var(--text2)] mb-1.5">Select Employee *</label>
                        <select value={selectedId} onChange={e => setSelectedId(e.target.value)} className={selCls} required>
                            <option value="">Choose employee...</option>
                            {available.map(e => (
                                <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeId})</option>
                            ))}
                        </select>
                        {available.length === 0 && (
                            <p className="text-[11px] text-[var(--text3)] mt-1">All active employees already have onboarding records.</p>
                        )}
                    </div>
                    <div>
                        <label className="block text-[12px] text-[var(--text2)] mb-1.5">Assign To (HR Manager)</label>
                        <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} className={selCls}>
                            <option value="">Select HR manager...</option>
                            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[12px] text-[var(--text2)] mb-1.5">Notes</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes..." className={inpCls} />
                    </div>
                    <div className="bg-[var(--surface2)] rounded-[10px] p-3 text-[12px] text-[var(--text2)]">
                        <p className="font-medium text-[var(--text)] mb-1.5">14 default tasks will be created automatically</p>
                        <p className="text-[11px] text-[var(--text3)]">Documents, Welcome Kit, Orientation, Training, IT Setup, Compliance</p>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-1">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-[var(--text2)] hover:text-[var(--text)] rounded-[8px] hover:bg-[var(--surface2)] transition-colors">Cancel</button>
                        <button type="submit" disabled={loading || !selectedId}
                            className="inline-flex items-center gap-2 px-5 py-2 bg-[var(--accent)] text-white rounded-[8px] text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                            {loading && <Loader2 size={14} className="animate-spin" />}
                            Start Onboarding
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// ─── Task Row ─────────────────────────────────────────────────────────────────

function TaskRow({ task, onboardingId, onUpdated, onDelete }: {
    task: OnboardingTask
    onboardingId: string
    onUpdated: (updated: OnboardingTask) => void
    onDelete: (id: string) => void
}) {
    const [updating, setUpdating] = useState(false)
    const [showDropdown, setShowDropdown] = useState(false)

    const isDone = task.status === "COMPLETED"
    const isSkipped = task.status === "SKIPPED"
    const catStyle = CATEGORY_STYLE[task.category] || { bg: "#f3f4f6", color: "#6b7280" }

    const handleStatusChange = async (newStatus: TaskStatus) => {
        setUpdating(true)
        setShowDropdown(false)
        try {
            const res = await fetch(`/api/onboarding/${onboardingId}/tasks/${task.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            })
            if (!res.ok) throw new Error(await res.text())
            const updated = await res.json()
            onUpdated({ ...task, status: updated.status, completedAt: updated.completedAt, completedBy: updated.completedBy })
            toast.success("Task updated")
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Update failed")
        } finally {
            setUpdating(false)
        }
    }

    const handleCheckToggle = () => {
        if (isDone) handleStatusChange("PENDING")
        else handleStatusChange("COMPLETED")
    }

    const handleDelete = async () => {
        if (!confirm("Delete this custom task?")) return
        try {
            const res = await fetch(`/api/onboarding/${onboardingId}/tasks/${task.id}`, { method: "DELETE" })
            if (!res.ok) throw new Error(await res.text())
            onDelete(task.id)
            toast.success("Task deleted")
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Delete failed")
        }
    }

    return (
        <div className={`flex items-start gap-3 p-3.5 rounded-[10px] border transition-colors ${isDone ? "bg-[#f0fdf4] border-[#bbf7d0]" : isSkipped ? "bg-[var(--surface2)]/40 border-[var(--border)]" : "bg-white border-[var(--border)]"}`}>
            {/* Checkbox */}
            <button
                onClick={handleCheckToggle}
                disabled={updating}
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${isDone ? "bg-[#1a9e6e] border-[#1a9e6e]" : "border-[var(--border)] hover:border-[var(--accent)]"}`}
            >
                {updating ? <Loader2 size={10} className="animate-spin text-[var(--text3)]" /> : isDone ? <CheckCircle2 size={11} className="text-white" /> : null}
            </button>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <p className={`text-[13px] font-medium leading-tight ${isDone ? "line-through text-[var(--text3)]" : isSkipped ? "line-through italic text-[var(--text3)]" : "text-[var(--text)]"}`}>
                    {task.title}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span style={{ background: catStyle.bg, color: catStyle.color }} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-[4px]">
                        {task.category}
                    </span>
                    {task.dueDate && (
                        <span className="text-[11px] text-[var(--text3)] flex items-center gap-1">
                            <CalendarDays size={10} />
                            {fmtDate(task.dueDate)}
                        </span>
                    )}
                    {isDone && task.completedBy && (
                        <span className="text-[11px] text-[#1a9e6e]">
                            by {task.completedBy}{task.completedAt ? ` · ${fmtDate(task.completedAt)}` : ""}
                        </span>
                    )}
                    {isSkipped && <span className="text-[11px] text-[var(--text3)] italic">Skipped</span>}
                    {!task.isRequired && <span className="text-[10px] text-[var(--text3)] bg-[var(--surface2)] px-1.5 py-0.5 rounded-[4px]">Custom</span>}
                </div>
            </div>

            {/* Status dropdown */}
            <div className="relative shrink-0">
                <button
                    onClick={() => setShowDropdown(v => !v)}
                    className="flex items-center gap-1 text-[11px] text-[var(--text2)] border border-[var(--border)] rounded-[6px] px-2 py-1 hover:bg-[var(--surface2)] transition-colors"
                >
                    {TASK_STATUS_OPTIONS.find(o => o.value === task.status)?.label || task.status}
                    <ChevronDown size={10} />
                </button>
                {showDropdown && (
                    <div className="absolute right-0 top-full mt-1 bg-white border border-[var(--border)] rounded-[8px] shadow-lg z-20 min-w-[120px] overflow-hidden">
                        {TASK_STATUS_OPTIONS.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => handleStatusChange(opt.value)}
                                className={`w-full text-left px-3 py-2 text-[12px] hover:bg-[var(--surface2)] transition-colors ${task.status === opt.value ? "font-semibold text-[var(--accent)]" : "text-[var(--text)]"}`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Delete custom task */}
            {!task.isRequired && (
                <button onClick={handleDelete} className="shrink-0 p-1 text-[var(--text3)] hover:text-[var(--red)] rounded transition-colors mt-0.5">
                    <Trash2 size={13} />
                </button>
            )}
        </div>
    )
}

// ─── Verification Panel ───────────────────────────────────────────────────────

function VerificationPanel({ record, onUpdated }: { record: OnboardingRecord, onUpdated: () => void }) {
    const emp = record.employee
    const [submitting, setSubmitting] = useState(false)
    const [ctc, setCtc] = useState(emp.employeeSalary?.ctcAnnual?.toString() || "")
    const [kycRejectNote, setKycRejectNote] = useState(emp.kycRejectionNote || "")

    const handleKycStatus = async (status: "VERIFIED" | "REJECTED") => {
        if (status === "REJECTED" && !kycRejectNote) return toast.error("Rejection reason required")
        setSubmitting(true)
        try {
            const res = await fetch("/api/onboarding/verify", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "KYC", employeeId: emp.id, status, rejectionReason: status === "REJECTED" ? kycRejectNote : null })
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success(`KYC ${status}`)
            onUpdated()
        } catch (e: any) { toast.error(e.message) }
        finally { setSubmitting(false) }
    }

    const handleDocStatus = async (docId: string, status: "VERIFIED" | "REJECTED") => {
        try {
            const res = await fetch("/api/onboarding/verify", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "DOCUMENT", employeeId: emp.id, documentId: docId, status, rejectionReason: "Rejected by Admin" })
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success(`Doc ${status}`)
            onUpdated()
        } catch (e: any) { toast.error(e.message) }
    }

    const handleSaveSalary = async () => {
        if (!ctc) return toast.error("Enter CTC")
        setSubmitting(true)
        try {
            const res = await fetch("/api/onboarding/verify", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "SALARY", employeeId: emp.id, salaryData: { ctcAnnual: ctc } })
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Salary structure approved")
            onUpdated()
        } catch (e: any) { toast.error(e.message) }
        finally { setSubmitting(false) }
    }

    return (
        <div className="space-y-4">
            {/* KYC Card */}
            <div className="bg-white border border-[var(--border)] p-4 rounded-xl">
                <div className="flex items-center justify-between mb-3 border-b border-[var(--border)] pb-2">
                    <h3 className="text-[13px] font-semibold text-[var(--text)]">KYC Details</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${emp.isKycVerified ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                        {emp.isKycVerified ? "Verified" : "Pending"}
                    </span>
                </div>
                <div className="grid grid-cols-2 gap-y-2 text-[12px]">
                    <div><p className="text-[var(--text3)]">Aadhaar</p><p>{emp.aadharNumber || "---"}</p></div>
                    <div><p className="text-[var(--text3)]">PAN</p><p>{emp.panNumber || "---"}</p></div>
                    <div className="col-span-2"><p className="text-[var(--text3)]">Bank Account</p><p>{emp.bankName} - {emp.bankAccountNumber} ({emp.bankIFSC})</p></div>
                </div>
                {!emp.isKycVerified && (
                    <div className="mt-3 flex flex-col gap-2 pt-3 border-t border-[var(--border)]">
                        <input type="text" placeholder="Rejection Note (if rejecting)" value={kycRejectNote} onChange={e => setKycRejectNote(e.target.value)} className="w-full h-8 text-[12px] border rounded px-2 outline-none focus:border-[var(--accent)]" />
                        <div className="flex justify-end gap-2">
                            <button disabled={submitting} onClick={() => handleKycStatus("REJECTED")} className="px-3 py-1 bg-red-50 text-red-600 rounded border border-red-200 text-[11px] font-medium">Reject</button>
                            <button disabled={submitting} onClick={() => handleKycStatus("VERIFIED")} className="px-3 py-1 bg-[#1a9e6e] text-white rounded text-[11px] font-medium">Verify KYC</button>
                        </div>
                    </div>
                )}
            </div>

            {/* Docs */}
            <div className="bg-white border border-[var(--border)] p-4 rounded-xl">
                <h3 className="text-[13px] font-semibold text-[var(--text)] mb-3 border-b border-[var(--border)] pb-2">Uploaded Documents</h3>
                <div className="space-y-2">
                    {emp.documents && emp.documents.length > 0 ? emp.documents.map((doc: any) => (
                        <div key={doc.id} className="flex flex-col gap-2 p-2 border border-[var(--border)] rounded-lg bg-[var(--surface2)]">
                            <div className="flex items-center justify-between text-[12px]">
                                <span className="font-medium text-[var(--text)]">{doc.type}</span>
                                <span className={doc.status === "VERIFIED" ? "text-green-600" : doc.status === "REJECTED" ? "text-red-500" : "text-yellow-600"}>{doc.status}</span>
                            </div>
                            {doc.status !== "VERIFIED" && (
                                <div className="flex gap-1 justify-end mt-1">
                                    <button onClick={() => handleDocStatus(doc.id, "REJECTED")} className="px-2 py-0.5 text-[10px] bg-red-100 text-red-600 rounded">Reject</button>
                                    <button onClick={() => handleDocStatus(doc.id, "VERIFIED")} className="px-2 py-0.5 text-[10px] bg-green-100 text-green-700 rounded">Approve</button>
                                </div>
                            )}
                        </div>
                    )) : (
                        <p className="text-[12px] text-[var(--text3)] text-center py-2">No documents uploaded.</p>
                    )}
                </div>
            </div>

            {/* Salary */}
            <div className="bg-white border border-[var(--border)] p-4 rounded-xl">
                <h3 className="text-[13px] font-semibold text-[var(--text)] mb-3 border-b border-[var(--border)] pb-2">CTC & Salary Structure</h3>
                <div className="space-y-3 pt-1">
                    <div>
                        <label className="text-[12px] text-[var(--text3)] block mb-1">Annual CTC (₹)</label>
                        <input type="number" value={ctc} onChange={e => setCtc(e.target.value)} className="w-full h-8 px-2 text-[13px] border rounded outline-none focus:border-[var(--accent)]" />
                    </div>
                    {emp.employeeSalary?.status === "APPROVED" && <div className="p-2 bg-green-50 border border-green-100 rounded text-green-700 text-[11px] font-medium text-center">Salary Layout Approved</div>}
                    <button disabled={submitting} onClick={handleSaveSalary} className="w-full h-8 bg-[var(--accent)] text-white text-[12px] font-medium rounded-lg">{emp.employeeSalary ? "Update Salary" : "Define CTC & Approve"}</button>
                </div>
            </div>
        </div>
    )
}

function OnboardingDrawer({ record, onClose, onUpdated }: {
    record: OnboardingRecord
    onClose: () => void
    onUpdated: () => void
}) {
    const [tasks, setTasks] = useState<OnboardingTask[]>(record.tasks)
    const [activeTab, setActiveTab] = useState("All Tasks")
    const [markingComplete, setMarkingComplete] = useState(false)

    // Add custom task form
    const [addTitle, setAddTitle] = useState("")
    const [addCategory, setAddCategory] = useState("Documents")
    const [addDueDate, setAddDueDate] = useState("")
    const [addingTask, setAddingTask] = useState(false)
    const [showAddForm, setShowAddForm] = useState(false)

    const { total, completed, pct } = getTaskProgress(tasks)

    const requiredTasks = tasks.filter(t => t.isRequired)
    const allRequiredDone = requiredTasks.length > 0 && requiredTasks.every(t => t.status === "COMPLETED" || t.status === "SKIPPED")
    const isAlreadyComplete = record.status === "COMPLETED"

    const filteredTasks = activeTab === "All Tasks" ? tasks : tasks.filter(t => t.category === activeTab)

    const handleTaskUpdated = (updated: OnboardingTask) => {
        setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
        onUpdated()
    }

    const handleTaskDeleted = (id: string) => {
        setTasks(prev => prev.filter(t => t.id !== id))
        onUpdated()
    }

    const handleAddTask = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!addTitle) return
        setAddingTask(true)
        try {
            const res = await fetch(`/api/onboarding/${record.id}/tasks`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: addTitle, category: addCategory, dueDate: addDueDate || undefined }),
            })
            if (!res.ok) throw new Error(await res.text())
            const newTask: OnboardingTask = await res.json()
            setTasks(prev => [...prev, newTask])
            setAddTitle("")
            setAddDueDate("")
            setShowAddForm(false)
            toast.success("Task added")
            onUpdated()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to add task")
        } finally {
            setAddingTask(false)
        }
    }

    const handleMarkComplete = async () => {
        setMarkingComplete(true)
        try {
            const res = await fetch(`/api/onboarding/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "ACTIVATE", employeeId: record.employee.id }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Employee finalized and activated!")
            onUpdated()
            onClose()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to activate")
        } finally {
            setMarkingComplete(false)
        }
    }

    const statusCfg = STATUS_CONFIG[record.status]
    const joiningDate = fmtDate(record.employee.dateOfJoining)

    const inpCls = "flex-1 h-8 rounded-[7px] border border-[var(--border)] bg-white px-2.5 text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
    const selCls = "h-8 rounded-[7px] border border-[var(--border)] bg-white px-2 text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-end">
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
            <div className="relative z-10 h-full w-full max-w-[480px] bg-white border-l border-[var(--border)] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
                    <div className="flex items-center gap-3">
                        <Avatar firstName={record.employee.firstName} lastName={record.employee.lastName} photo={record.employee.photo} size={38} />
                        <div>
                            <p className="text-[14px] font-semibold text-[var(--text)]">{record.employee.firstName} {record.employee.lastName}</p>
                            <p className="text-[11px] text-[var(--text3)]">{record.employee.employeeId}{joiningDate ? ` · Joined ${joiningDate}` : ""}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span style={{ color: statusCfg.color, background: statusCfg.bg }} className="text-[11px] font-semibold px-2 py-0.5 rounded-full">
                            {statusCfg.label}
                        </span>
                        <button onClick={onClose} className="p-1.5 text-[var(--text3)] hover:text-[var(--text)] rounded-md hover:bg-[var(--surface2)] transition-colors">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Progress */}
                <div className="px-5 py-3 border-b border-[var(--border)] shrink-0">
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[12px] text-[var(--text2)]">{completed}/{total} tasks done</span>
                        <span className="text-[13px] font-bold" style={{ color: pct === 100 ? "#1a9e6e" : pct >= 50 ? "#f59e0b" : "#3b82f6" }}>{pct}%</span>
                    </div>
                    <ProgressBar value={pct} height={7} />
                </div>

                {/* Tabs */}
                <div className="px-4 pt-3 pb-0 border-b border-[var(--border)] shrink-0 overflow-x-auto">
                    <div className="flex gap-0.5 min-w-max">
                        {CATEGORIES.map(cat => {
                            const count = cat === "All Tasks" ? tasks.length : tasks.filter(t => t.category === cat).length
                            return (
                                <button
                                    key={cat}
                                    onClick={() => setActiveTab(cat)}
                                    className={`px-3 py-2 text-[12px] font-medium rounded-t-[6px] border-b-2 transition-colors whitespace-nowrap ${activeTab === cat ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text3)] hover:text-[var(--text2)]"}`}
                                >
                                    {cat} {count > 0 && <span className="ml-0.5 text-[10px] opacity-70">({count})</span>}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Task List / Content View */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                    {activeTab === "Verification" ? (
                        <VerificationPanel record={record} onUpdated={onUpdated} />
                    ) : (
                        <>
                            {filteredTasks.length === 0 ? (
                                <div className="flex items-center justify-center py-10 text-[var(--text3)]">
                                    <p className="text-[13px]">No tasks in this category</p>
                                </div>
                            ) : (
                                filteredTasks.map(task => (
                                    <TaskRow
                                        key={task.id}
                                        task={task}
                                        onboardingId={record.id}
                                        onUpdated={handleTaskUpdated}
                                        onDelete={handleTaskDeleted}
                                    />
                                ))
                            )}
                        </>
                    )}
                </div>

                {/* Add Custom Task */}
                <div className="px-4 py-3 border-t border-[var(--border)] shrink-0">
                    {!showAddForm ? (
                        <button
                            onClick={() => setShowAddForm(true)}
                            className="flex items-center gap-2 text-[12px] text-[var(--text3)] hover:text-[var(--accent)] transition-colors"
                        >
                            <Plus size={14} />
                            Add Custom Task
                        </button>
                    ) : (
                        <form onSubmit={handleAddTask} className="space-y-2">
                            <p className="text-[12px] font-medium text-[var(--text)]">Add Custom Task</p>
                            <div className="flex gap-2">
                                <input
                                    value={addTitle}
                                    onChange={e => setAddTitle(e.target.value)}
                                    placeholder="Task title..."
                                    className={inpCls}
                                    required
                                />
                                <select value={addCategory} onChange={e => setAddCategory(e.target.value)} className={selCls}>
                                    {CATEGORIES.filter(c => c !== "All Tasks").map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div className="flex gap-2 items-center">
                                <input
                                    type="date"
                                    value={addDueDate}
                                    onChange={e => setAddDueDate(e.target.value)}
                                    className={`${inpCls} max-w-[140px]`}
                                />
                                <div className="flex gap-1.5 ml-auto">
                                    <button type="button" onClick={() => { setShowAddForm(false); setAddTitle(""); setAddDueDate("") }}
                                        className="px-3 py-1.5 text-[12px] text-[var(--text2)] hover:bg-[var(--surface2)] rounded-[6px] transition-colors">
                                        Cancel
                                    </button>
                                    <button type="submit" disabled={addingTask || !addTitle}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent)] text-white rounded-[6px] text-[12px] font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
                                        {addingTask && <Loader2 size={11} className="animate-spin" />}
                                        Add
                                    </button>
                                </div>
                            </div>
                        </form>
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-[var(--border)] shrink-0 bg-[var(--surface2)]/30 flex items-center justify-between gap-3">
                    <div>
                        <p className="text-[12px] text-[var(--text3)]">Overall Completion</p>
                        <p className="text-[20px] font-bold text-[var(--text)] leading-tight">{pct}%</p>
                    </div>
                    {!isAlreadyComplete && allRequiredDone && (
                        <button
                            onClick={handleMarkComplete}
                            disabled={markingComplete}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-[#1a9e6e] text-white rounded-[8px] text-[13px] font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                        >
                            {markingComplete ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            Finalize Employee & Activate
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

// ─── Onboarding Card ─────────────────────────────────────────────────────────

function OnboardingCard({ record, onClick }: { record: OnboardingRecord; onClick: () => void }) {
    const { total, completed, pct } = getTaskProgress(record.tasks)
    const statusCfg = STATUS_CONFIG[record.status]
    const joiningDate = fmtDate(record.employee.dateOfJoining)

    return (
        <div
            onClick={onClick}
            className="bg-white border border-[var(--border)] rounded-[12px] p-4 cursor-pointer hover:border-[var(--accent)] hover:shadow-sm transition-all group"
        >
            <div className="flex items-start gap-3 mb-3">
                <Avatar firstName={record.employee.firstName} lastName={record.employee.lastName} photo={record.employee.photo} size={40} />
                <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">
                        {record.employee.firstName} {record.employee.lastName}
                    </p>
                    <p className="text-[11px] text-[var(--text3)]">{record.employee.employeeId}</p>
                </div>
                <span style={{ color: statusCfg.color, background: statusCfg.bg }} className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                    {statusCfg.label}
                </span>
            </div>

            {(record.employee.designation || joiningDate) && (
                <div className="flex items-center gap-3 text-[11.5px] text-[var(--text3)] mb-3">
                    {record.employee.designation && <span>{record.employee.designation}</span>}
                    {joiningDate && <span>Joined {joiningDate}</span>}
                </div>
            )}

            {/* Progress */}
            <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                    <span className="text-[11.5px] text-[var(--text3)]">{completed}/{total} tasks</span>
                    <span className="text-[11.5px] font-semibold" style={{ color: pct === 100 ? "#1a9e6e" : pct >= 50 ? "#f59e0b" : "#3b82f6" }}>{pct}%</span>
                </div>
                <ProgressBar value={pct} height={5} />
            </div>

            <CategoryBreakdown tasks={record.tasks} />

            <button className="mt-3 w-full text-center text-[12px] font-medium text-[var(--accent)] border border-[var(--accent)] rounded-[7px] py-1.5 hover:bg-[var(--accent-light)] transition-colors">
                View Checklist
            </button>
        </div>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
    const { data: session, status } = useSession()
    const router = useRouter()

    const [records, setRecords] = useState<OnboardingRecord[]>([])
    const [loading, setLoading] = useState(true)
    const [showStart, setShowStart] = useState(false)
    const [selectedRecord, setSelectedRecord] = useState<OnboardingRecord | null>(null)
    const [search, setSearch] = useState("")
    const [statusFilter, setStatusFilter] = useState<string>("ALL")

    useEffect(() => {
        if (status === "unauthenticated") router.push("/login")
    }, [status, router])

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (statusFilter !== "ALL") params.set("status", statusFilter)
            if (search) params.set("search", search)
            const res = await fetch(`/api/onboarding?${params.toString()}`)
            const data = await res.json()
            setRecords(Array.isArray(data) ? data : [])
        } catch {
            toast.error("Failed to load onboarding data")
        } finally {
            setLoading(false)
        }
    }, [statusFilter, search])

    useEffect(() => {
        if (status !== "unauthenticated") fetchData()
    }, [status, fetchData])

    // Stats
    const notStartedCount = records.filter(r => r.status === "NOT_STARTED").length
    const inProgressCount = records.filter(r => r.status === "IN_PROGRESS").length
    const completedCount  = records.filter(r => r.status === "COMPLETED").length
    const onHoldCount     = records.filter(r => r.status === "ON_HOLD").length

    const STATUS_PILLS: { label: string; value: string }[] = [
        { label: "All", value: "ALL" },
        { label: "Not Started", value: "NOT_STARTED" },
        { label: "In Progress", value: "IN_PROGRESS" },
        { label: "Completed", value: "COMPLETED" },
        { label: "On Hold", value: "ON_HOLD" },
    ]

    const handleRefresh = () => {
        fetchData()
        if (selectedRecord) {
            // Refresh selected record from list after update
            setSelectedRecord(null)
        }
    }

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-[24px] font-semibold tracking-[-0.4px] text-[var(--text)]">Onboarding</h1>
                    <p className="text-[13px] text-[var(--text3)] mt-0.5">Track and manage employee onboarding checklists</p>
                </div>
                {session?.user?.role !== "CLIENT" && (
                    <button
                        onClick={() => setShowStart(true)}
                        className="inline-flex items-center gap-2 bg-[var(--accent)] text-white rounded-[10px] text-[13px] font-medium px-4 py-2 hover:opacity-90 transition-opacity"
                    >
                        <Plus size={16} />
                        Start Onboarding
                    </button>
                )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Not Started" value={notStartedCount} color="#6b7280" bg="#f3f4f6" icon={<Clock size={18} />} />
                <StatCard label="In Progress" value={inProgressCount} color="#d97706" bg="#fef3c7" icon={<AlertCircle size={18} />} />
                <StatCard label="Completed"   value={completedCount}  color="#1a9e6e" bg="#e8f7f1" icon={<CheckCircle2 size={18} />} />
                <StatCard label="On Hold"     value={onHoldCount}     color="#ef4444" bg="#fef2f2" icon={<PauseCircle size={18} />} />
            </div>

            {/* Filters */}
            <div className="bg-white border border-[var(--border)] rounded-[12px] p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                {/* Status pills */}
                <div className="flex flex-wrap gap-1.5">
                    {STATUS_PILLS.map(pill => (
                        <button
                            key={pill.value}
                            onClick={() => setStatusFilter(pill.value)}
                            className={`px-3 py-1.5 text-[12px] font-medium rounded-full border transition-colors ${statusFilter === pill.value ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "border-[var(--border)] text-[var(--text2)] hover:border-[var(--accent)] hover:text-[var(--accent)]"}`}
                        >
                            {pill.label}
                        </button>
                    ))}
                </div>
                {/* Search */}
                <div className="relative sm:ml-auto w-full sm:w-64">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by name or ID..."
                        className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface2)]/30 pl-8 pr-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                    />
                </div>
            </div>

            {/* Cards Grid */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 size={28} className="animate-spin text-[var(--accent)]" />
                </div>
            ) : records.length === 0 ? (
                <div className="flex min-h-[250px] flex-col items-center justify-center rounded-[14px] bg-white border border-dashed border-[var(--border)]">
                    <Users size={36} className="text-[var(--text3)] mb-2" />
                    <p className="text-[14px] font-semibold text-[var(--text)]">No onboarding records</p>
                    <p className="text-[13px] text-[var(--text3)] mt-1">Start onboarding for a new employee</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {records.map(record => (
                        <OnboardingCard
                            key={record.id}
                            record={record}
                            onClick={() => setSelectedRecord(record)}
                        />
                    ))}
                </div>
            )}

            {/* Modals */}
            <StartOnboardingModal
                open={showStart}
                onClose={() => setShowStart(false)}
                onSaved={fetchData}
            />

            {selectedRecord && (
                <OnboardingDrawer
                    record={selectedRecord}
                    onClose={() => { setSelectedRecord(null); fetchData() }}
                    onUpdated={handleRefresh}
                />
            )}
        </div>
    )
}
