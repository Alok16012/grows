"use client"
import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    Plus, X, Loader2, Users, Briefcase, Search, Pencil, Trash2
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

type Department = {
    id: string
    name: string
    description?: string
    isActive: boolean
    createdAt: string
    _count: { employees: number }
}

// ─── Add/Edit Department Modal ────────────────────────────────────────────────

function DeptModal({
    open, onClose, onSaved, editDept
}: {
    open: boolean; onClose: () => void; onSaved: () => void; editDept?: Department | null
}) {
    const [loading, setLoading] = useState(false)
    const [form, setForm] = useState({ name: "", description: "" })

    useEffect(() => {
        if (open) {
            setForm({
                name: editDept?.name ?? "",
                description: editDept?.description ?? "",
            })
        }
    }, [open, editDept])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.name.trim()) {
            toast.error("Department name is required")
            return
        }
        setLoading(true)
        try {
            const url = editDept ? `/api/departments/${editDept.id}` : "/api/departments"
            const method = editDept ? "PUT" : "POST"
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: form.name, description: form.description }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success(editDept ? "Department updated!" : "Department created!")
            onSaved()
            onClose()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to save")
        } finally {
            setLoading(false)
        }
    }

    if (!open) return null

    const inputCls = "w-full h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-[16px] border border-[var(--border)] w-full max-w-md shadow-xl">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
                    <h2 className="text-[16px] font-semibold text-[var(--text)]">
                        {editDept ? "Edit Department" : "Add Department"}
                    </h2>
                    <button onClick={onClose} className="text-[var(--text3)] hover:text-[var(--text)] p-1 rounded-md hover:bg-[var(--surface2)] transition-colors">
                        <X size={18} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
                    <div>
                        <label className="block text-[12px] text-[var(--text2)] mb-1">Department Name *</label>
                        <input
                            value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            className={inputCls}
                            placeholder="e.g. Security Operations"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-[12px] text-[var(--text2)] mb-1">Description</label>
                        <textarea
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            className="w-full rounded-[8px] border border-[var(--border)] bg-white px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors resize-none"
                            rows={3}
                            placeholder="Optional description..."
                        />
                    </div>
                </form>
                <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-end gap-2">
                    <button onClick={onClose} type="button" className="px-4 py-2 text-[13px] font-medium text-[var(--text2)] hover:text-[var(--text)] rounded-[8px] hover:bg-[var(--surface2)] transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-5 py-2 bg-[var(--accent)] text-white rounded-[8px] text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                        {loading && <Loader2 size={14} className="animate-spin" />}
                        {editDept ? "Save Changes" : "Create Department"}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteConfirmModal({
    dept, onClose, onDeleted
}: {
    dept: Department; onClose: () => void; onDeleted: () => void
}) {
    const [loading, setLoading] = useState(false)

    const handleDelete = async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/departments/${dept.id}`, { method: "DELETE" })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Department deleted!")
            onDeleted()
            onClose()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to delete")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-[16px] border border-[var(--border)] w-full max-w-sm shadow-xl p-6">
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                        <Trash2 size={18} className="text-red-600" />
                    </div>
                    <div>
                        <p className="text-[15px] font-semibold text-[var(--text)]">Delete Department</p>
                        <p className="text-[12px] text-[var(--text3)]">This action cannot be undone</p>
                    </div>
                </div>
                <p className="text-[13px] text-[var(--text2)] mb-5">
                    Are you sure you want to delete <strong>{dept.name}</strong>?
                    {dept._count.employees > 0 && (
                        <span className="block mt-1 text-red-600 font-medium">
                            ⚠ This department has {dept._count.employees} employee(s). Move them first.
                        </span>
                    )}
                </p>
                <div className="flex gap-2 justify-end">
                    <button onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-[var(--text2)] hover:text-[var(--text)] rounded-[8px] hover:bg-[var(--surface2)] transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={handleDelete}
                        disabled={loading || dept._count.employees > 0}
                        className="inline-flex items-center gap-2 px-5 py-2 bg-red-600 text-white rounded-[8px] text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
                    >
                        {loading && <Loader2 size={14} className="animate-spin" />}
                        Delete
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DepartmentsPage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const [departments, setDepartments] = useState<Department[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [showModal, setShowModal] = useState(false)
    const [editDept, setEditDept] = useState<Department | null>(null)
    const [deleteDept, setDeleteDept] = useState<Department | null>(null)

    useEffect(() => {
        if (status === "unauthenticated") router.push("/login")
        if (status === "authenticated" && session?.user?.role !== "ADMIN" && session?.user?.role !== "MANAGER" && session?.user?.role !== "HR_MANAGER") {
            router.push("/")
        }
    }, [status, session, router])

    const fetchDepartments = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch("/api/departments")
            const data = await res.json()
            setDepartments(Array.isArray(data) ? data : [])
        } catch {
            toast.error("Failed to load departments")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        if (status === "authenticated") {
            fetchDepartments()
        }
    }, [status, fetchDepartments])

    const filtered = departments.filter(d =>
        !search ||
        d.name.toLowerCase().includes(search.toLowerCase())
    )

    const totalEmployees = departments.reduce((sum, d) => sum + d._count.employees, 0)

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
                    <h1 className="text-[24px] font-semibold tracking-[-0.4px] text-[var(--text)]">Departments</h1>
                    <p className="text-[13px] text-[var(--text3)] mt-0.5">
                        {departments.length} department{departments.length !== 1 ? "s" : ""} · {totalEmployees} employees
                    </p>
                </div>
                <button
                    onClick={() => { setEditDept(null); setShowModal(true) }}
                    className="inline-flex items-center gap-2 bg-[var(--accent)] text-white rounded-[10px] text-[13px] font-medium px-4 py-2 hover:opacity-90 transition-opacity"
                >
                    <Plus size={16} /> Add Department
                </button>
            </div>

            {/* Search */}
            <div className="bg-white border border-[var(--border)] rounded-[12px] p-4">
                <div className="relative max-w-sm">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search departments..."
                        className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface2)]/30 pl-8 pr-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                    />
                </div>
            </div>

            {/* Department Grid */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 size={28} className="animate-spin text-[var(--accent)]" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex min-h-[300px] flex-col items-center justify-center rounded-[14px] bg-white border border-dashed border-[var(--border)] shadow-sm">
                    <Briefcase size={36} className="text-[var(--text3)] mb-2" />
                    <h3 className="text-[15px] font-semibold text-[var(--text)]">No departments found</h3>
                    <p className="text-[13px] text-[var(--text3)] mt-1">Create your first department to get started.</p>
                    <button
                        onClick={() => { setEditDept(null); setShowModal(true) }}
                        className="mt-4 inline-flex items-center gap-2 bg-[var(--accent)] text-white rounded-[10px] text-[13px] font-medium px-4 py-2 hover:opacity-90 transition-opacity"
                    >
                        <Plus size={16} /> Add Department
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
                    {filtered.map(dept => (
                        <div
                            key={dept.id}
                            className="bg-white border border-[var(--border)] rounded-[14px] p-5 hover:shadow-[0_3px_14px_rgba(0,0,0,0.05)] hover:border-[var(--border2)] transition-all"
                        >
                            <div className="flex items-start gap-3 mb-4">
                                <div className="w-10 h-10 bg-[var(--accent-light)] rounded-[10px] flex items-center justify-center shrink-0">
                                    <Briefcase size={18} className="text-[var(--accent)]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-[15px] font-semibold text-[var(--text)] truncate">{dept.name}</h3>
                                    {dept.description && (
                                        <p className="text-[12px] text-[var(--text3)] mt-0.5 line-clamp-2">{dept.description}</p>
                                    )}
                                </div>
                                {dept.isActive ? (
                                    <span className="px-2 py-0.5 bg-[#e8f7f1] text-[#1a9e6e] border border-[#6ee7b7] rounded-full text-[10.5px] font-semibold whitespace-nowrap">Active</span>
                                ) : (
                                    <span className="px-2 py-0.5 bg-[#f9fafb] text-[#6b7280] border border-[#e5e7eb] rounded-full text-[10.5px] font-semibold whitespace-nowrap">Inactive</span>
                                )}
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-[13px] text-[var(--text2)]">
                                    <Users size={14} className="text-[var(--text3)] shrink-0" />
                                    <span>{dept._count.employees} employee{dept._count.employees !== 1 ? "s" : ""}</span>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => { setEditDept(dept); setShowModal(true) }}
                                        title="Edit"
                                        className="p-1.5 rounded-[7px] text-[var(--text3)] hover:text-[var(--accent)] hover:bg-[var(--accent-light)] transition-colors"
                                    >
                                        <Pencil size={14} />
                                    </button>
                                    <button
                                        onClick={() => setDeleteDept(dept)}
                                        title="Delete"
                                        className="p-1.5 rounded-[7px] text-[var(--text3)] hover:text-red-600 hover:bg-red-50 transition-colors"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add/Edit Modal */}
            <DeptModal
                open={showModal}
                onClose={() => { setShowModal(false); setEditDept(null) }}
                onSaved={fetchDepartments}
                editDept={editDept}
            />

            {/* Delete Confirm Modal */}
            {deleteDept && (
                <DeleteConfirmModal
                    dept={deleteDept}
                    onClose={() => setDeleteDept(null)}
                    onDeleted={fetchDepartments}
                />
            )}
        </div>
    )
}
