"use client"
import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    Plus, X, Loader2, Building2, Users, MapPin, Briefcase, Search, Pencil, Trash2
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

type Company = { id: string; name: string }

type Branch = {
    id: string
    name: string
    address?: string
    city?: string
    state?: string
    isActive: boolean
    companyId: string
    createdAt: string
    company: { id: string; name: string }
    _count: { employees: number; departments: number; sites: number }
}

// ─── Branch Modal (Create / Edit) ─────────────────────────────────────────────

function BranchModal({
    open, onClose, onSaved, companies, editing
}: {
    open: boolean
    onClose: () => void
    onSaved: () => void
    companies: Company[]
    editing: Branch | null
}) {
    const [loading, setLoading] = useState(false)
    const [form, setForm] = useState({ name: "", companyId: "", address: "", city: "", state: "" })

    useEffect(() => {
        if (open) {
            if (editing) {
                setForm({
                    name: editing.name,
                    companyId: editing.companyId,
                    address: editing.address || "",
                    city: editing.city || "",
                    state: editing.state || "",
                })
            } else {
                setForm({ name: "", companyId: "", address: "", city: "", state: "" })
            }
        }
    }, [open, editing])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.name.trim() || !form.companyId) {
            toast.error("Name and company are required")
            return
        }
        setLoading(true)
        try {
            const url = editing ? `/api/branches/${editing.id}` : "/api/branches"
            const method = editing ? "PUT" : "POST"
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success(editing ? "Branch updated!" : "Branch created!")
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
                        {editing ? "Edit Branch" : "Add Branch"}
                    </h2>
                    <button onClick={onClose} className="text-[var(--text3)] hover:text-[var(--text)] p-1 rounded-md hover:bg-[var(--surface2)] transition-colors">
                        <X size={18} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
                    <div>
                        <label className="block text-[12px] text-[var(--text2)] mb-1">Branch Name *</label>
                        <input
                            value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            className={inputCls}
                            placeholder="e.g. Mumbai Office"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-[12px] text-[var(--text2)] mb-1">Company *</label>
                        <select
                            value={form.companyId}
                            onChange={e => setForm(f => ({ ...f, companyId: e.target.value }))}
                            className={inputCls}
                            required
                            disabled={!!editing}
                        >
                            <option value="">Select Company</option>
                            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[12px] text-[var(--text2)] mb-1">Address</label>
                        <input
                            value={form.address}
                            onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                            className={inputCls}
                            placeholder="Street address"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[12px] text-[var(--text2)] mb-1">City</label>
                            <input
                                value={form.city}
                                onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                                className={inputCls}
                                placeholder="City"
                            />
                        </div>
                        <div>
                            <label className="block text-[12px] text-[var(--text2)] mb-1">State</label>
                            <input
                                value={form.state}
                                onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                                className={inputCls}
                                placeholder="State"
                            />
                        </div>
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
                        {editing ? "Save Changes" : "Create Branch"}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── Delete Confirm Modal ──────────────────────────────────────────────────────

function DeleteModal({
    open, branch, onClose, onDeleted
}: {
    open: boolean
    branch: Branch | null
    onClose: () => void
    onDeleted: () => void
}) {
    const [loading, setLoading] = useState(false)

    const handleDelete = async () => {
        if (!branch) return
        setLoading(true)
        try {
            const res = await fetch(`/api/branches/${branch.id}`, { method: "DELETE" })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Branch deleted")
            onDeleted()
            onClose()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to delete")
        } finally {
            setLoading(false)
        }
    }

    if (!open || !branch) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-[16px] border border-[var(--border)] w-full max-w-sm shadow-xl p-6">
                <h2 className="text-[16px] font-semibold text-[var(--text)] mb-2">Delete Branch</h2>
                <p className="text-[13px] text-[var(--text2)] mb-1">
                    Are you sure you want to delete <span className="font-semibold text-[var(--text)]">{branch.name}</span>?
                </p>
                {(branch._count.employees > 0 || branch._count.departments > 0) && (
                    <p className="text-[12px] text-[var(--red)] mt-2 bg-red-50 border border-red-100 rounded-[8px] px-3 py-2">
                        This branch has {branch._count.employees} employee{branch._count.employees !== 1 ? "s" : ""} and {branch._count.departments} department{branch._count.departments !== 1 ? "s" : ""}. Deleting it will cascade.
                    </p>
                )}
                <div className="flex items-center justify-end gap-2 mt-5">
                    <button onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-[var(--text2)] hover:text-[var(--text)] rounded-[8px] hover:bg-[var(--surface2)] transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={handleDelete}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-5 py-2 bg-red-500 text-white rounded-[8px] text-[13px] font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
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

export default function BranchesPage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const [branches, setBranches] = useState<Branch[]>([])
    const [companies, setCompanies] = useState<Company[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [showModal, setShowModal] = useState(false)
    const [editing, setEditing] = useState<Branch | null>(null)
    const [deleting, setDeleting] = useState<Branch | null>(null)

    const isAdmin = session?.user?.role === "ADMIN"

    useEffect(() => {
        if (status === "unauthenticated") router.push("/login")
        if (status === "authenticated" && session?.user?.role !== "ADMIN" && session?.user?.role !== "MANAGER") {
            router.push("/")
        }
    }, [status, session, router])

    const fetchBranches = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch("/api/branches")
            const data = await res.json()
            setBranches(Array.isArray(data) ? data : [])
        } catch {
            toast.error("Failed to load branches")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        if (status === "authenticated") {
            fetchBranches()
            fetch("/api/companies").then(r => r.json()).then(data => setCompanies(Array.isArray(data) ? data : [])).catch(() => {})
        }
    }, [status, fetchBranches])

    const filtered = branches.filter(b =>
        !search ||
        b.name.toLowerCase().includes(search.toLowerCase()) ||
        b.company.name.toLowerCase().includes(search.toLowerCase()) ||
        (b.city || "").toLowerCase().includes(search.toLowerCase())
    )

    const totalEmployees = branches.reduce((sum, b) => sum + b._count.employees, 0)

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
                    <h1 className="text-[24px] font-semibold tracking-[-0.4px] text-[var(--text)]">Branches</h1>
                    <p className="text-[13px] text-[var(--text3)] mt-0.5">
                        {branches.length} branch{branches.length !== 1 ? "es" : ""} · {totalEmployees} employees
                    </p>
                </div>
                <button
                    onClick={() => { setEditing(null); setShowModal(true) }}
                    className="inline-flex items-center gap-2 bg-[var(--accent)] text-white rounded-[10px] text-[13px] font-medium px-4 py-2 hover:opacity-90 transition-opacity"
                >
                    <Plus size={16} /> Add Branch
                </button>
            </div>

            {/* Search */}
            <div className="bg-white border border-[var(--border)] rounded-[12px] p-4">
                <div className="relative max-w-sm">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search branches or companies..."
                        className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface2)]/30 pl-8 pr-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                    />
                </div>
            </div>

            {/* Branch Grid */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 size={28} className="animate-spin text-[var(--accent)]" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex min-h-[300px] flex-col items-center justify-center rounded-[14px] bg-white border border-dashed border-[var(--border)] shadow-sm">
                    <Building2 size={36} className="text-[var(--text3)] mb-2" />
                    <h3 className="text-[15px] font-semibold text-[var(--text)]">No branches found</h3>
                    <p className="text-[13px] text-[var(--text3)] mt-1">Create your first branch to get started.</p>
                    <button
                        onClick={() => { setEditing(null); setShowModal(true) }}
                        className="mt-4 inline-flex items-center gap-2 bg-[var(--accent)] text-white rounded-[10px] text-[13px] font-medium px-4 py-2 hover:opacity-90 transition-opacity"
                    >
                        <Plus size={16} /> Add Branch
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
                    {filtered.map(branch => (
                        <div
                            key={branch.id}
                            className="bg-white border border-[var(--border)] rounded-[14px] p-5 hover:shadow-[0_3px_14px_rgba(0,0,0,0.05)] hover:border-[var(--border2)] transition-all"
                        >
                            <div className="flex items-start gap-3 mb-4">
                                <div className="w-10 h-10 bg-[var(--accent-light)] rounded-[10px] flex items-center justify-center shrink-0">
                                    <Building2 size={18} className="text-[var(--accent)]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-[15px] font-semibold text-[var(--text)] truncate">{branch.name}</h3>
                                    <p className="text-[12px] text-[var(--text3)] mt-0.5 truncate">{branch.company.name}</p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        onClick={() => { setEditing(branch); setShowModal(true) }}
                                        className="p-1.5 rounded-[6px] hover:bg-[var(--surface2)] text-[var(--text3)] hover:text-[var(--text)] transition-colors"
                                        title="Edit"
                                    >
                                        <Pencil size={14} />
                                    </button>
                                    {isAdmin && (
                                        <button
                                            onClick={() => setDeleting(branch)}
                                            className="p-1.5 rounded-[6px] hover:bg-red-50 text-[var(--text3)] hover:text-red-500 transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2">
                                {(branch.city || branch.state) && (
                                    <div className="flex items-center gap-2 text-[13px] text-[var(--text2)]">
                                        <MapPin size={14} className="text-[var(--text3)] shrink-0" />
                                        <span className="truncate">{[branch.city, branch.state].filter(Boolean).join(", ")}</span>
                                    </div>
                                )}
                                <div className="flex items-center gap-2 text-[13px] text-[var(--text2)]">
                                    <Users size={14} className="text-[var(--text3)] shrink-0" />
                                    <span>{branch._count.employees} employee{branch._count.employees !== 1 ? "s" : ""}</span>
                                </div>
                                <div className="flex items-center gap-2 text-[13px] text-[var(--text2)]">
                                    <Briefcase size={14} className="text-[var(--text3)] shrink-0" />
                                    <span>{branch._count.departments} department{branch._count.departments !== 1 ? "s" : ""}</span>
                                </div>
                            </div>

                            <div className="mt-4 pt-3 border-t border-[var(--border)]">
                                {branch.isActive ? (
                                    <span className="px-2 py-0.5 bg-[#e8f7f1] text-[#1a9e6e] border border-[#6ee7b7] rounded-full text-[10.5px] font-semibold">Active</span>
                                ) : (
                                    <span className="px-2 py-0.5 bg-[#f9fafb] text-[#6b7280] border border-[#e5e7eb] rounded-full text-[10.5px] font-semibold">Inactive</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <BranchModal
                open={showModal}
                onClose={() => { setShowModal(false); setEditing(null) }}
                onSaved={fetchBranches}
                companies={companies}
                editing={editing}
            />
            <DeleteModal
                open={!!deleting}
                branch={deleting}
                onClose={() => setDeleting(null)}
                onDeleted={fetchBranches}
            />
        </div>
    )
}
