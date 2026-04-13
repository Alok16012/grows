"use client"
import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    FolderOpen, Plus, Loader2, X, Pencil, Trash2, FileText,
    CheckCircle2, AlertCircle, ToggleLeft, ToggleRight, ChevronRight
} from "lucide-react"

type DocType = {
    id: string
    name: string
    description?: string
    templateContent?: string
    requiresApproval: boolean
    autoGenerate: boolean
    isActive: boolean
    createdAt: string
    _count?: { documents: number }
}

const TEMPLATE_VARIABLES = [
    "{{employee_name}}",
    "{{employee_id}}",
    "{{designation}}",
    "{{department}}",
    "{{joining_date}}",
    "{{effective_date}}",
    "{{salary}}",
    "{{company_name}}",
]

type FormState = {
    name: string
    description: string
    templateContent: string
    autoGenerate: boolean
    requiresApproval: boolean
}

const DEFAULT_FORM: FormState = {
    name: "",
    description: "",
    templateContent: "",
    autoGenerate: false,
    requiresApproval: true,
}

// ─── TypeModal ─────────────────────────────────────────────────────────────
function TypeModal({
    existing,
    onClose,
    onSaved,
}: {
    existing?: DocType | null
    onClose: () => void
    onSaved: () => void
}) {
    const [form, setForm] = useState<FormState>(
        existing
            ? {
                name: existing.name,
                description: existing.description ?? "",
                templateContent: existing.templateContent ?? "",
                autoGenerate: existing.autoGenerate,
                requiresApproval: existing.requiresApproval,
            }
            : DEFAULT_FORM
    )
    const [loading, setLoading] = useState(false)

    const handleSubmit = async () => {
        if (!form.name.trim()) { toast.error("Name is required"); return }
        setLoading(true)
        try {
            const url = existing ? `/api/hr-documents/types/${existing.id}` : "/api/hr-documents/types"
            const method = existing ? "PUT" : "POST"
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success(existing ? "Document type updated!" : "Document type created!")
            onSaved()
            onClose()
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Failed")
        } finally {
            setLoading(false)
        }
    }

    const insertVariable = (variable: string) => {
        setForm(f => ({ ...f, templateContent: f.templateContent + variable }))
    }

    const inputCls = "w-full h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-[16px] border border-[var(--border)] w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] sticky top-0 bg-white z-10">
                    <h2 className="text-[16px] font-semibold text-[var(--text)] flex items-center gap-2">
                        <FolderOpen size={18} className="text-[var(--accent)]" />
                        {existing ? "Edit Document Type" : "Add Document Type"}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-md hover:bg-[var(--surface2)] text-[var(--text3)]"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-4">
                    {/* Name */}
                    <div>
                        <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">
                            Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            className={inputCls}
                            placeholder="e.g. Offer Letter, Experience Letter..."
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Description</label>
                        <input
                            type="text"
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            className={inputCls}
                            placeholder="Brief description of this document type..."
                        />
                    </div>

                    {/* Toggles */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center justify-between bg-[var(--surface)] rounded-[10px] p-3">
                            <div>
                                <p className="text-[13px] font-medium text-[var(--text)]">Requires Approval</p>
                                <p className="text-[11px] text-[var(--text3)]">Must be approved before issuing</p>
                            </div>
                            <button
                                onClick={() => setForm(f => ({ ...f, requiresApproval: !f.requiresApproval }))}
                                className={`shrink-0 transition-colors ${form.requiresApproval ? "text-[var(--accent)]" : "text-[var(--text3)]"}`}
                            >
                                {form.requiresApproval
                                    ? <ToggleRight size={28} />
                                    : <ToggleLeft size={28} />}
                            </button>
                        </div>
                        <div className="flex items-center justify-between bg-[var(--surface)] rounded-[10px] p-3">
                            <div>
                                <p className="text-[13px] font-medium text-[var(--text)]">Auto Generate</p>
                                <p className="text-[11px] text-[var(--text3)]">Automatically generate on trigger</p>
                            </div>
                            <button
                                onClick={() => setForm(f => ({ ...f, autoGenerate: !f.autoGenerate }))}
                                className={`shrink-0 transition-colors ${form.autoGenerate ? "text-[var(--accent)]" : "text-[var(--text3)]"}`}
                            >
                                {form.autoGenerate
                                    ? <ToggleRight size={28} />
                                    : <ToggleLeft size={28} />}
                            </button>
                        </div>
                    </div>

                    {/* Template variables hint */}
                    <div>
                        <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">
                            Template Content
                            <span className="font-normal text-[var(--text3)] ml-1">(use variables below)</span>
                        </label>
                        {/* Variable chips */}
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {TEMPLATE_VARIABLES.map(v => (
                                <button
                                    key={v}
                                    onClick={() => insertVariable(v)}
                                    className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 border border-[var(--accent)]/20 transition-colors"
                                >
                                    {v}
                                </button>
                            ))}
                        </div>
                        <textarea
                            value={form.templateContent}
                            onChange={e => setForm(f => ({ ...f, templateContent: e.target.value }))}
                            rows={10}
                            className="w-full rounded-[8px] border border-[var(--border)] bg-white px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] font-mono resize-y transition-colors"
                            placeholder="Dear {{employee_name}},&#10;&#10;We are pleased to offer you the position of {{designation}}...&#10;&#10;Regards,&#10;HR Department&#10;{{company_name}}"
                        />
                        <p className="text-[11px] text-[var(--text3)] mt-1 flex items-center gap-1">
                            <AlertCircle size={11} />
                            Click variable chips above to insert them at cursor position
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-[var(--border)] flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-[13px] text-[var(--text2)] hover:bg-[var(--surface2)] rounded-[8px] transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="flex items-center gap-2 px-5 py-2 bg-[var(--accent)] text-white rounded-[8px] text-[13px] font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                        {loading && <Loader2 size={14} className="animate-spin" />}
                        {existing ? "Save Changes" : "Create Type"}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DocumentTypesPage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const [types, setTypes] = useState<DocType[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editingType, setEditingType] = useState<DocType | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const role = session?.user?.role as string | undefined
    const isAdmin = role === "ADMIN" || role === "HR_MANAGER"

    const loadTypes = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch("/api/hr-documents/types")
            if (res.ok) setTypes(await res.json())
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }, [])

    useEffect(() => {
        if (status === "unauthenticated") { router.push("/login"); return }
        if (status === "authenticated") {
            if (!isAdmin) { router.push("/documents"); return }
            loadTypes()
        }
    }, [status, isAdmin, router, loadTypes])

    const handleDelete = async (id: string) => {
        if (!confirm("Deactivate this document type?")) return
        setDeletingId(id)
        try {
            const res = await fetch(`/api/hr-documents/types/${id}`, { method: "DELETE" })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Document type deactivated")
            loadTypes()
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Failed")
        } finally { setDeletingId(null) }
    }

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
                    <div className="flex items-center gap-2 text-[13px] text-[var(--text3)] mb-1">
                        <span
                            onClick={() => router.push("/documents")}
                            className="hover:text-[var(--accent)] cursor-pointer transition-colors"
                        >
                            Documents
                        </span>
                        <ChevronRight size={13} />
                        <span className="text-[var(--text)]">Document Types</span>
                    </div>
                    <h1 className="text-[22px] font-semibold text-[var(--text)] flex items-center gap-2">
                        <FolderOpen size={22} className="text-[var(--accent)]" /> Document Types
                    </h1>
                    <p className="text-[13px] text-[var(--text3)] mt-0.5">
                        Manage document templates and settings
                    </p>
                </div>
                <button
                    onClick={() => { setEditingType(null); setShowModal(true) }}
                    className="flex items-center gap-2 bg-[var(--accent)] text-white rounded-[10px] text-[13px] font-medium px-4 py-2 hover:opacity-90 transition-opacity"
                >
                    <Plus size={16} /> Add Document Type
                </button>
            </div>

            {/* Summary bar */}
            <div className="bg-white border border-[var(--border)] rounded-[12px] p-4 flex items-center gap-6">
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-[8px] bg-[var(--accent)]/10 flex items-center justify-center">
                        <FolderOpen size={16} className="text-[var(--accent)]" />
                    </div>
                    <div>
                        <p className="text-[11px] text-[var(--text3)]">Total Types</p>
                        <p className="text-[18px] font-bold text-[var(--text)]">{types.length}</p>
                    </div>
                </div>
                <div className="h-8 w-px bg-[var(--border)]" />
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-[8px] bg-amber-50 flex items-center justify-center">
                        <AlertCircle size={16} className="text-amber-500" />
                    </div>
                    <div>
                        <p className="text-[11px] text-[var(--text3)]">Requires Approval</p>
                        <p className="text-[18px] font-bold text-[var(--text)]">
                            {types.filter(t => t.requiresApproval).length}
                        </p>
                    </div>
                </div>
                <div className="h-8 w-px bg-[var(--border)]" />
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-[8px] bg-green-50 flex items-center justify-center">
                        <CheckCircle2 size={16} className="text-green-600" />
                    </div>
                    <div>
                        <p className="text-[11px] text-[var(--text3)]">Direct Issue</p>
                        <p className="text-[18px] font-bold text-[var(--text)]">
                            {types.filter(t => !t.requiresApproval).length}
                        </p>
                    </div>
                </div>
            </div>

            {/* Cards Grid */}
            {types.length === 0 ? (
                <div className="bg-white border border-[var(--border)] rounded-[14px] flex flex-col items-center justify-center py-20 text-center">
                    <FolderOpen size={40} className="text-[var(--text3)] mb-3" />
                    <p className="text-[15px] font-semibold text-[var(--text)]">No document types yet</p>
                    <p className="text-[13px] text-[var(--text3)] mt-1">Click &ldquo;Add Document Type&rdquo; to create your first template.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {types.map(type => (
                        <div
                            key={type.id}
                            className="bg-white border border-[var(--border)] rounded-[14px] p-5 hover:shadow-md transition-shadow group flex flex-col gap-3"
                        >
                            {/* Card Header */}
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="h-9 w-9 rounded-[10px] bg-[var(--accent)]/10 flex items-center justify-center shrink-0">
                                        <FileText size={16} className="text-[var(--accent)]" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-[14px] font-semibold text-[var(--text)] truncate">{type.name}</h3>
                                        {type.description && (
                                            <p className="text-[11px] text-[var(--text3)] mt-0.5 line-clamp-1">{type.description}</p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => { setEditingType(type); setShowModal(true) }}
                                        className="p-1.5 rounded-[6px] text-[var(--text3)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
                                        title="Edit"
                                    >
                                        <Pencil size={13} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(type.id)}
                                        disabled={deletingId === type.id}
                                        className="p-1.5 rounded-[6px] text-[var(--text3)] hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                                        title="Deactivate"
                                    >
                                        {deletingId === type.id
                                            ? <Loader2 size={13} className="animate-spin" />
                                            : <Trash2 size={13} />}
                                    </button>
                                </div>
                            </div>

                            {/* Badges */}
                            <div className="flex flex-wrap gap-1.5">
                                {type.requiresApproval ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-amber-50 text-amber-600 border border-amber-100">
                                        <AlertCircle size={10} /> Requires Approval
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-green-50 text-green-600 border border-green-100">
                                        <CheckCircle2 size={10} /> Direct Issue
                                    </span>
                                )}
                                {type.autoGenerate && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-blue-50 text-blue-600 border border-blue-100">
                                        Auto Generate
                                    </span>
                                )}
                            </div>

                            {/* Template preview */}
                            {type.templateContent && (
                                <div className="bg-[var(--surface)] rounded-[8px] p-2.5 border border-[var(--border)]">
                                    <p className="text-[10px] font-semibold text-[var(--text3)] uppercase tracking-wide mb-1">Template Preview</p>
                                    <p className="text-[11px] text-[var(--text2)] line-clamp-3 font-mono leading-relaxed">
                                        {type.templateContent}
                                    </p>
                                </div>
                            )}

                            {/* Footer */}
                            <div className="flex items-center justify-between mt-auto pt-2 border-t border-[var(--border)]">
                                <span className="text-[11px] text-[var(--text3)]">
                                    {type._count?.documents ?? 0} document{(type._count?.documents ?? 0) !== 1 ? "s" : ""} generated
                                </span>
                                <button
                                    onClick={() => { setEditingType(type); setShowModal(true) }}
                                    className="text-[12px] text-[var(--accent)] hover:underline font-medium"
                                >
                                    Edit Template
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showModal && (
                <TypeModal
                    existing={editingType}
                    onClose={() => { setShowModal(false); setEditingType(null) }}
                    onSaved={loadTypes}
                />
            )}
        </div>
    )
}
