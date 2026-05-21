"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import {
    Building2, UserPlus, Search, Mail, Loader2,
    Pencil, Trash2, KeyRound, ExternalLink, Users, X
} from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"

export default function ClientsPage() {
    const { data: session } = useSession()
    const [clients, setClients] = useState<any[]>([])
    const [companies, setCompanies] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [isEditOpen, setIsEditOpen] = useState(false)
    const [isResetOpen, setIsResetOpen] = useState(false)
    const [isDeleteOpen, setIsDeleteOpen] = useState(false)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [newPassword, setNewPassword] = useState("")
    const [editData, setEditData] = useState({ name: "", email: "", companyId: "" })

    const [form, setForm] = useState({ name: "", email: "", password: "", companyId: "" })

    const fetchData = async () => {
        setLoading(true)
        try {
            const [usersRes, companiesRes] = await Promise.all([
                fetch("/api/admin/users"),
                fetch("/api/companies"),
            ])
            const [usersData, companiesData] = await Promise.all([
                usersRes.json(),
                companiesRes.json(),
            ])
            const allUsers = Array.isArray(usersData) ? usersData : []
            setClients(allUsers.filter((u: any) => u.role === "CLIENT"))
            setCompanies(Array.isArray(companiesData) ? companiesData : [])
        } catch {
            toast.error("Failed to load data")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchData() }, [])

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.companyId) { toast.error("Please select a company"); return }
        setSubmitting(true)
        try {
            const res = await fetch("/api/admin/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...form, role: "CLIENT" }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.message || data.error || "Failed")
            toast.success("Client created successfully")
            setIsCreateOpen(false)
            setForm({ name: "", email: "", password: "", companyId: "" })
            fetchData()
        } catch (err: any) {
            toast.error(err.message)
        } finally {
            setSubmitting(false)
        }
    }

    const handleEdit = async () => {
        if (!selectedId) return
        setSubmitting(true)
        try {
            const res = await fetch(`/api/admin/users/${selectedId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: editData.name, email: editData.email }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || "Failed")
            setClients(clients.map(c => c.id === selectedId ? { ...c, ...data } : c))
            toast.success("Client updated")
            setIsEditOpen(false)
        } catch (err: any) {
            toast.error(err.message)
        } finally {
            setSubmitting(false)
        }
    }

    const handleReset = async () => {
        if (!selectedId || !newPassword) return
        setSubmitting(true)
        try {
            const res = await fetch(`/api/admin/users/${selectedId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: newPassword }),
            })
            if (!res.ok) throw new Error("Failed to reset password")
            toast.success("Password reset successfully")
            setIsResetOpen(false)
            setNewPassword("")
        } catch (err: any) {
            toast.error(err.message)
        } finally {
            setSubmitting(false)
        }
    }

    const handleDelete = async () => {
        if (!selectedId) return
        setSubmitting(true)
        try {
            const res = await fetch(`/api/admin/users/${selectedId}`, { method: "DELETE" })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || "Failed")
            setClients(clients.filter(c => c.id !== selectedId))
            toast.success("Client removed")
            setIsDeleteOpen(false)
            setSelectedId(null)
        } catch (err: any) {
            toast.error(err.message)
        } finally {
            setSubmitting(false)
        }
    }

    const filtered = clients.filter(c =>
        c.name?.toLowerCase().includes(search.toLowerCase()) ||
        c.email?.toLowerCase().includes(search.toLowerCase()) ||
        c.company?.name?.toLowerCase().includes(search.toLowerCase())
    )

    if (loading) {
        return (
            <div className="p-6 lg:p-7 flex h-[70vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#1a9e6e]" />
            </div>
        )
    }

    return (
        <div className="p-6 lg:p-7">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <div>
                    <h1 className="text-[22px] font-semibold tracking-tight text-[#1a1a18]">Client Portal</h1>
                    <p className="text-[13px] text-[#6b6860] mt-[3px]">Manage client accounts and their company access</p>
                </div>
                <button
                    onClick={() => setIsCreateOpen(true)}
                    className="px-3.5 h-9 bg-[#1a9e6e] text-white rounded-[9px] text-[13px] font-medium flex items-center gap-2 hover:bg-[#158a5e] transition-colors"
                >
                    <UserPlus className="h-4 w-4" />
                    Add Client
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
                <div className="bg-white border border-[#e8e6e1] rounded-[12px] p-4">
                    <div className="w-8 h-8 rounded-full bg-[#e8f7f1] flex items-center justify-center mb-2">
                        <Users className="h-4 w-4 text-[#1a9e6e]" />
                    </div>
                    <p className="text-[11px] text-[#9e9b95]">Total Clients</p>
                    <p className="text-[24px] font-bold text-[#1a1a18] tabular-nums">{clients.length}</p>
                </div>
                <div className="bg-white border border-[#e8e6e1] rounded-[12px] p-4">
                    <div className="w-8 h-8 rounded-full bg-[#eff6ff] flex items-center justify-center mb-2">
                        <Building2 className="h-4 w-4 text-[#3b82f6]" />
                    </div>
                    <p className="text-[11px] text-[#9e9b95]">Companies</p>
                    <p className="text-[24px] font-bold text-[#1a1a18] tabular-nums">
                        {new Set(clients.map(c => c.companyId).filter(Boolean)).size}
                    </p>
                </div>
                <div className="bg-white border border-[#e8e6e1] rounded-[12px] p-4">
                    <div className="w-8 h-8 rounded-full bg-[#e8f7f1] flex items-center justify-center mb-2">
                        <ExternalLink className="h-4 w-4 text-[#1a9e6e]" />
                    </div>
                    <p className="text-[11px] text-[#9e9b95]">Active Portals</p>
                    <p className="text-[24px] font-bold text-[#1a1a18] tabular-nums">
                        {clients.filter(c => c.isActive !== false).length}
                    </p>
                </div>
            </div>

            {/* Search */}
            <div className="relative mb-4 max-w-[400px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-[#9e9b95]" />
                <input
                    placeholder="Search by name, email or company..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-[9px] bg-white border border-[#e8e6e1] rounded-[9px] text-[13px] placeholder:text-[#9e9b95] focus:outline-none focus:border-[#1a9e6e] focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)]"
                />
            </div>

            {/* Client List */}
            <div className="bg-white border border-[#e8e6e1] rounded-[14px] overflow-hidden">
                {filtered.length === 0 ? (
                    <div className="py-[60px] text-center">
                        <div className="w-[52px] h-[52px] rounded-full bg-[#e8f7f1] border border-[#e8e6e1] flex items-center justify-center mx-auto mb-4">
                            <Building2 className="h-6 w-6 text-[#1a9e6e]" />
                        </div>
                        <p className="text-[15px] font-semibold text-[#1a1a18] mb-1">No clients yet</p>
                        <p className="text-[13px] text-[#9e9b95]">Add a client to give them access to their company's inspection reports.</p>
                    </div>
                ) : (
                    filtered.map((client, idx) => (
                        <div
                            key={client.id}
                            className={`flex items-center gap-3.5 p-5 hover:bg-[#f9f8f5] transition-colors ${idx !== filtered.length - 1 ? "border-b border-[#e8e6e1]" : ""} ${client.isActive === false ? "opacity-60" : ""}`}
                        >
                            <div className="h-10 w-10 rounded-full bg-[#e8f7f1] flex items-center justify-center text-[15px] font-semibold text-[#0d6b4a] shrink-0">
                                {client.name?.charAt(0)?.toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[13.5px] font-medium text-[#1a1a18]">{client.name}</span>
                                    {client.company?.name && (
                                        <span className="bg-[#e8f7f1] text-[#0d6b4a] text-[11px] font-medium px-2 py-0.5 rounded-[20px]">
                                            {client.company.name}
                                        </span>
                                    )}
                                    {client.isActive === false && (
                                        <span className="bg-[#fef2f2] text-[#dc2626] text-[11px] font-medium px-2 py-0.5 rounded-[20px]">Disabled</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <Mail className="h-3 w-3 text-[#9e9b95]" />
                                    <span className="text-[12px] text-[#6b6860]">{client.email}</span>
                                    {client.createdAt && (
                                        <span className="text-[11px] text-[#9e9b95] ml-2">Joined {format(new Date(client.createdAt), "MMM d, yyyy")}</span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 ml-auto">
                                <button
                                    onClick={() => { setSelectedId(client.id); setIsResetOpen(true) }}
                                    title="Reset Password"
                                    className="h-[30px] w-[30px] rounded-[7px] bg-[#f9f8f5] border border-[#e8e6e1] flex items-center justify-center hover:bg-[#fef3c7] hover:text-[#d97706] hover:border-[#fcd34d] transition-colors"
                                >
                                    <KeyRound className="h-[14px] w-[14px] text-[#6b6860]" />
                                </button>
                                <button
                                    onClick={() => {
                                        setSelectedId(client.id)
                                        setEditData({ name: client.name, email: client.email, companyId: client.companyId || "" })
                                        setIsEditOpen(true)
                                    }}
                                    title="Edit Client"
                                    className="h-[30px] w-[30px] rounded-[7px] bg-[#f9f8f5] border border-[#e8e6e1] flex items-center justify-center hover:bg-[#eff6ff] hover:text-[#1d4ed8] hover:border-[#93c5fd] transition-colors"
                                >
                                    <Pencil className="h-[14px] w-[14px] text-[#6b6860]" />
                                </button>
                                <button
                                    onClick={() => { setSelectedId(client.id); setIsDeleteOpen(true) }}
                                    title="Remove Client"
                                    className="h-[30px] w-[30px] rounded-[7px] bg-[#f9f8f5] border border-[#e8e6e1] flex items-center justify-center hover:bg-[#fef2f2] hover:text-[#dc2626] hover:border-[#fca5a5] transition-colors"
                                >
                                    <Trash2 className="h-[14px] w-[14px] text-[#6b6860]" />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Create Modal */}
            {isCreateOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-[20px] shadow-[0_20px_60px_rgba(0,0,0,0.12)] w-[480px] max-w-[95vw] p-7">
                        <div className="flex items-start justify-between mb-5">
                            <div>
                                <h2 className="text-[17px] font-semibold text-[#1a1a18]">Add New Client</h2>
                                <p className="text-[13px] text-[#6b6860] mt-1">Create a client account with access to their company's portal.</p>
                            </div>
                            <button onClick={() => setIsCreateOpen(false)} className="h-[30px] w-[30px] rounded-[8px] bg-[#f9f8f5] border border-[#e8e6e1] flex items-center justify-center hover:bg-[#fef2f2] hover:text-[#dc2626] transition-colors">
                                <X className="h-4 w-4 text-[#6b6860]" />
                            </button>
                        </div>
                        <div className="border-t border-[#e8e6e1] mb-5" />
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[11.5px] font-medium text-[#6b6860] uppercase tracking-wide">Contact Person Name</label>
                                <input
                                    required value={form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                    placeholder="Rajesh Kumar"
                                    className="w-full px-3.5 py-2.5 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] text-[13px] focus:outline-none focus:border-[#1a9e6e] focus:bg-white focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)]"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[11.5px] font-medium text-[#6b6860] uppercase tracking-wide">Email Address</label>
                                <input
                                    type="email" required value={form.email}
                                    onChange={e => setForm({ ...form, email: e.target.value })}
                                    placeholder="client@company.com"
                                    className="w-full px-3.5 py-2.5 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] text-[13px] focus:outline-none focus:border-[#1a9e6e] focus:bg-white focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)]"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[11.5px] font-medium text-[#6b6860] uppercase tracking-wide">Initial Password</label>
                                <input
                                    type="password" required value={form.password}
                                    onChange={e => setForm({ ...form, password: e.target.value })}
                                    placeholder="••••••••"
                                    className="w-full px-3.5 py-2.5 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] text-[13px] focus:outline-none focus:border-[#1a9e6e] focus:bg-white focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)]"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[11.5px] font-medium text-[#6b6860] uppercase tracking-wide">Company</label>
                                <select
                                    required value={form.companyId}
                                    onChange={e => setForm({ ...form, companyId: e.target.value })}
                                    className="w-full px-3.5 py-2.5 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] text-[13px] focus:outline-none focus:border-[#1a9e6e] focus:bg-white focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)] appearance-none cursor-pointer"
                                >
                                    <option value="">Select company…</option>
                                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="border-t border-[#e8e6e1] pt-4">
                                <button
                                    type="submit" disabled={submitting}
                                    className="w-full py-3 bg-[#1a9e6e] text-white rounded-[9px] text-[13.5px] font-medium hover:bg-[#158a5e] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                                >
                                    {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</> : "Create Client Account"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {isEditOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-[20px] shadow-[0_20px_60px_rgba(0,0,0,0.12)] w-[440px] max-w-[95vw] p-7">
                        <div className="flex items-start justify-between mb-5">
                            <div>
                                <h2 className="text-[17px] font-semibold text-[#1a1a18]">Edit Client</h2>
                                <p className="text-[13px] text-[#6b6860] mt-1">Update client's name or email.</p>
                            </div>
                            <button onClick={() => setIsEditOpen(false)} className="h-[30px] w-[30px] rounded-[8px] bg-[#f9f8f5] border border-[#e8e6e1] flex items-center justify-center hover:bg-[#fef2f2] transition-colors">
                                <X className="h-4 w-4 text-[#6b6860]" />
                            </button>
                        </div>
                        <div className="border-t border-[#e8e6e1] mb-5" />
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[11.5px] font-medium text-[#6b6860] uppercase tracking-wide">Full Name</label>
                                <input
                                    value={editData.name}
                                    onChange={e => setEditData({ ...editData, name: e.target.value })}
                                    className="w-full px-3.5 py-2.5 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] text-[13px] focus:outline-none focus:border-[#1a9e6e] focus:bg-white focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)]"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[11.5px] font-medium text-[#6b6860] uppercase tracking-wide">Email Address</label>
                                <input
                                    type="email"
                                    value={editData.email}
                                    onChange={e => setEditData({ ...editData, email: e.target.value })}
                                    className="w-full px-3.5 py-2.5 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] text-[13px] focus:outline-none focus:border-[#1a9e6e] focus:bg-white focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)]"
                                />
                            </div>
                            <div className="border-t border-[#e8e6e1] pt-4">
                                <button
                                    onClick={handleEdit} disabled={submitting}
                                    className="w-full py-3 bg-[#1a9e6e] text-white rounded-[9px] text-[13.5px] font-medium hover:bg-[#158a5e] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                                >
                                    {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : "Save Changes"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Reset Password Modal */}
            {isResetOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-[20px] shadow-[0_20px_60px_rgba(0,0,0,0.12)] w-[400px] max-w-[95vw] p-7">
                        <div className="flex items-start justify-between mb-5">
                            <div>
                                <h2 className="text-[17px] font-semibold text-[#1a1a18]">Reset Password</h2>
                                <p className="text-[13px] text-[#6b6860] mt-1">Set a new password for this client.</p>
                            </div>
                            <button onClick={() => { setIsResetOpen(false); setNewPassword("") }} className="h-[30px] w-[30px] rounded-[8px] bg-[#f9f8f5] border border-[#e8e6e1] flex items-center justify-center hover:bg-[#fef2f2] transition-colors">
                                <X className="h-4 w-4 text-[#6b6860]" />
                            </button>
                        </div>
                        <div className="border-t border-[#e8e6e1] mb-5" />
                        <div className="space-y-1.5 mb-4">
                            <label className="text-[11.5px] font-medium text-[#6b6860] uppercase tracking-wide">New Password</label>
                            <input
                                type="password" value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                placeholder="Enter new password"
                                className="w-full px-3.5 py-2.5 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] text-[13px] focus:outline-none focus:border-[#1a9e6e] focus:bg-white focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)]"
                            />
                        </div>
                        <div className="flex gap-2.5">
                            <button onClick={() => { setIsResetOpen(false); setNewPassword("") }} className="flex-1 py-2.5 bg-white border border-[#e8e6e1] text-[#6b6860] rounded-[9px] text-[13px] font-medium hover:bg-[#f9f8f5] transition-colors">Cancel</button>
                            <button onClick={handleReset} disabled={submitting || !newPassword} className="flex-1 py-2.5 bg-[#1a9e6e] text-white rounded-[9px] text-[13px] font-medium hover:bg-[#158a5e] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reset Password"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {isDeleteOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-[16px] shadow-[0_20px_60px_rgba(0,0,0,0.15)] p-6 w-[360px] max-w-[90vw]">
                        <div className="w-[44px] h-[44px] bg-[#fef2f2] rounded-full flex items-center justify-center mb-4">
                            <Trash2 className="h-5 w-5 text-[#dc2626]" />
                        </div>
                        <h3 className="text-[16px] font-semibold text-[#1a1a18] mb-1">Remove Client?</h3>
                        <p className="text-[13px] text-[#6b6860] mb-5 leading-relaxed">
                            This will permanently remove the client's portal access. This cannot be undone.
                        </p>
                        <div className="flex gap-2.5">
                            <button onClick={() => { setIsDeleteOpen(false); setSelectedId(null) }} className="flex-1 py-2.5 bg-white border border-[#e8e6e1] text-[#6b6860] rounded-[9px] text-[13px] font-medium hover:bg-[#f9f8f5] transition-colors">Cancel</button>
                            <button onClick={handleDelete} disabled={submitting} className="flex-1 py-2.5 bg-[#dc2626] text-white rounded-[9px] text-[13px] font-medium hover:bg-[#b91c1c] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Trash2 className="h-4 w-4" /> Remove</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
