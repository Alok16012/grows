"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
    Users,
    UserPlus,
    Search,
    Building2,
    Shield,
    Mail,
    Loader2,
    Plus,
    X,
    MoreVertical,
    Lock,
    UserX,
    UserCheck,
    Filter,
    KeyRound,
    UserCog,
    Pencil,
    Trash2
} from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { format } from "date-fns"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import BulkImportInspectors from "@/components/BulkImportInspectors"

export default function UserManagementPage() {
    const [users, setUsers] = useState<any[]>([])
    const [companies, setCompanies] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [roleFilter, setRoleFilter] = useState("ALL")
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [isResetModalOpen, setIsResetModalOpen] = useState(false)
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
    const [newPassword, setNewPassword] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const [editData, setEditData] = useState({ name: "", email: "", role: "" })

    const [managers, setManagers] = useState<any[]>([])
    const [groupProjects, setGroupProjects] = useState<any[]>([])
    const [groupCompanies, setGroupCompanies] = useState<any[]>([])

    // Group assignment for inspector creation
    const [groupMode, setGroupMode] = useState<"none" | "existing" | "new">("none")
    const [groupCompanyId, setGroupCompanyId] = useState("")
    const [groupProjectId, setGroupProjectId] = useState("")
    const [newGroupProjectName, setNewGroupProjectName] = useState("")
    const [groupManagerIds, setGroupManagerIds] = useState<string[]>([])

    // Form state
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
        role: "CLIENT",
        companyId: ""
    })

    const fetchData = async () => {
        setLoading(true)
        try {
            const [usersRes, companiesRes, managersRes] = await Promise.all([
                fetch("/api/admin/users"),
                fetch("/api/companies"),
                fetch("/api/users?role=MANAGER")
            ])
            const [usersData, companiesData, managersData] = await Promise.all([
                usersRes.json(),
                companiesRes.json(),
                managersRes.json()
            ])
            setUsers(Array.isArray(usersData) ? usersData : [])
            setCompanies(Array.isArray(companiesData) ? companiesData : [])
            setGroupCompanies(Array.isArray(companiesData) ? companiesData : [])
            setManagers(Array.isArray(managersData) ? managersData : [])
        } catch (error) {
            console.error("Failed to fetch admin data", error)
            toast.error("Failed to load user data")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [])

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitting(true)
        try {
            const res = await fetch("/api/admin/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData)
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.message || data.error || "Failed to create user")
            }

            const newUser = await res.json()

            // Handle group assignment for inspectors
            if (formData.role === "INSPECTION_BOY") {
                let assignProjectId = groupProjectId

                if (groupMode === "new" && groupCompanyId && newGroupProjectName.trim()) {
                    // Create new project first
                    const projRes = await fetch("/api/projects", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ companyId: groupCompanyId, name: newGroupProjectName.trim() })
                    })
                    if (projRes.ok) {
                        const proj = await projRes.json()
                        assignProjectId = proj.id
                    }
                }

                if (assignProjectId && newUser.id) {
                    await fetch("/api/assignments", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            projectId: assignProjectId,
                            inspectorIds: [newUser.id],
                            managerIds: groupManagerIds.length > 0 ? groupManagerIds : undefined,
                        })
                    })
                    toast.success("User created and assigned to group")
                } else {
                    toast.success("User created successfully")
                }
            } else {
                toast.success("User created successfully")
            }

            setIsCreateModalOpen(false)
            setFormData({ name: "", email: "", password: "", role: "CLIENT", companyId: "" })
            setGroupMode("none")
            setGroupCompanyId("")
            setGroupProjectId("")
            setNewGroupProjectName("")
            setGroupManagerIds([])
            fetchData()
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setSubmitting(false)
        }
    }

    const toggleUserStatus = async (id: string, currentStatus: boolean) => {
        try {
            const res = await fetch(`/api/admin/users/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: !currentStatus })
            })

            if (!res.ok) throw new Error("Failed to update status")

            setUsers(users.map(u => u.id === id ? { ...u, isActive: !currentStatus } : u))
            toast.success(`User ${!currentStatus ? 'enabled' : 'disabled'} successfully`)
        } catch (error) {
            toast.error("Failed to update user status")
        }
    }

    const handlePasswordReset = async () => {
        if (!selectedUserId || !newPassword) return
        setSubmitting(true)
        try {
            const res = await fetch(`/api/admin/users/${selectedUserId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: newPassword })
            })

            if (!res.ok) throw new Error("Failed to reset password")

            toast.success("Password reset successfully")
            setIsResetModalOpen(false)
            setNewPassword("")
        } catch (error) {
            toast.error("Failed to reset password")
        } finally {
            setSubmitting(false)
        }
    }

    const handleEditUser = async () => {
        if (!selectedUserId) return
        setSubmitting(true)
        try {
            const res = await fetch(`/api/admin/users/${selectedUserId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editData)
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || "Failed to update user")
            setUsers(users.map(u => u.id === selectedUserId ? { ...u, ...data } : u))
            toast.success("User updated successfully")
            setIsEditModalOpen(false)
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setSubmitting(false)
        }
    }

    const handleDeleteUser = async () => {
        if (!selectedUserId) return
        setSubmitting(true)
        try {
            const res = await fetch(`/api/admin/users/${selectedUserId}`, { method: "DELETE" })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || "Failed to delete user")
            setUsers(users.filter(u => u.id !== selectedUserId))
            toast.success("User deleted successfully")
            setIsDeleteConfirmOpen(false)
            setSelectedUserId(null)
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setSubmitting(false)
        }
    }

    const fetchGroupProjects = async (companyId: string) => {
        if (!companyId) { setGroupProjects([]); setGroupProjectId(""); return }
        try {
            const res = await fetch(`/api/projects?companyId=${companyId}`)
            if (res.ok) setGroupProjects(await res.json())
        } catch { }
    }

    const filteredUsers = users.filter(u => {
        const matchesSearch = u.name.toLowerCase().includes(search.toLowerCase()) ||
            u.email.toLowerCase().includes(search.toLowerCase())
        const matchesRole = roleFilter === "ALL" || u.role === roleFilter
        return matchesSearch && matchesRole
    })

    const getRoleBadge = (role: string) => {
        switch (role) {
            case "ADMIN": return <Badge className="bg-red-50 text-red-600 hover:bg-red-50 border-red-100 px-2 py-0 h-5 text-[10px] font-bold">ADMIN</Badge>
            case "MANAGER": return <Badge className="bg-blue-50 text-blue-600 hover:bg-blue-50 border-blue-100 px-2 py-0 h-5 text-[10px] font-bold">MANAGER</Badge>
            case "HR_MANAGER": return <Badge className="bg-teal-50 text-teal-600 hover:bg-teal-50 border-teal-100 px-2 py-0 h-5 text-[10px] font-bold">HR MANAGER</Badge>
            case "INSPECTION_BOY": return <Badge className="bg-amber-50 text-amber-600 hover:bg-amber-50 border-amber-100 px-2 py-0 h-5 text-[10px] font-bold">INSPECTOR</Badge>
            case "CLIENT": return <Badge className="bg-purple-50 text-purple-600 hover:bg-purple-50 border-purple-100 px-2 py-0 h-5 text-[10px] font-bold">CLIENT</Badge>
            default: return <Badge variant="outline" className="px-2 py-0 h-5 text-[10px] font-bold">{role}</Badge>
        }
    }

    if (loading && users.length === 0) {
        return (
            <div className="p-6 lg:p-7 flex h-[70vh] items-center justify-center">
                <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-10 w-10 animate-spin text-[#1a9e6e]" />
                    <p className="text-[13px] font-medium text-[#6b6860]">Loading users...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="p-6 lg:p-7">
            <div className="flex items-center justify-between mb-5">
                <div>
                    <h1 className="text-[22px] font-semibold tracking-tight text-[#1a1a18]">System Users</h1>
                    <p className="text-[13px] text-[#6b6860] mt-[3px]">Manage access, roles, and account security</p>
                </div>
                <div className="flex items-center gap-[10px]">
                    <BulkImportInspectors onImportComplete={fetchData} />
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="px-3.5 h-9 bg-[#1a9e6e] text-white rounded-[9px] text-[13px] font-medium flex items-center gap-2 hover:bg-[#158a5e] transition-colors"
                    >
                        <UserPlus className="h-4 w-4" />
                        Create User
                    </button>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="flex items-center gap-3 mb-4">
                <div className="relative flex-1 max-w-[400px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-[#9e9b95]" />
                    <input
                        placeholder="Search name or email..."
                        className="w-full pl-9 pr-4 py-[9px] bg-white border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#1a1a18] placeholder:text-[#9e9b95] focus:outline-none focus:border-[#1a9e6e] focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)] transition-shadow"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <select
                    value={roleFilter}
                    onChange={e => setRoleFilter(e.target.value)}
                    className="w-[160px] px-3.5 py-[9px] bg-white border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#6b6860] focus:outline-none focus:border-[#1a9e6e] appearance-none cursor-pointer"
                >
                    <option value="ALL">All Roles</option>
                    <option value="ADMIN">Admin</option>
                    <option value="MANAGER">Manager</option>
                    <option value="HR_MANAGER">HR Manager</option>
                    <option value="INSPECTION_BOY">Inspector</option>
                    <option value="CLIENT">Client</option>
                </select>
            </div>

            <div className="bg-white border border-[#e8e6e1] rounded-[14px] overflow-hidden">
                {filteredUsers.map((user, idx) => (
                    <div
                        key={user.id}
                        className={`flex items-center gap-3.5 p-5 hover:bg-[#f9f8f5] transition-colors ${
                            idx !== filteredUsers.length - 1 ? "border-b border-[#e8e6e1]" : ""
                        } ${!user.isActive ? "opacity-60" : ""}`}
                    >
                        <div className={`h-9 w-9 rounded-full flex items-center justify-center text-[14px] font-semibold shrink-0 ${
                            user.role === "ADMIN" ? "bg-[#e8f7f1] text-[#0d6b4a]" :
                            user.role === "MANAGER" ? "bg-[#eff6ff] text-[#1d4ed8]" :
                            user.role === "INSPECTION_BOY" ? "bg-[#fef3c7] text-[#92400e]" :
                            "bg-[#f9f8f5] text-[#6b6860]"
                        }`}>
                            {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-[13.5px] font-medium text-[#1a1a18]">{user.name}</span>
                                <span className={`px-[9px] py-0.5 rounded-[20px] text-[11px] font-medium ${
                                    user.role === "INSPECTION_BOY" ? "bg-[#fef3c7] text-[#92400e]" :
                                    user.role === "MANAGER" ? "bg-[#eff6ff] text-[#1d4ed8]" :
                                    user.role === "ADMIN" ? "bg-[#e8f7f1] text-[#0d6b4a]" :
                                    "bg-[#f9f8f5] text-[#6b6860]"
                                }`}>
                                    {user.role === "ADMIN" ? "Admin" : user.role === "MANAGER" ? "Manager" : user.role === "INSPECTION_BOY" ? "Inspector" : user.role === "CLIENT" ? "Client" : user.role}
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <Mail className="h-3 w-3 text-[#9e9b95]" />
                                <span className="text-[12.5px] text-[#6b6860]">{user.email}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5 ml-auto">
                            <button
                                onClick={() => {
                                    setSelectedUserId(user.id)
                                    setIsResetModalOpen(true)
                                }}
                                className="h-[30px] w-[30px] rounded-[7px] bg-[#f9f8f5] border border-[#e8e6e1] flex items-center justify-center hover:bg-[#fef3c7] hover:text-[#d97706] hover:border-[#fcd34d] transition-colors"
                                title="Reset Password"
                            >
                                <KeyRound className="h-[14px] w-[14px] text-[#6b6860]" />
                            </button>
                            <button
                                onClick={() => {
                                    setSelectedUserId(user.id)
                                    setEditData({ name: user.name, email: user.email, role: user.role })
                                    setIsEditModalOpen(true)
                                }}
                                className="h-[30px] w-[30px] rounded-[7px] bg-[#f9f8f5] border border-[#e8e6e1] flex items-center justify-center hover:bg-[#eff6ff] hover:text-[#1d4ed8] hover:border-[#93c5fd] transition-colors"
                                title="Edit User"
                            >
                                <Pencil className="h-[14px] w-[14px] text-[#6b6860]" />
                            </button>
                            <button
                                onClick={() => {
                                    setSelectedUserId(user.id)
                                    setIsDeleteConfirmOpen(true)
                                }}
                                className="h-[30px] w-[30px] rounded-[7px] bg-[#f9f8f5] border border-[#e8e6e1] flex items-center justify-center hover:bg-[#fef2f2] hover:text-[#dc2626] hover:border-[#fca5a5] transition-colors"
                                title="Delete User"
                            >
                                <Trash2 className="h-[14px] w-[14px] text-[#6b6860]" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Create New User Modal */}
            <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
                <DialogContent className="bg-white rounded-2xl w-[480px] max-w-[95vw] p-7 shadow-[0_20px_60px_rgba(0,0,0,0.12)] border-none [&>button]:hidden">
                    <div className="flex items-start justify-between mb-5">
                        <div>
                            <h2 className="text-[17px] font-semibold text-[#1a1a18]">Create New User</h2>
                            <p className="text-[13px] text-[#6b6860] mt-1 leading-relaxed">Provision a new account with specific role-based permissions.</p>
                        </div>
                        <button
                            onClick={() => setIsCreateModalOpen(false)}
                            className="h-[30px] w-[30px] rounded-[8px] bg-[#f9f8f5] border border-[#e8e6e1] text-[#6b6860] text-[16px] cursor-pointer hover:bg-[#fef2f2] hover:text-[#dc2626] hover:border-[#fca5a5] transition-colors flex items-center justify-center"
                        >
                            ✕
                        </button>
                    </div>

                    <div className="border-t border-[#e8e6e1] mb-5" />

                    <form onSubmit={handleCreateUser} className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[11.5px] font-medium text-[#6b6860] uppercase tracking-wide">Full Name</label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                placeholder="John Doe"
                                className="w-full px-3.5 py-2.5 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#1a1a18] placeholder:text-[#9e9b95] focus:outline-none focus:border-[#1a9e6e] focus:bg-white focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)]"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[11.5px] font-medium text-[#6b6860] uppercase tracking-wide">Email Address</label>
                            <input
                                type="email"
                                required
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                placeholder="john@example.com"
                                className="w-full px-3.5 py-2.5 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#1a1a18] placeholder:text-[#9e9b95] focus:outline-none focus:border-[#1a9e6e] focus:bg-white focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)]"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[11.5px] font-medium text-[#6b6860] uppercase tracking-wide">Initial Password</label>
                            <input
                                type="password"
                                required
                                value={formData.password}
                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                                placeholder="••••••••"
                                className="w-full px-3.5 py-2.5 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#1a1a18] placeholder:text-[#9e9b95] focus:outline-none focus:border-[#1a9e6e] focus:bg-white focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)]"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[11.5px] font-medium text-[#6b6860] uppercase tracking-wide">Assignment Role</label>
                            <select
                                value={formData.role}
                                onChange={e => setFormData({ ...formData, role: e.target.value })}
                                className="w-full px-3.5 py-2.5 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#1a1a18] focus:outline-none focus:border-[#1a9e6e] focus:bg-white focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)] appearance-none cursor-pointer"
                            >
                                <option value="ADMIN">Administrator</option>
                                <option value="MANAGER">Manager</option>
                                <option value="HR_MANAGER">HR Manager</option>
                                <option value="INSPECTION_BOY">Inspector</option>
                                <option value="CLIENT">Client Portal User</option>
                            </select>
                        </div>
                        {formData.role === "CLIENT" && (
                            <div className="space-y-1.5">
                                <label className="text-[11.5px] font-medium text-[#6b6860] uppercase tracking-wide">Designated Company</label>
                                <select
                                    value={formData.companyId}
                                    onChange={e => setFormData({ ...formData, companyId: e.target.value })}
                                    required
                                    className="w-full px-3.5 py-2.5 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#1a1a18] focus:outline-none focus:border-[#1a9e6e] focus:bg-white focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)] appearance-none cursor-pointer"
                                >
                                    <option value="">Select a company</option>
                                    {companies.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="border-t border-[#e8e6e1] mt-1 pt-4">
                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full py-3 bg-[#1a9e6e] text-white border-none rounded-[9px] text-[13.5px] font-medium hover:bg-[#158a5e] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {submitting ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Creating...
                                    </span>
                                ) : (
                                    "Complete Provisioning"
                                )}
                            </button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Password Reset Modal */}
            <Dialog open={isResetModalOpen} onOpenChange={setIsResetModalOpen}>
                <DialogContent className="bg-white rounded-2xl w-[400px] max-w-[95vw] p-7 shadow-[0_20px_60px_rgba(0,0,0,0.12)] border-none [&>button]:hidden">
                    <div className="flex items-start justify-between mb-5">
                        <div>
                            <h2 className="text-[17px] font-semibold text-[#1a1a18]">Reset Account Password</h2>
                            <p className="text-[13px] text-[#6b6860] mt-1">Create a new secure password for this user.</p>
                        </div>
                        <button
                            onClick={() => setIsResetModalOpen(false)}
                            className="h-[30px] w-[30px] rounded-[8px] bg-[#f9f8f5] border border-[#e8e6e1] text-[#6b6860] text-[16px] cursor-pointer hover:bg-[#fef2f2] hover:text-[#dc2626] hover:border-[#fca5a5] transition-colors flex items-center justify-center"
                        >
                            ✕
                        </button>
                    </div>

                    <div className="border-t border-[#e8e6e1] mb-5" />

                    <div className="space-y-1.5 mb-4">
                        <label className="text-[11.5px] font-medium text-[#6b6860] uppercase tracking-wide">New Password</label>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            placeholder="Enter strong password"
                            className="w-full px-3.5 py-2.5 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#1a1a18] placeholder:text-[#9e9b95] focus:outline-none focus:border-[#1a9e6e] focus:bg-white focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)]"
                        />
                    </div>

                    <div className="flex gap-2.5">
                        <button
                            onClick={() => setIsResetModalOpen(false)}
                            className="flex-1 py-2.5 bg-white border border-[#e8e6e1] text-[#6b6860] rounded-[9px] text-[13px] font-medium hover:bg-[#f9f8f5] transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handlePasswordReset}
                            disabled={submitting || !newPassword}
                            className="flex-1 py-2.5 bg-[#1a9e6e] text-white border-none rounded-[9px] text-[13px] font-medium hover:bg-[#158a5e] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {submitting ? (
                                <span className="flex items-center justify-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Resetting...
                                </span>
                            ) : (
                                "Confirm Reset"
                            )}
                        </button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit User Modal */}
            <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
                <DialogContent className="bg-white rounded-2xl w-[440px] max-w-[95vw] p-7 shadow-[0_20px_60px_rgba(0,0,0,0.12)] border-none [&>button]:hidden">
                    <div className="flex items-start justify-between mb-5">
                        <div>
                            <h2 className="text-[17px] font-semibold text-[#1a1a18]">Edit User</h2>
                            <p className="text-[13px] text-[#6b6860] mt-1">Update user details and role.</p>
                        </div>
                        <button
                            onClick={() => setIsEditModalOpen(false)}
                            className="h-[30px] w-[30px] rounded-[8px] bg-[#f9f8f5] border border-[#e8e6e1] text-[#6b6860] cursor-pointer hover:bg-[#fef2f2] hover:text-[#dc2626] hover:border-[#fca5a5] transition-colors flex items-center justify-center"
                        >✕</button>
                    </div>
                    <div className="border-t border-[#e8e6e1] mb-5" />
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[11.5px] font-medium text-[#6b6860] uppercase tracking-wide">Full Name</label>
                            <input
                                type="text"
                                value={editData.name}
                                onChange={e => setEditData({ ...editData, name: e.target.value })}
                                className="w-full px-3.5 py-2.5 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#1a1a18] focus:outline-none focus:border-[#1a9e6e] focus:bg-white focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)]"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[11.5px] font-medium text-[#6b6860] uppercase tracking-wide">Email Address</label>
                            <input
                                type="email"
                                value={editData.email}
                                onChange={e => setEditData({ ...editData, email: e.target.value })}
                                className="w-full px-3.5 py-2.5 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#1a1a18] focus:outline-none focus:border-[#1a9e6e] focus:bg-white focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)]"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[11.5px] font-medium text-[#6b6860] uppercase tracking-wide">Role</label>
                            <select
                                value={editData.role}
                                onChange={e => setEditData({ ...editData, role: e.target.value })}
                                className="w-full px-3.5 py-2.5 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#1a1a18] focus:outline-none focus:border-[#1a9e6e] focus:bg-white focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)] appearance-none cursor-pointer"
                            >
                                <option value="ADMIN">Administrator</option>
                                <option value="MANAGER">Manager</option>
                                <option value="HR_MANAGER">HR Manager</option>
                                <option value="INSPECTION_BOY">Inspector</option>
                                <option value="CLIENT">Client Portal User</option>
                            </select>
                        </div>
                        <div className="border-t border-[#e8e6e1] pt-4">
                            <button
                                onClick={handleEditUser}
                                disabled={submitting}
                                className="w-full py-3 bg-[#1a9e6e] text-white border-none rounded-[9px] text-[13.5px] font-medium hover:bg-[#158a5e] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : "Save Changes"}
                            </button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Modal */}
            {isDeleteConfirmOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-[16px] shadow-[0_20px_60px_rgba(0,0,0,0.15)] p-6 w-[360px] max-w-[90vw]">
                        <div className="w-[44px] h-[44px] bg-[#fef2f2] rounded-full flex items-center justify-center mb-4">
                            <Trash2 className="h-5 w-5 text-[#dc2626]" />
                        </div>
                        <h3 className="text-[16px] font-semibold text-[#1a1a18] mb-1">Delete User?</h3>
                        <p className="text-[13px] text-[#6b6860] mb-5 leading-relaxed">
                            This will permanently remove the user account. This action cannot be undone.
                        </p>
                        <div className="flex gap-2.5">
                            <button
                                onClick={() => { setIsDeleteConfirmOpen(false); setSelectedUserId(null) }}
                                className="flex-1 py-2.5 bg-white border border-[#e8e6e1] text-[#6b6860] rounded-[9px] text-[13px] font-medium hover:bg-[#f9f8f5] transition-colors"
                            >Cancel</button>
                            <button
                                onClick={handleDeleteUser}
                                disabled={submitting}
                                className="flex-1 py-2.5 bg-[#dc2626] text-white rounded-[9px] text-[13px] font-medium hover:bg-[#b91c1c] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                Delete User
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {filteredUsers.length === 0 && (
                <div className="bg-white border border-[#e8e6e1] rounded-[14px] py-[60px] text-center">
                    <div className="w-[56px] h-[56px] bg-[#e8f7f1] rounded-full flex items-center justify-center mx-auto mb-4">
                        <Users className="h-6 w-6 text-[#1a9e6e]" />
                    </div>
                    <h3 className="text-[16px] font-semibold text-[#1a1a18] mb-1.5">No users found</h3>
                    <p className="text-[13px] text-[#6b6860] max-w-[250px] mx-auto leading-relaxed">
                        No system users found matching your criteria.
                    </p>
                </div>
            )}
        </div>
    )
}
