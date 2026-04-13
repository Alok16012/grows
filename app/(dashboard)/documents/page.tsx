"use client"
import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    FileText, Plus, Search, Download, CheckCircle2, Clock, FileX,
    Loader2, Eye, Send, X, Trash2, AlertCircle,
    FileCheck, FilePlus, FileSearch, Pencil
} from "lucide-react"

// Types
type DocStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "ISSUED"
type DocType = {
    id: string
    name: string
    description?: string
    templateContent?: string
    requiresApproval: boolean
    autoGenerate: boolean
    _count?: { documents: number }
}
type Employee = {
    id: string
    employeeId: string
    firstName: string
    lastName: string
    designation?: string
    branch?: { name: string }
}
type HrDoc = {
    id: string
    docNumber: string
    status: DocStatus
    createdAt: string
    effectiveDate?: string
    issuedAt?: string
    remarks?: string
    rejectionNote?: string
    acknowledged: boolean
    employee: {
        employeeId: string
        firstName: string
        lastName: string
        designation?: string
        branch?: { name: string }
    }
    type: { id: string; name: string; requiresApproval: boolean }
}
type Stats = { total: number; draft: number; pendingApproval: number; approved: number; issued: number }

const STATUS_CONFIG: Record<DocStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    DRAFT:            { label: "Draft",            color: "text-[#6b7280]", bg: "bg-[#f3f4f6]",   icon: <Pencil size={11} /> },
    PENDING_APPROVAL: { label: "Pending Approval", color: "text-[#d97706]", bg: "bg-[#fef3c7]",   icon: <Clock size={11} /> },
    APPROVED:         { label: "Approved",          color: "text-[#0d6b4a]", bg: "bg-[#e8f7f1]",   icon: <CheckCircle2 size={11} /> },
    REJECTED:         { label: "Rejected",          color: "text-[#dc2626]", bg: "bg-[#fef2f2]",   icon: <FileX size={11} /> },
    ISSUED:           { label: "Issued",            color: "text-[#1d4ed8]", bg: "bg-[#eff6ff]",   icon: <FileCheck size={11} /> },
}

