"use client"
import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    Plus, Loader2, X, Search, Users,
    CheckCircle2, Clock, AlertCircle, PauseCircle,
    ChevronDown, Trash2, CalendarDays, Upload, Eye,
    LayoutGrid, Table as TableIcon
} from "lucide-react"
import { DocumentViewer } from "@/components/DocumentViewer"
import { format } from "date-fns"
import * as XLSX from "xlsx"

// ─── Types ────────────────────────────────────────────────────────────────────

type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED"
type OnboardingStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "ON_HOLD"
type DocType = "RESUME" | "AADHAAR" | "PAN" | "PHOTO" | "CERTIFICATE" | "OFFER_LETTER" | "JOINING_LETTER" | "OTHER"
type DocStatus = "PENDING" | "VERIFIED" | "REJECTED"

type EmployeeDocument = {
    id: string
    employeeId: string
    type: string
    fileName: string
    fileUrl: string
    status: DocStatus
    rejectionReason?: string | null
    verifiedBy?: string | null
    uploadedAt: string
}

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
        middleName?: string | null
        lastName: string
        employeeId: string
        designation?: string | null
        dateOfJoining?: string | null
        photo?: string | null
        branch: { name: string }
        isKycVerified?: boolean
        kycRejectionNote?: string | null
        // Identity
        nameAsPerAadhar?: string | null
        fathersName?: string | null
        dateOfBirth?: string | null
        gender?: string | null
        bloodGroup?: string | null
        maritalStatus?: string | null
        nationality?: string | null
        religion?: string | null
        caste?: string | null
        // Contact
        phone?: string | null
        alternatePhone?: string | null
        email?: string | null
        emergencyContact1Name?: string | null
        emergencyContact1Phone?: string | null
        emergencyContact2Name?: string | null
        emergencyContact2Phone?: string | null
        // Address
        address?: string | null
        city?: string | null
        state?: string | null
        pincode?: string | null
        permanentAddress?: string | null
        permanentCity?: string | null
        permanentState?: string | null
        permanentPincode?: string | null
        // Contract
        contractFrom?: string | null
        contractPeriodDays?: number | null
        contractorCode?: string | null
        workOrderNumber?: string | null
        workOrderFrom?: string | null
        workOrderTo?: string | null
        workSkill?: string | null
        natureOfWork?: string | null
        categoryCode?: string | null
        // Statutory
        aadharNumber?: string | null
        panNumber?: string | null
        uan?: string | null
        pfNumber?: string | null
        esiNumber?: string | null
        labourCardNo?: string | null
        labourCardExpDate?: string | null
        // Bank
        bankAccountNumber?: string | null
        bankIFSC?: string | null
        bankName?: string | null
        bankBranch?: string | null
        // Background & Medical
        isBackgroundChecked?: boolean
        backgroundCheckRemark?: string | null
        isMedicalDone?: boolean
        medicalRemark?: string | null
        // Safety
        safetyGoggles?: boolean
        safetyGogglesDate?: string | null
        safetyGloves?: boolean
        safetyGlovesDate?: string | null
        safetyHelmet?: boolean
        safetyHelmetDate?: string | null
        safetyMask?: boolean
        safetyMaskDate?: string | null
        safetyJacket?: boolean
        safetyJacketDate?: string | null
        safetyEarMuffs?: boolean
        safetyEarMuffsDate?: string | null
        safetyShoes?: boolean
        safetyShoesDate?: string | null
        documents?: unknown[]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        employeeSalary?: any
    }
    tasks: OnboardingTask[]
}

