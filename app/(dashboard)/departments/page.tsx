"use client"
import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    Plus, X, Loader2, Building2, Users, Briefcase, Search
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

type Branch = { id: string; name: string; companyId?: string }

type Department = {
    id: string
    name: string
    description?: string
    branchId: string
    isActive: boolean
    createdAt: string
    branch: { id: string; name: string }
    _count: { employees: number }
}

// ─── Add Department Modal ─────────────────────────────────────────────────────

function DeptModal({
    open, onClose, onSaved, branches
}: {
    open: boolean; onClose: () => void; onSaved: () => void; branches: Branch[]
}) {
    const [loading, setLoading] = useState(false)
    const [form, setForm] = useState({ name: "", branchId: "", description: "" })

    useEffect(() => {
        if (open) setForm({ name: "", branchId: "", description: "" })
    }, [open])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.name.trim() || !form.branchId) {
            toast.error("Name and branch are required")
            return
        }
        setLoading(true)
        try {
            const res = await fetch("/api/departments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Department created!")
            onSaved()
            onClose()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to create")
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
                    <h2 className="text-[16px] font-semibold text-[var(--text)]">Add Department</h2>
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
                        <label className="block text-[12px] text-[var(--text2)] mb-1">Branch *</label>
                        <select
                            value={form.branchId}
                            onChange={e => setForm(f => ({ ...f, branchId: e.target.value }))}
                            className={inputCls}
                            required
                        >
                            <option value="">Select Branch</option>
                            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
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
                        Create Department
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
    const [branches, setBranches] = useState<Branch[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [showModal, setShowModal] = useState(false)

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
            fetch("/api/branches").then(r => r.json()).then(data => setBranches(Array.isArray(data) ? data : [])).catch(() => {})
        }
    }, [status, fetchDepartments])

    const filtered = departments.filter(d =>
        !search ||
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        d.branch.name.toLowerCase().includes(search.toLowerCase())
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
                    onClick={() => setShowModal(true)}
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
                        placeholder="Search departments or branches..."
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
                        onClick={() => setShowModal(true)}
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

                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-[13px] text-[var(--text2)]">
                                    <Building2 size={14} className="text-[var(--text3)] shrink-0" />
                                    <span className="truncate">{dept.branch.name}</span>
                                </div>
                                <div className="flex items-center gap-2 text-[13px] text-[var(--text2)]">
                                    <Users size={14} className="text-[var(--text3)] shrink-0" />
                                    <span>{dept._count.employees} employee{dept._count.employees !== 1 ? "s" : ""}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <DeptModal
                open={showModal}
                onClose={() => setShowModal(false)}
                onSaved={fetchDepartments}
                branches={branches}
            />
        </div>
    )
}