function StatusBadge({ status }: { status: DocStatus }) {
    const c = STATUS_CONFIG[status]
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${c.bg} ${c.color}`}>
            {c.icon} {c.label}
        </span>
    )
}

// ─── Generate Modal ──────────────────────────────────────────────────────────
function GenerateModal({ onClose, onSaved, employees, docTypes }: {
    onClose: () => void
    onSaved: () => void
    employees: Employee[]
    docTypes: DocType[]
}) {
    const [form, setForm] = useState({ employeeId: "", typeId: "", effectiveDate: "", remarks: "" })
    const [preview, setPreview] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [action, setAction] = useState<"draft" | "send_approval" | "issue">("draft")
    const selectedType = docTypes.find(t => t.id === form.typeId)
    const selectedEmp = employees.find(e => e.id === form.employeeId)

    const handlePreview = () => {
        if (!selectedType?.templateContent) return
        let content = selectedType.templateContent
        if (selectedEmp) {
            content = content
                .replace(/\{\{employee_name\}\}/g, `${selectedEmp.firstName} ${selectedEmp.lastName}`)
                .replace(/\{\{designation\}\}/g, selectedEmp.designation || "")
                .replace(/\{\{employee_id\}\}/g, selectedEmp.employeeId)
                .replace(/\{\{effective_date\}\}/g, form.effectiveDate ? new Date(form.effectiveDate).toLocaleDateString("en-IN") : new Date().toLocaleDateString("en-IN"))
        }
        setPreview(content)
    }

    const handleSubmit = async () => {
        if (!form.employeeId || !form.typeId) { toast.error("Select employee and document type"); return }
        setLoading(true)
        try {
            const res = await fetch("/api/hr-documents", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...form, action })
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Document created!")
            onSaved(); onClose()
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Failed")
        } finally { setLoading(false) }
    }

    const inputCls = "w-full h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)]"

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-[16px] border border-[var(--border)] w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] sticky top-0 bg-white z-10">
                    <h2 className="text-[16px] font-semibold text-[var(--text)] flex items-center gap-2">
                        <FilePlus size={18} className="text-[var(--accent)]" /> Generate Document
                    </h2>
                    <button onClick={onClose} className="p-1 rounded-md hover:bg-[var(--surface2)] text-[var(--text3)]">
                        <X size={18} />
                    </button>
                </div>
                <div className="px-6 py-5 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[12px] text-[var(--text2)] mb-1">Employee *</label>
                            <select
                                value={form.employeeId}
                                onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}
                                className={inputCls}
                            >
                                <option value="">Select Employee</option>
                                {employees.map(e => (
                                    <option key={e.id} value={e.id}>
                                        {e.firstName} {e.lastName} ({e.employeeId})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[12px] text-[var(--text2)] mb-1">Document Type *</label>
                            <select
                                value={form.typeId}
                                onChange={e => setForm(f => ({ ...f, typeId: e.target.value }))}
                                className={inputCls}
                            >
                                <option value="">Select Type</option>
                                {docTypes.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[12px] text-[var(--text2)] mb-1">Effective Date</label>
                            <input
                                type="date"
                                value={form.effectiveDate}
                                onChange={e => setForm(f => ({ ...f, effectiveDate: e.target.value }))}
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <label className="block text-[12px] text-[var(--text2)] mb-1">Remarks</label>
                            <input
                                type="text"
                                value={form.remarks}
                                onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
                                className={inputCls}
                                placeholder="Optional remarks..."
                            />
                        </div>
                    </div>

                    {selectedType && (
                        <div className="bg-[var(--surface)] rounded-[10px] p-3 text-[12px] text-[var(--text2)] flex items-start gap-2">
                            <AlertCircle size={14} className="text-[var(--accent)] shrink-0 mt-0.5" />
                            <span>
                                {selectedType.requiresApproval
                                    ? "This document requires approval before issuance."
                                    : "This document can be issued directly without approval."}
                            </span>
                        </div>
                    )}

                    {/* Preview */}
                    {preview && (
                        <div className="border border-[var(--border)] rounded-[10px] p-4">
                            <p className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide mb-2">
                                Document Preview
                            </p>
                            <pre className="text-[12px] text-[var(--text2)] whitespace-pre-wrap font-sans leading-relaxed">
                                {preview}
                            </pre>
                        </div>
                    )}

                    {/* Action Selection */}
                    <div className="flex gap-2 flex-wrap">
                        {(["draft", "send_approval", "issue"] as const).map(a => (
                            <button
                                key={a}
                                onClick={() => setAction(a)}
                                className={`px-3 py-1.5 rounded-[8px] text-[12px] font-medium border transition-colors ${
                                    action === a
                                        ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                                        : "border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)]"
                                }`}
                            >
                                {a === "draft" ? "Save as Draft" : a === "send_approval" ? "Send for Approval" : "Issue Directly"}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="px-6 py-4 border-t border-[var(--border)] flex justify-between items-center">
                    <button
                        onClick={handlePreview}
                        disabled={!form.typeId}
                        className="flex items-center gap-2 px-4 py-2 border border-[var(--border)] rounded-[8px] text-[13px] text-[var(--text2)] hover:bg-[var(--surface2)] disabled:opacity-40"
                    >
                        <Eye size={14} /> Preview
                    </button>
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-[13px] text-[var(--text2)] hover:bg-[var(--surface2)] rounded-[8px]"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={loading}
                            className="flex items-center gap-2 px-5 py-2 bg-[var(--accent)] text-white rounded-[8px] text-[13px] font-medium hover:opacity-90 disabled:opacity-50"
                        >
                            {loading && <Loader2 size={14} className="animate-spin" />} Generate
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─── View/Action Modal ────────────────────────────────────────────────────────
function DocViewModal({
    doc,
    onClose,
    onRefresh,
    isAdmin,
}: {
    doc: HrDoc
    onClose: () => void
    onRefresh: () => void
    isAdmin: boolean
}) {
    const [loading, setLoading] = useState<string | null>(null)
    const [fullDoc, setFullDoc] = useState<{ content: string } | null>(null)
    const [rejNote, setRejNote] = useState("")
    const [showRej, setShowRej] = useState(false)

    useEffect(() => {
        fetch(`/api/hr-documents/${doc.id}`)
            .then(r => r.json())
            .then(setFullDoc)
            .catch(() => {})
    }, [doc.id])

    const doAction = async (action: string, extra?: Record<string, string>) => {
        setLoading(action)
        try {
            const res = await fetch(`/api/hr-documents/${doc.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, ...extra })
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success(`Document ${action.replace("_", " ")} successfully!`)
            onRefresh(); onClose()
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Action failed")
        } finally { setLoading(null) }
    }

    const downloadDoc = () => {
        if (!fullDoc?.content) return
        const blob = new Blob([fullDoc.content], { type: "text/plain" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${doc.type.name}_${doc.employee.employeeId}_${doc.docNumber}.txt`
        a.click()
        URL.revokeObjectURL(url)
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-[16px] border border-[var(--border)] w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] sticky top-0 bg-white z-10">
                    <div>
                        <h2 className="text-[15px] font-semibold text-[var(--text)]">{doc.type.name}</h2>
                        <p className="text-[11px] text-[var(--text3)]">
                            {doc.docNumber} · {doc.employee.firstName} {doc.employee.lastName}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <StatusBadge status={doc.status} />
                        <button
                            onClick={onClose}
                            className="p-1 rounded-md hover:bg-[var(--surface2)] text-[var(--text3)]"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>
                <div className="px-6 py-5 space-y-4">
                    {fullDoc?.content && (
                        <div className="border border-[var(--border)] rounded-[10px] p-4 bg-[var(--surface)]">
                            <p className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide mb-3">
                                Document Content
                            </p>
                            <pre className="text-[13px] text-[var(--text)] whitespace-pre-wrap font-sans leading-relaxed">
                                {fullDoc.content}
                            </pre>
                        </div>
                    )}
                    {doc.rejectionNote && (
                        <div className="bg-red-50 border border-red-100 rounded-[10px] p-3 text-[12px] text-red-700">
                            <span className="font-semibold">Rejection Reason: </span>{doc.rejectionNote}
                        </div>
                    )}
                    {showRej && (
                        <div>
                            <label className="block text-[12px] text-[var(--text2)] mb-1">Rejection Reason *</label>
                            <textarea
                                value={rejNote}
                                onChange={e => setRejNote(e.target.value)}
                                rows={3}
                                className="w-full rounded-[8px] border border-[var(--border)] px-3 py-2 text-[13px] outline-none focus:border-red-400 resize-none"
                                placeholder="State reason for rejection..."
                            />
                        </div>
                    )}
                </div>
                <div className="px-6 py-4 border-t border-[var(--border)] flex flex-wrap gap-2 justify-between">
                    <button
                        onClick={downloadDoc}
                        className="flex items-center gap-2 px-4 py-2 border border-[var(--border)] rounded-[8px] text-[13px] text-[var(--text2)] hover:bg-[var(--surface2)]"
                    >
                        <Download size={14} /> Download
                    </button>
                    <div className="flex gap-2 flex-wrap">
                        {isAdmin && doc.status === "DRAFT" && (
                            <button
                                onClick={() => doAction("send_approval")}
                                disabled={!!loading}
                                className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-[8px] text-[13px] font-medium hover:opacity-90 disabled:opacity-50"
                            >
                                {loading === "send_approval" && <Loader2 size={13} className="animate-spin" />}
                                <Send size={13} /> Send for Approval
                            </button>
                        )}
                        {isAdmin && doc.status === "PENDING_APPROVAL" && !showRej && (
                            <>
                                <button
                                    onClick={() => doAction("approve")}
                                    disabled={!!loading}
                                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-[8px] text-[13px] font-medium hover:opacity-90 disabled:opacity-50"
                                >
                                    {loading === "approve" && <Loader2 size={13} className="animate-spin" />}
                                    <CheckCircle2 size={13} /> Approve
                                </button>
                                <button
                                    onClick={() => setShowRej(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-[8px] text-[13px] font-medium hover:opacity-90"
                                >
                                    <FileX size={13} /> Reject
                                </button>
                            </>
                        )}
                        {showRej && (
                            <>
                                <button
                                    onClick={() => setShowRej(false)}
                                    className="px-4 py-2 border border-[var(--border)] rounded-[8px] text-[13px] text-[var(--text2)]"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => doAction("reject", { rejectionNote: rejNote })}
                                    disabled={!rejNote.trim() || !!loading}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-[8px] text-[13px] font-medium hover:opacity-90 disabled:opacity-50"
                                >
                                    {loading === "reject" && <Loader2 size={13} className="animate-spin" />}
                                    Confirm Reject
                                </button>
                            </>
                        )}
                        {isAdmin && doc.status === "APPROVED" && (
                            <button
                                onClick={() => doAction("issue")}
                                disabled={!!loading}
                                className="flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-white rounded-[8px] text-[13px] font-medium hover:opacity-90 disabled:opacity-50"
                            >
                                {loading === "issue" && <Loader2 size={13} className="animate-spin" />}
                                <FileCheck size={13} /> Issue Document
                            </button>
                        )}
                        {!isAdmin && doc.status === "ISSUED" && !doc.acknowledged && (
                            <button
                                onClick={() => doAction("acknowledge")}
                                disabled={!!loading}
                                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-[8px] text-[13px] font-medium hover:opacity-90 disabled:opacity-50"
                            >
                                {loading === "acknowledge" && <Loader2 size={13} className="animate-spin" />}
                                <CheckCircle2 size={13} /> Acknowledge Receipt
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DocumentsPage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const [docs, setDocs] = useState<HrDoc[]>([])
    const [employees, setEmployees] = useState<Employee[]>([])
    const [docTypes, setDocTypes] = useState<DocType[]>([])
    const [stats, setStats] = useState<Stats | null>(null)
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [activeTab, setActiveTab] = useState<"ALL" | DocStatus>("ALL")
    const [showGenerate, setShowGenerate] = useState(false)
    const [viewDoc, setViewDoc] = useState<HrDoc | null>(null)
    const role = session?.user?.role as string | undefined
    const isAdmin = role === "ADMIN" || role === "MANAGER" || role === "HR_MANAGER"

    const loadAll = useCallback(async () => {
        setLoading(true)
        try {
            const [docsRes, typesRes, statsRes, empsRes] = await Promise.all([
                fetch("/api/hr-documents"),
                fetch("/api/hr-documents/types"),
                fetch("/api/hr-documents/stats"),
                isAdmin ? fetch("/api/employees") : Promise.resolve(null)
            ])
            if (docsRes.ok) setDocs(await docsRes.json())
            if (typesRes.ok) setDocTypes(await typesRes.json())
            if (statsRes.ok) setStats(await statsRes.json())
            if (empsRes?.ok) {
                const data = await empsRes.json()
                setEmployees(Array.isArray(data) ? data : (data.data ?? []))
            }
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }, [isAdmin])

    useEffect(() => {
        if (status === "unauthenticated") router.push("/login")
        else if (status === "authenticated") loadAll()
    }, [status, router, loadAll])

    const filtered = docs.filter(d => {
        const matchTab = activeTab === "ALL" || d.status === activeTab
        const matchSearch = !search ||
            `${d.employee.firstName} ${d.employee.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
            d.employee.employeeId.toLowerCase().includes(search.toLowerCase()) ||
            d.type.name.toLowerCase().includes(search.toLowerCase()) ||
            d.docNumber.toLowerCase().includes(search.toLowerCase())
        return matchTab && matchSearch
    })

    const TABS: { key: "ALL" | DocStatus; label: string; count: number }[] = [
        { key: "ALL",              label: "All",             count: docs.length },
        { key: "DRAFT",            label: "Draft",           count: stats?.draft ?? 0 },
        { key: "PENDING_APPROVAL", label: "Pending Approval",count: stats?.pendingApproval ?? 0 },
        { key: "APPROVED",         label: "Approved",        count: stats?.approved ?? 0 },
        { key: "ISSUED",           label: "Issued",          count: stats?.issued ?? 0 },
    ]

    if (status === "loading" || loading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <Loader2 size={28} className="animate-spin text-[var(--accent)]" />
            </div>
        )
    }

    return (
        <div className="space-y-5 max-w-screen-xl mx-auto pb-12">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-[22px] font-semibold text-[var(--text)] flex items-center gap-2">
                        <FileText size={22} className="text-[var(--accent)]" /> Document Management
                    </h1>
                    <p className="text-[13px] text-[var(--text3)] mt-0.5">Generate, approve, and issue HR documents</p>
                </div>
                {isAdmin && (
                    <button
                        onClick={() => setShowGenerate(true)}
                        className="flex items-center gap-2 bg-[var(--accent)] text-white rounded-[10px] text-[13px] font-medium px-4 py-2 hover:opacity-90"
                    >
                        <Plus size={16} /> Generate Document
                    </button>
                )}
            </div>

            {/* Stats */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        { label: "Total Documents", value: stats.total,          color: "text-[var(--accent)]",  border: "border-l-[var(--accent)]" },
                        { label: "Pending Approval", value: stats.pendingApproval,color: "text-amber-600",        border: "border-l-amber-400" },
                        { label: "Draft",            value: stats.draft,          color: "text-[var(--text2)]",   border: "border-l-gray-400" },
                        { label: "Issued",           value: stats.issued,         color: "text-blue-600",         border: "border-l-blue-400" },
                    ].map(c => (
                        <div
                            key={c.label}
                            className={`bg-white border border-[var(--border)] border-l-4 ${c.border} rounded-[12px] p-4`}
                        >
                            <p className="text-[11px] text-[var(--text3)] uppercase tracking-wide">{c.label}</p>
                            <p className={`text-[24px] font-bold mt-1 ${c.color}`}>{c.value}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Filters */}
            <div className="bg-white border border-[var(--border)] rounded-[12px] p-4 flex flex-wrap gap-3 items-center">
                {/* Tabs */}
                <div className="flex gap-1 bg-[var(--surface)] rounded-[10px] p-1 flex-wrap">
                    {TABS.map(t => (
                        <button
                            key={t.key}
                            onClick={() => setActiveTab(t.key)}
                            className={`px-3 py-1 rounded-[7px] text-[12px] font-medium transition-colors flex items-center gap-1.5 ${
                                activeTab === t.key
                                    ? "bg-white text-[var(--text)] shadow-sm"
                                    : "text-[var(--text3)] hover:text-[var(--text)]"
                            }`}
                        >
                            {t.label}
                            {t.count > 0 && (
                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                    activeTab === t.key
                                        ? "bg-[var(--accent)] text-white"
                                        : "bg-[var(--border)] text-[var(--text3)]"
                                }`}>
                                    {t.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
                {/* Search */}
                <div className="relative ml-auto">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search employee, doc type..."
                        className="h-9 pl-8 pr-3 border border-[var(--border)] rounded-[8px] text-[13px] bg-[var(--surface2)]/30 outline-none focus:border-[var(--accent)] w-60"
                    />
                </div>
            </div>

            {/* Documents Table */}
            <div className="bg-white border border-[var(--border)] rounded-[14px] overflow-hidden">
                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <FileSearch size={36} className="text-[var(--text3)] mb-2" />
                        <p className="text-[15px] font-semibold text-[var(--text)]">No documents found</p>
                        <p className="text-[13px] text-[var(--text3)] mt-1">
                            {isAdmin ? "Click \"Generate Document\" to create one." : "No documents issued to you yet."}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className="bg-[var(--surface)] border-b border-[var(--border)]">
                                    <th className="px-4 py-3 text-left font-semibold text-[var(--text3)] text-[11px] uppercase tracking-wide">Doc No.</th>
                                    <th className="px-4 py-3 text-left font-semibold text-[var(--text3)] text-[11px] uppercase tracking-wide">Employee</th>
                                    <th className="px-4 py-3 text-left font-semibold text-[var(--text3)] text-[11px] uppercase tracking-wide">Document Type</th>
                                    <th className="px-4 py-3 text-left font-semibold text-[var(--text3)] text-[11px] uppercase tracking-wide">Status</th>
                                    <th className="px-4 py-3 text-left font-semibold text-[var(--text3)] text-[11px] uppercase tracking-wide">Date</th>
                                    <th className="px-4 py-3 text-left font-semibold text-[var(--text3)] text-[11px] uppercase tracking-wide">Ack.</th>
                                    <th className="px-4 py-3 text-right font-semibold text-[var(--text3)] text-[11px] uppercase tracking-wide">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]">
                                {filtered.map(doc => (
                                    <tr key={doc.id} className="hover:bg-[var(--surface)] transition-colors">
                                        <td className="px-4 py-3 font-mono text-[11px] text-[var(--text3)]">{doc.docNumber}</td>
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-[var(--text)]">
                                                {doc.employee.firstName} {doc.employee.lastName}
                                            </p>
                                            <p className="text-[11px] text-[var(--text3)]">
                                                {doc.employee.employeeId} · {doc.employee.designation || "—"}
                                            </p>
                                        </td>
                                        <td className="px-4 py-3 text-[var(--text2)]">{doc.type.name}</td>
                                        <td className="px-4 py-3"><StatusBadge status={doc.status} /></td>
                                        <td className="px-4 py-3 text-[var(--text3)] text-[12px]">
                                            {doc.issuedAt
                                                ? new Date(doc.issuedAt).toLocaleDateString("en-IN")
                                                : new Date(doc.createdAt).toLocaleDateString("en-IN")}
                                        </td>
                                        <td className="px-4 py-3">
                                            {doc.status === "ISSUED" ? (
                                                doc.acknowledged
                                                    ? <span className="text-green-600 text-[11px] font-semibold flex items-center gap-1"><CheckCircle2 size={11} />Yes</span>
                                                    : <span className="text-amber-600 text-[11px]">Pending</span>
                                            ) : (
                                                <span className="text-[var(--text3)] text-[11px]">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                onClick={() => setViewDoc(doc)}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[var(--border)] rounded-[7px] text-[12px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)] transition-colors"
                                            >
                                                <Eye size={13} /> View
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {showGenerate && (
                <GenerateModal
                    onClose={() => setShowGenerate(false)}
                    onSaved={loadAll}
                    employees={employees}
                    docTypes={docTypes}
                />
            )}
            {viewDoc && (
                <DocViewModal
                    doc={viewDoc}
                    onClose={() => setViewDoc(null)}
                    onRefresh={loadAll}
                    isAdmin={isAdmin}
                />
            )}
        </div>
    )
}