type EmployeeOption = { id: string; firstName: string; lastName: string; employeeId: string }
type UserOption = { id: string; name: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ["#1a9e6e", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#f97316"]

const CATEGORIES = ["All Tasks", "Employee Details", "Verification", "Documents", "Welcome Kit", "Training", "Compliance", "IT Setup", "Orientation"]

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

const DOC_TYPE_OPTIONS: { value: DocType; label: string }[] = [
    { value: "RESUME",        label: "Resume / CV" },
    { value: "AADHAAR",       label: "Aadhaar Card" },
    { value: "PAN",           label: "PAN Card" },
    { value: "PHOTO",         label: "Passport Photo" },
    { value: "CERTIFICATE",   label: "Certificate" },
    { value: "OFFER_LETTER",  label: "Offer Letter" },
    { value: "JOINING_LETTER",label: "Joining Letter" },
    { value: "OTHER",         label: "Other" },
]

const DOC_TYPE_STYLE: Record<string, { bg: string; color: string }> = {
    RESUME:         { bg: "#eff6ff", color: "#3b82f6" },
    AADHAAR:        { bg: "#fff7ed", color: "#ea580c" },
    PAN:            { bg: "#fdf4ff", color: "#9333ea" },
    PHOTO:          { bg: "#f0fdf4", color: "#16a34a" },
    CERTIFICATE:    { bg: "#fef3c7", color: "#d97706" },
    OFFER_LETTER:   { bg: "#f0f9ff", color: "#0284c7" },
    JOINING_LETTER: { bg: "#fef2f2", color: "#dc2626" },
    OTHER:          { bg: "#f3f4f6", color: "#6b7280" },
}

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

function VerificationPanel({ record, onUpdated, onView, docs, docsLoading, onDocsRefresh }: {
    record: OnboardingRecord
    onUpdated: () => void
    onView: (url: string, name: string) => void
    docs: EmployeeDocument[]
    docsLoading: boolean
    onDocsRefresh: () => void
}) {
    const emp = record.employee
    const [submitting, setSubmitting] = useState(false)
    const [ctc, setCtc] = useState(emp.employeeSalary?.ctcAnnual?.toString() || "")
    const [kycRejectNote, setKycRejectNote] = useState(emp.kycRejectionNote || "")

    // Documents state
    const [showAddDoc, setShowAddDoc] = useState(false)
    const [addingDoc, setAddingDoc] = useState(false)
    const [docType, setDocType] = useState<DocType>("RESUME")
    const [docFileName, setDocFileName] = useState("")
    const [docFileUrl, setDocFileUrl] = useState("")

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
        } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed") }
        finally { setSubmitting(false) }
    }

    const handleDocVerify = async (docId: string, status: "VERIFIED" | "REJECTED") => {
        try {
            const res = await fetch(`/api/onboarding/${record.id}/documents`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ docId, status, rejectionReason: status === "REJECTED" ? "Rejected by Admin" : undefined }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success(`Document ${status === "VERIFIED" ? "verified" : "rejected"}`)
            onDocsRefresh()
        } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed") }
    }

    const handleAddDoc = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!docFileName.trim() || !docFileUrl.trim()) return
        setAddingDoc(true)
        try {
            const res = await fetch(`/api/onboarding/${record.id}/documents`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: docType, fileName: docFileName.trim(), fileUrl: docFileUrl.trim() }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Document added")
            setShowAddDoc(false)
            setDocFileName("")
            setDocFileUrl("")
            setDocType("RESUME")
            onDocsRefresh()
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Failed to add document")
        } finally {
            setAddingDoc(false)
        }
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
        } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed") }
        finally { setSubmitting(false) }
    }

    const [showDetails, setShowDetails] = useState(false)

    return (
        <div className="space-y-4">
            {/* Employee Details Card */}
            <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                    <div className="flex items-center gap-2">
                        <h3 className="text-[13px] font-semibold text-[var(--text)]">Employee Details</h3>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${emp.isKycVerified ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                            {emp.isKycVerified ? "✓ Verified" : "Pending"}
                        </span>
                    </div>
                    <button
                        onClick={() => setShowDetails(v => !v)}
                        className="inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-[6px] border border-[var(--border)] bg-white hover:bg-[var(--surface2)] text-[var(--text2)] transition-colors"
                    >
                        {showDetails ? "Hide Details" : "View Details"}
                        <ChevronDown size={12} className={`transition-transform ${showDetails ? "rotate-180" : ""}`} />
                    </button>
                </div>

                {/* Collapsible Details */}
                {showDetails && (
                    <div className="p-4 space-y-4 text-[12px]">
                        {/* Personal */}
                        <div>
                            <p className="text-[10px] font-bold text-[var(--text3)] uppercase tracking-wider mb-2">Personal Info</p>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                                {[
                                    ["Full Name", `${emp.firstName} ${emp.middleName || ""} ${emp.lastName}`.trim()],
                                    ["Name on Aadhaar", emp.nameAsPerAadhar],
                                    ["Father's Name", emp.fathersName],
                                    ["Date of Birth", emp.dateOfBirth],
                                    ["Gender", emp.gender],
                                    ["Blood Group", emp.bloodGroup],
                                    ["Marital Status", emp.maritalStatus],
                                    ["Nationality", emp.nationality],
                                    ["Religion", emp.religion],
                                    ["Caste", emp.caste],
                                ].map(([label, val]) => val ? (
                                    <div key={label as string}>
                                        <p className="text-[var(--text3)] text-[10.5px]">{label}</p>
                                        <p className="text-[var(--text)] font-medium">{val}</p>
                                    </div>
                                ) : null)}
                            </div>
                        </div>

                        {/* Contact */}
                        <div>
                            <p className="text-[10px] font-bold text-[var(--text3)] uppercase tracking-wider mb-2">Contact</p>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                                {[
                                    ["Phone", emp.phone],
                                    ["Alt. Phone", emp.alternatePhone],
                                    ["Email", emp.email],
                                    ["Emergency 1", emp.emergencyContact1Name ? `${emp.emergencyContact1Name} — ${emp.emergencyContact1Phone}` : null],
                                    ["Emergency 2", emp.emergencyContact2Name ? `${emp.emergencyContact2Name} — ${emp.emergencyContact2Phone}` : null],
                                ].map(([label, val]) => val ? (
                                    <div key={label as string}>
                                        <p className="text-[var(--text3)] text-[10.5px]">{label}</p>
                                        <p className="text-[var(--text)] font-medium">{val}</p>
                                    </div>
                                ) : null)}
                            </div>
                        </div>

                        {/* Address */}
                        {(emp.address || emp.city) && (
                            <div>
                                <p className="text-[10px] font-bold text-[var(--text3)] uppercase tracking-wider mb-2">Address</p>
                                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                                    {[
                                        ["Address", emp.address],
                                        ["City", emp.city],
                                        ["State", emp.state],
                                        ["Pincode", emp.pincode],
                                    ].map(([label, val]) => val ? (
                                        <div key={label as string}>
                                            <p className="text-[var(--text3)] text-[10.5px]">{label}</p>
                                            <p className="text-[var(--text)] font-medium">{val}</p>
                                        </div>
                                    ) : null)}
                                </div>
                            </div>
                        )}

                        {/* Statutory */}
                        <div>
                            <p className="text-[10px] font-bold text-[var(--text3)] uppercase tracking-wider mb-2">Statutory</p>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                                {[
                                    ["Aadhaar", emp.aadharNumber],
                                    ["PAN", emp.panNumber],
                                    ["UAN", emp.uan],
                                    ["PF Number", emp.pfNumber],
                                    ["ESIC Number", emp.esiNumber],
                                    ["Labour Card No", emp.labourCardNo],
                                ].map(([label, val]) => val ? (
                                    <div key={label as string}>
                                        <p className="text-[var(--text3)] text-[10.5px]">{label}</p>
                                        <p className="text-[var(--text)] font-medium font-mono">{val}</p>
                                    </div>
                                ) : null)}
                            </div>
                        </div>

                        {/* Bank */}
                        {(emp.bankAccountNumber || emp.bankName) && (
                            <div>
                                <p className="text-[10px] font-bold text-[var(--text3)] uppercase tracking-wider mb-2">Bank Details</p>
                                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                                    {[
                                        ["Bank Name", emp.bankName],
                                        ["Account No.", emp.bankAccountNumber],
                                        ["IFSC", emp.bankIFSC],
                                        ["Branch", emp.bankBranch],
                                    ].map(([label, val]) => val ? (
                                        <div key={label as string}>
                                            <p className="text-[var(--text3)] text-[10.5px]">{label}</p>
                                            <p className="text-[var(--text)] font-medium font-mono">{val}</p>
                                        </div>
                                    ) : null)}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Verify / Reject Actions */}
                {!emp.isKycVerified && (
                    <div className="px-4 py-3 bg-[var(--surface2)] border-t border-[var(--border)] flex flex-col gap-2">
                        <input
                            type="text"
                            placeholder="Rejection note (required if rejecting)"
                            value={kycRejectNote}
                            onChange={e => setKycRejectNote(e.target.value)}
                            className="w-full h-8 text-[12px] border border-[var(--border)] rounded-[6px] px-2.5 outline-none focus:border-[var(--accent)] bg-white"
                        />
                        <div className="flex justify-end gap-2">
                            <button disabled={submitting} onClick={() => handleKycStatus("REJECTED")}
                                className="px-3 py-1.5 bg-red-50 text-red-600 rounded-[6px] border border-red-200 text-[11px] font-medium hover:bg-red-100 transition-colors disabled:opacity-50">
                                ✗ Reject
                            </button>
                            <button disabled={submitting} onClick={() => handleKycStatus("VERIFIED")}
                                className="px-4 py-1.5 bg-[#1a9e6e] text-white rounded-[6px] text-[11px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center gap-1.5">
                                {submitting ? <Loader2 size={11} className="animate-spin" /> : null}
                                ✓ Verified
                            </button>
                        </div>
                    </div>
                )}
                {emp.isKycVerified && (
                    <div className="px-4 py-2.5 bg-green-50 border-t border-green-100 text-[11px] text-green-700 font-medium flex items-center gap-1.5">
                        <CheckCircle2 size={13} /> Employee details verified
                    </div>
                )}
            </div>

            {/* Documents Card */}
            <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
                {/* Header row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 8, marginBottom: 12 }}>
                    <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", margin: 0 }}>Documents</h3>
                    <button
                        onClick={() => setShowAddDoc(v => !v)}
                        style={{
                            display: "inline-flex", alignItems: "center", gap: 5,
                            fontSize: 11, fontWeight: 500, padding: "4px 10px",
                            borderRadius: 6, border: "1px solid var(--accent)",
                            color: showAddDoc ? "white" : "var(--accent)",
                            background: showAddDoc ? "var(--accent)" : "transparent",
                            cursor: "pointer", transition: "all 0.15s",
                        }}
                    >
                        <Plus size={11} />
                        {showAddDoc ? "Cancel" : "Add Document"}
                    </button>
                </div>

                {/* Add Document Form */}
                {showAddDoc && (
                    <form onSubmit={handleAddDoc} style={{ marginBottom: 14, padding: 12, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", margin: 0 }}>Add Document</p>

                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <label style={{ fontSize: 11, color: "var(--text2)" }}>Document Type *</label>
                            <select
                                value={docType}
                                onChange={e => setDocType(e.target.value as DocType)}
                                required
                                style={{ height: 32, borderRadius: 7, border: "1px solid var(--border)", background: "white", padding: "0 10px", fontSize: 12, color: "var(--text)", outline: "none" }}
                            >
                                {DOC_TYPE_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <label style={{ fontSize: 11, color: "var(--text2)" }}>File Name *</label>
                            <input
                                type="text"
                                value={docFileName}
                                onChange={e => setDocFileName(e.target.value)}
                                placeholder="e.g. Aadhaar Card Scan"
                                required
                                style={{ height: 32, borderRadius: 7, border: "1px solid var(--border)", background: "white", padding: "0 10px", fontSize: 12, color: "var(--text)", outline: "none" }}
                            />
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <label style={{ fontSize: 11, color: "var(--text2)" }}>File URL *</label>
                            <input
                                type="url"
                                value={docFileUrl}
                                onChange={e => setDocFileUrl(e.target.value)}
                                placeholder="https://drive.google.com/..."
                                required
                                style={{ height: 32, borderRadius: 7, border: "1px solid var(--border)", background: "white", padding: "0 10px", fontSize: 12, color: "var(--text)", outline: "none" }}
                            />
                            <p style={{ fontSize: 10.5, color: "var(--text3)", margin: 0 }}>Upload to Google Drive / Supabase Storage and paste link here</p>
                        </div>

                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 2 }}>
                            <button
                                type="button"
                                onClick={() => { setShowAddDoc(false); setDocFileName(""); setDocFileUrl(""); setDocType("RESUME") }}
                                style={{ padding: "5px 14px", fontSize: 12, color: "var(--text2)", background: "transparent", border: "none", borderRadius: 6, cursor: "pointer" }}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={addingDoc || !docFileName.trim() || !docFileUrl.trim()}
                                style={{
                                    display: "inline-flex", alignItems: "center", gap: 6,
                                    padding: "5px 16px", fontSize: 12, fontWeight: 500,
                                    background: "var(--accent)", color: "white",
                                    border: "none", borderRadius: 6, cursor: addingDoc ? "wait" : "pointer",
                                    opacity: addingDoc || !docFileName.trim() || !docFileUrl.trim() ? 0.5 : 1,
                                }}
                            >
                                {addingDoc && <Loader2 size={11} className="animate-spin" />}
                                Save Document
                            </button>
                        </div>
                    </form>
                )}

                {/* Document List */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {docsLoading ? (
                        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
                            <Loader2 size={18} className="animate-spin" style={{ color: "var(--accent)" }} />
                        </div>
                    ) : docs.length === 0 ? (
                        <p style={{ fontSize: 12, color: "var(--text3)", textAlign: "center", padding: "8px 0", margin: 0 }}>No documents uploaded yet.</p>
                    ) : docs.map(doc => {
                        const typeStyle = DOC_TYPE_STYLE[doc.type] || DOC_TYPE_STYLE.OTHER
                        const isPending  = doc.status === "PENDING"
                        const isVerified = doc.status === "VERIFIED"
                        const isRejected = doc.status === "REJECTED"
                        return (
                            <div
                                key={doc.id}
                                style={{
                                    display: "flex", flexDirection: "column", gap: 8,
                                    padding: "10px 12px",
                                    border: `1px solid ${isVerified ? "#bbf7d0" : isRejected ? "#fecaca" : "var(--border)"}`,
                                    borderRadius: 10,
                                    background: isVerified ? "#f0fdf4" : isRejected ? "#fef2f2" : "var(--surface)",
                                }}
                            >
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    {/* Type badge */}
                                    <span style={{
                                        fontSize: 10, fontWeight: 600, padding: "2px 7px",
                                        borderRadius: 4, background: typeStyle.bg, color: typeStyle.color,
                                        flexShrink: 0,
                                    }}>
                                        {DOC_TYPE_OPTIONS.find(o => o.value === doc.type)?.label || doc.type}
                                    </span>

                                    {/* File name */}
                                    <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {doc.fileName}
                                    </span>

                                    {/* Status badge */}
                                    <span style={{
                                        fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 12, flexShrink: 0,
                                        background: isVerified ? "#dcfce7" : isRejected ? "#fee2e2" : "#fef3c7",
                                        color: isVerified ? "#16a34a" : isRejected ? "#dc2626" : "#d97706",
                                    }}>
                                        {doc.status}
                                    </span>
                                </div>

                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    {/* View button */}
                                    <button
                                        onClick={() => onView(doc.fileUrl, doc.fileName)}
                                        style={{
                                            fontSize: 11, padding: "3px 10px", borderRadius: 5,
                                            border: "1px solid var(--border)", color: "var(--text2)",
                                            background: "white", textDecoration: "none", fontWeight: 500,
                                            cursor: "pointer"
                                        }}
                                    >
                                        View
                                    </button>

                                    {/* Admin verify/reject buttons */}
                                    {!isVerified && (
                                        <button
                                            onClick={() => handleDocVerify(doc.id, "VERIFIED")}
                                            style={{
                                                fontSize: 11, padding: "3px 10px", borderRadius: 5,
                                                border: "1px solid #bbf7d0", color: "#16a34a",
                                                background: "#f0fdf4", cursor: "pointer", fontWeight: 600,
                                            }}
                                        >
                                            ✓ Verified
                                        </button>
                                    )}
                                    {!isRejected && (
                                        <button
                                            onClick={() => handleDocVerify(doc.id, "REJECTED")}
                                            style={{
                                                fontSize: 11, padding: "3px 10px", borderRadius: 5,
                                                border: "1px solid #fecaca", color: "#dc2626",
                                                background: "#fef2f2", cursor: "pointer", fontWeight: 500,
                                            }}
                                        >
                                            ✗ Reject
                                        </button>
                                    )}

                                    {isPending && (
                                        <span style={{ fontSize: 10.5, color: "var(--text3)", marginLeft: "auto" }}>
                                            Awaiting review
                                        </span>
                                    )}
                                    {isRejected && doc.rejectionReason && (
                                        <span style={{ fontSize: 10.5, color: "#dc2626", marginLeft: "auto" }}>
                                            {doc.rejectionReason}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )
                    })}
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

function OnboardingDrawer({ record, onClose, onUpdated, onView }: {
    record: OnboardingRecord
    onClose: () => void
    onUpdated: () => void
    onView: (url: string, name: string) => void
}) {
    const [markingComplete, setMarkingComplete] = useState(false)
    const [docs, setDocs] = useState<EmployeeDocument[]>([])
    const [docsLoading, setDocsLoading] = useState(false)

    const fetchDocs = useCallback(async () => {
        setDocsLoading(true)
        try {
            const res = await fetch(`/api/onboarding/${record.id}/documents`)
            if (!res.ok) throw new Error()
            const data = await res.json()
            setDocs(Array.isArray(data) ? data : [])
        } catch { /* ignore */ }
        finally { setDocsLoading(false) }
    }, [record.id])

    useEffect(() => { fetchDocs() }, [fetchDocs])

    // Progress = KYC (1 item) + each uploaded doc
    const kycVerified = record.employee.isKycVerified ? 1 : 0
    const docsVerified = docs.filter(d => d.status === "VERIFIED").length
    const totalItems = 1 + docs.length
    const verifiedItems = kycVerified + docsVerified
    const pct = totalItems > 0 ? Math.round((verifiedItems / totalItems) * 100) : 0

    const isAlreadyComplete = record.status === "COMPLETED"
    const statusCfg = STATUS_CONFIG[record.status]
    const joiningDate = fmtDate(record.employee.dateOfJoining)

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

                {/* Progress bar — based on KYC + docs verification */}
                <div className="px-5 py-3 border-b border-[var(--border)] shrink-0">
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[12px] text-[var(--text2)]">{verifiedItems}/{totalItems} verified</span>
                        <span className="text-[13px] font-bold" style={{ color: pct === 100 ? "#1a9e6e" : pct >= 50 ? "#f59e0b" : "#3b82f6" }}>{pct}%</span>
                    </div>
                    <ProgressBar value={pct} height={7} />
                </div>

                {/* Verification Panel — only content */}
                <div className="flex-1 overflow-y-auto px-4 py-3">
                    <VerificationPanel
                        record={record}
                        onUpdated={onUpdated}
                        onView={onView}
                        docs={docs}
                        docsLoading={docsLoading}
                        onDocsRefresh={fetchDocs}
                    />
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-[var(--border)] shrink-0 bg-[var(--surface2)]/30 flex items-center justify-between gap-3">
                    <div>
                        <p className="text-[12px] text-[var(--text3)]">Verification Progress</p>
                        <p className="text-[20px] font-bold text-[var(--text)] leading-tight">{pct}%</p>
                    </div>
                    {!isAlreadyComplete && record.employee.isKycVerified && (
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
    const statusCfg = STATUS_CONFIG[record.status]
    const joiningDate = fmtDate(record.employee.dateOfJoining)
    const isKycVerified = record.employee.isKycVerified

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

            <div className="flex items-center gap-3 text-[11.5px] text-[var(--text3)] mb-3 flex-wrap">
                {record.employee.designation && <span className="truncate">{record.employee.designation}</span>}
                {record.employee.branch?.name && <span className="truncate">{record.employee.branch.name}</span>}
                {joiningDate && <span>Joined {joiningDate}</span>}
            </div>

            {/* KYC Status */}
            <div className="flex items-center justify-between">
                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                    background: isKycVerified ? "#dcfce7" : "#fef3c7",
                    color: isKycVerified ? "#16a34a" : "#d97706" }}>
                    {isKycVerified ? "✓ KYC Verified" : "⏳ KYC Pending"}
                </span>
                <button className="text-[12px] font-medium text-[var(--accent)] border border-[var(--accent)] rounded-[7px] px-3 py-1 hover:bg-blue-50 transition-colors">
                    Verify →
                </button>
            </div>
        </div>
    )
}

// ─── Employee Details Panel ───────────────────────────────────────────────────

function EmployeeDetailsPanel({ emp }: { emp: OnboardingRecord["employee"] }) {
    const fullName = [emp.firstName, emp.middleName, emp.lastName].filter(Boolean).join(" ")
    const fmtBool = (v?: boolean) => v ? "Yes" : "No"
    const fmtD = (d?: string | null) => { if (!d) return "—"; try { return format(new Date(d), "dd MMM yyyy") } catch { return "—" } }

    const Section = ({ title }: { title: string }) => (
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid var(--border)", paddingBottom: 6, marginBottom: 10, marginTop: 16 }}>{title}</div>
    )
    const Field = ({ label, value }: { label: string; value?: string | null }) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 10.5, color: "var(--text3)", fontWeight: 600 }}>{label}</span>
            <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>{value || "—"}</span>
        </div>
    )
    const SafetyRow = ({ label, issued, date }: { label: string; issued?: boolean; date?: string | null }) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 16, color: issued ? "#16a34a" : "#dc2626" }}>{issued ? "✓" : "✗"}</span>
            <span style={{ flex: 1, fontSize: 13, color: "var(--text)" }}>{label}</span>
            {issued && date && <span style={{ fontSize: 11, color: "var(--text3)" }}>{fmtD(date)}</span>}
        </div>
    )

    return (
        <div style={{ padding: "4px 0" }}>
            <Section title="Personal Details" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ gridColumn: "span 2" }}>
                    <Field label="Full Name" value={fullName} />
                </div>
                <Field label="Name as per Aadhar" value={emp.nameAsPerAadhar} />
                <Field label="Father's Name" value={emp.fathersName} />
                <Field label="Date of Birth" value={fmtD(emp.dateOfBirth)} />
                <Field label="Gender" value={emp.gender} />
                <Field label="Blood Group" value={emp.bloodGroup} />
                <Field label="Marital Status" value={emp.maritalStatus} />
                <Field label="Nationality" value={emp.nationality} />
                <Field label="Religion" value={emp.religion} />
                <Field label="Caste" value={emp.caste} />
            </div>

            <Section title="Contact Details" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Primary Phone" value={emp.phone} />
                <Field label="Alternate Phone" value={emp.alternatePhone} />
                <div style={{ gridColumn: "span 2" }}>
                    <Field label="Personal Email" value={emp.email} />
                </div>
                <Field label="Emergency Contact 1" value={emp.emergencyContact1Name} />
                <Field label="EC1 Phone" value={emp.emergencyContact1Phone} />
                <Field label="Emergency Contact 2" value={emp.emergencyContact2Name} />
                <Field label="EC2 Phone" value={emp.emergencyContact2Phone} />
            </div>

            <Section title="Address" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ gridColumn: "span 2" }}>
                    <Field label="Current Address" value={emp.address} />
                </div>
                <Field label="City" value={emp.city} />
                <Field label="State" value={emp.state} />
                <Field label="Pincode" value={emp.pincode} />
                <div style={{ gridColumn: "span 2" }}>
                    <Field label="Permanent Address" value={emp.permanentAddress} />
                </div>
                <Field label="Perm. City" value={emp.permanentCity} />
                <Field label="Perm. State" value={emp.permanentState} />
                <Field label="Perm. Pincode" value={emp.permanentPincode} />
            </div>

            <Section title="Contract & Work" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Contract From" value={fmtD(emp.contractFrom)} />
                <Field label="Contract Period (Days)" value={emp.contractPeriodDays != null ? String(emp.contractPeriodDays) : null} />
                <Field label="Contractor Code" value={emp.contractorCode} />
                <Field label="Work Order No." value={emp.workOrderNumber} />
                <Field label="Work Order From" value={fmtD(emp.workOrderFrom)} />
                <Field label="Work Order To" value={fmtD(emp.workOrderTo)} />
                <Field label="Work Skill" value={emp.workSkill} />
                <Field label="Nature of Work" value={emp.natureOfWork} />
                <Field label="Designation" value={emp.designation} />
                <Field label="Category" value={emp.categoryCode} />
            </div>

            <Section title="Statutory / Compliance" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Aadhar No." value={emp.aadharNumber} />
                <Field label="PAN No." value={emp.panNumber} />
                <Field label="UAN" value={emp.uan} />
                <Field label="PF No." value={emp.pfNumber} />
                <Field label="ESI No." value={emp.esiNumber} />
                <Field label="Labour Card No." value={emp.labourCardNo} />
                <Field label="Labour Card Expiry" value={fmtD(emp.labourCardExpDate)} />
            </div>

            <Section title="Bank Details" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Bank Name" value={emp.bankName} />
                <Field label="Branch" value={emp.bankBranch} />
                <Field label="IFSC Code" value={emp.bankIFSC} />
                <Field label="Account Number" value={emp.bankAccountNumber} />
            </div>

            <Section title="Background & Medical" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Background Check" value={fmtBool(emp.isBackgroundChecked)} />
                <Field label="BG Remark" value={emp.backgroundCheckRemark} />
                <Field label="Medical Done" value={fmtBool(emp.isMedicalDone)} />
                <Field label="Medical Remark" value={emp.medicalRemark} />
            </div>

            <Section title="Safety Equipment" />
            <div style={{ marginTop: 4 }}>
                <SafetyRow label="Safety Goggles" issued={emp.safetyGoggles} date={emp.safetyGogglesDate} />
                <SafetyRow label="Hand Gloves" issued={emp.safetyGloves} date={emp.safetyGlovesDate} />
                <SafetyRow label="Helmet" issued={emp.safetyHelmet} date={emp.safetyHelmetDate} />
                <SafetyRow label="Mask" issued={emp.safetyMask} date={emp.safetyMaskDate} />
                <SafetyRow label="Safety Jacket" issued={emp.safetyJacket} date={emp.safetyJacketDate} />
                <SafetyRow label="Ear Muffs" issued={emp.safetyEarMuffs} date={emp.safetyEarMuffsDate} />
                <SafetyRow label="Safety Shoes" issued={emp.safetyShoes} date={emp.safetyShoesDate} />
            </div>
        </div>
    )
}

// ─── CLMS Import Modal ────────────────────────────────────────────────────────

function CLMSImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<{ imported: number; skipped: number; errors: { row: number; reason: string }[] } | null>(null)

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setLoading(true)
        setResult(null)
        try {
            const ab = await file.arrayBuffer()
            const wb = XLSX.read(ab, { type: "array" })
            const ws = wb.Sheets["ContratorEmployee"] ?? wb.Sheets[wb.SheetNames[0]]
            const rows = XLSX.utils.sheet_to_json(ws)
            const res = await fetch("/api/employees/import/clms", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rows }),
            })
            const data = await res.json()
            setResult(data)
            if (data.imported > 0) {
                toast.success(`${data.imported} employees imported!`)
                onDone()
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Import failed")
        } finally {
            setLoading(false)
        }
    }

    if (!open) return null
    return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)", width: "100%", maxWidth: 480, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
                    <div>
                        <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: 0 }}>Import from CLMS Excel</p>
                        <p style={{ fontSize: 12, color: "var(--text3)", margin: "2px 0 0" }}>Upload Growus CLMS file</p>
                    </div>
                    <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", padding: 4 }}>
                        <X size={18} />
                    </button>
                </div>
                <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ background: "var(--surface2)", borderRadius: 10, padding: 12, fontSize: 12, color: "var(--text2)" }}>
                        The <strong>ContratorEmployee</strong> sheet will be imported. All employees will be created with onboarding status <strong>IN_PROGRESS</strong>.
                    </div>
                    {!result && (
                        <label style={{
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                            border: "2px dashed var(--border)", borderRadius: 10, padding: "24px 16px",
                            cursor: loading ? "wait" : "pointer", color: "var(--accent)", fontWeight: 600, fontSize: 13,
                            opacity: loading ? 0.6 : 1,
                        }}>
                            {loading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                            {loading ? "Importing..." : "Choose .xls / .xlsx file"}
                            <input type="file" accept=".xls,.xlsx" onChange={handleFile} style={{ display: "none" }} disabled={loading} />
                        </label>
                    )}
                    {result && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            <div style={{ display: "flex", gap: 10 }}>
                                <div style={{ flex: 1, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: 12, textAlign: "center" }}>
                                    <p style={{ fontSize: 24, fontWeight: 700, color: "#16a34a", margin: 0 }}>{result.imported}</p>
                                    <p style={{ fontSize: 11, color: "#15803d", margin: "2px 0 0" }}>Imported</p>
                                </div>
                                <div style={{ flex: 1, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 12, textAlign: "center" }}>
                                    <p style={{ fontSize: 24, fontWeight: 700, color: "#dc2626", margin: 0 }}>{result.skipped}</p>
                                    <p style={{ fontSize: 11, color: "#b91c1c", margin: "2px 0 0" }}>Skipped</p>
                                </div>
                            </div>
                            {result.errors.length > 0 && (
                                <div style={{ maxHeight: 160, overflowY: "auto", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 10 }}>
                                    {result.errors.map((e, i) => (
                                        <p key={i} style={{ fontSize: 11, color: "#dc2626", margin: "2px 0" }}>Row {e.row}: {e.reason}</p>
                                    ))}
                                </div>
                            )}
                            <button onClick={() => { setResult(null) }}
                                style={{ fontSize: 12, padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "none", cursor: "pointer", color: "var(--text2)" }}>
                                Import another file
                            </button>
                        </div>
                    )}
                </div>
                <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end" }}>
                    <button onClick={onClose}
                        style={{ padding: "8px 18px", borderRadius: 8, background: "var(--surface2)", border: "1px solid var(--border)", fontSize: 13, cursor: "pointer", color: "var(--text2)", fontWeight: 500 }}>
                        Close
                    </button>
                </div>
            </div>
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
    const [showImport, setShowImport] = useState(false)
    const [selectedRecord, setSelectedRecord] = useState<OnboardingRecord | null>(null)
    const [search, setSearch] = useState("")
    const [statusFilter, setStatusFilter] = useState<string>("ALL")
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [previewName, setPreviewName] = useState<string>("")
    const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban")

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
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowImport(true)}
                            className="inline-flex items-center gap-2 border border-[var(--border)] text-[var(--text2)] rounded-[10px] text-[13px] font-medium px-4 py-2 hover:bg-[var(--surface2)] transition-colors"
                        >
                            <Upload size={15} />
                            Import CLMS
                        </button>
                        <button
                            onClick={() => setShowStart(true)}
                            className="inline-flex items-center gap-2 bg-[var(--accent)] text-white rounded-[10px] text-[13px] font-medium px-4 py-2 hover:opacity-90 transition-opacity"
                        >
                            <Plus size={16} />
                            Start Onboarding
                        </button>
                    </div>
                )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Not Started" value={notStartedCount} color="#6b7280" bg="#f3f4f6" icon={<Clock size={18} />} />
                <StatCard label="In Progress" value={inProgressCount} color="#d97706" bg="#fef3c7" icon={<AlertCircle size={18} />} />
                <StatCard label="Completed"   value={completedCount}  color="#1a9e6e" bg="#e8f7f1" icon={<CheckCircle2 size={18} />} />
                <StatCard label="On Hold"     value={onHoldCount}     color="#ef4444" bg="#fef2f2" icon={<PauseCircle size={18} />} />
            </div>

            {/* Filters + View toggle */}
            <div className="bg-white border border-[var(--border)] rounded-[12px] p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="flex flex-wrap gap-1.5">
                    {STATUS_PILLS.map(pill => (
                        <button key={pill.value} onClick={() => setStatusFilter(pill.value)}
                            className={`px-3 py-1.5 text-[12px] font-medium rounded-full border transition-colors ${statusFilter === pill.value ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "border-[var(--border)] text-[var(--text2)] hover:border-[var(--accent)] hover:text-[var(--accent)]"}`}>
                            {pill.label}
                        </button>
                    ))}
                </div>
                <div className="relative sm:ml-auto w-full sm:w-56">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or ID..."
                        className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface2)]/30 pl-8 pr-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors" />
                </div>
                {/* View toggle */}
                <div className="flex items-center border border-[var(--border)] rounded-[8px] overflow-hidden shrink-0">
                    <button onClick={() => setViewMode("kanban")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-colors ${viewMode === "kanban" ? "bg-[var(--accent)] text-white" : "text-[var(--text2)] hover:bg-[var(--surface2)]"}`}>
                        <LayoutGrid size={13} /> Kanban
                    </button>
                    <button onClick={() => setViewMode("table")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-colors ${viewMode === "table" ? "bg-[var(--accent)] text-white" : "text-[var(--text2)] hover:bg-[var(--surface2)]"}`}>
                        <TableIcon size={13} /> Table
                    </button>
                </div>
            </div>

            {/* Content */}
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
            ) : viewMode === "kanban" ? (
                /* ── Kanban view ── */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {(["NOT_STARTED","IN_PROGRESS","COMPLETED","ON_HOLD"] as const).map(col => {
                        const colRecords = records.filter(r => r.status === col)
                        const cfg = STATUS_CONFIG[col]
                        return (
                            <div key={col}>
                                <div className="flex items-center gap-2 mb-2 px-1">
                                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color, display: "inline-block", flexShrink: 0 }} />
                                    <span className="text-[12px] font-semibold text-[var(--text2)]">{cfg.label}</span>
                                    <span className="ml-auto text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>{colRecords.length}</span>
                                </div>
                                <div className="flex flex-col gap-2 min-h-[80px] p-2 rounded-[10px] bg-[var(--surface2)]/40 border border-[var(--border)]">
                                    {colRecords.length === 0 ? (
                                        <p className="text-[11px] text-[var(--text3)] text-center py-4">No records</p>
                                    ) : colRecords.map(record => (
                                        <OnboardingCard key={record.id} record={record} onClick={() => setSelectedRecord(record)} />
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>
            ) : (
                /* ── Table view ── */
                <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-hidden">
                    <table className="w-full text-[12px]">
                        <thead>
                            <tr className="bg-[var(--surface2)] border-b border-[var(--border)]">
                                {["#","Employee","ID","Branch","Designation","Joining Date","Status","KYC","Action"].map(h => (
                                    <th key={h} className="text-left px-3 py-2.5 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide whitespace-nowrap">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {records.map((record, idx) => {
                                const cfg = STATUS_CONFIG[record.status]
                                const joiningDate = fmtDate(record.employee.dateOfJoining)
                                const isKyc = record.employee.isKycVerified
                                return (
                                    <tr key={record.id} className={`border-b border-[var(--border)] last:border-0 hover:bg-blue-50/40 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-[var(--surface2)]/30"}`}>
                                        <td className="px-3 py-2.5 text-[var(--text3)] font-medium">{idx + 1}</td>
                                        <td className="px-3 py-2.5">
                                            <div className="flex items-center gap-2">
                                                <Avatar firstName={record.employee.firstName} lastName={record.employee.lastName} photo={record.employee.photo} size={28} />
                                                <span className="font-semibold text-[var(--text)] whitespace-nowrap">{record.employee.firstName} {record.employee.lastName}</span>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5 text-[var(--text3)] whitespace-nowrap">{record.employee.employeeId}</td>
                                        <td className="px-3 py-2.5 text-[var(--text)] whitespace-nowrap">{record.employee.branch?.name || "—"}</td>
                                        <td className="px-3 py-2.5 text-[var(--text)] whitespace-nowrap">{record.employee.designation || "—"}</td>
                                        <td className="px-3 py-2.5 text-[var(--text3)] whitespace-nowrap">{joiningDate || "—"}</td>
                                        <td className="px-3 py-2.5">
                                            <span style={{ background: cfg.bg, color: cfg.color }} className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">{cfg.label}</span>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <span style={{ background: isKyc ? "#dcfce7" : "#fef3c7", color: isKyc ? "#16a34a" : "#d97706" }} className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
                                                {isKyc ? "✓ Verified" : "Pending"}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <button onClick={() => setSelectedRecord(record)}
                                                className="text-[11px] font-medium text-[var(--accent)] border border-[var(--accent)] rounded-[6px] px-2.5 py-1 hover:bg-blue-50 transition-colors whitespace-nowrap">
                                                Verify →
                                            </button>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modals */}
            <CLMSImportModal
                open={showImport}
                onClose={() => setShowImport(false)}
                onDone={fetchData}
            />
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
                    onView={(url, name) => {
                        setPreviewUrl(url)
                        setPreviewName(name)
                    }}
                />
            )}

            <DocumentViewer 
                url={previewUrl} 
                fileName={previewName} 
                onClose={() => setPreviewUrl(null)} 
            />
        </div>
    )
}
