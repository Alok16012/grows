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
    KeyRound
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
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
    const [newPassword, setNewPassword] = useState("")
    const [submitting, setSubmitting] = useState(false)

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
            case "INSPECTION_BOY": return <Badge className="bg-amber-50 text-amber-600 hover:bg-amber-50 border-amber-100 px-2 py-0 h-5 text-[10px] font-bold">INSPECTOR</Badge>
            case "CLIENT": return <Badge className="bg-purple-50 text-purple-600 hover:bg-purple-50 border-purple-100 px-2 py-0 h-5 text-[10px] font-bold">CLIENT</Badge>
            default: return <Badge variant="outline" className="px-2 py-0 h-5 text-[10px] font-bold">{role}</Badge>
        }
    }

    if (loading && users.length === 0) {
        return (
            <div className="flex h-[70vh] items-center justify-center">
                <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
                    <p className="text-sm font-medium text-muted-foreground animate-pulse">Loading users...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-3xl font-bold tracking-tight">System Users</h1>
                    <p className="text-muted-foreground font-medium text-sm">Manage access, roles, and account security</p>
                </div>
                <div className="flex items-center gap-3">
                    <BulkImportInspectors onImportComplete={fetchData} />
                    <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
                        <DialogTrigger asChild>
                            <Button className="shadow-md h-11 font-bold">
                                <UserPlus className="mr-2 h-4 w-4" />
                                Create User
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px]">
                            <form onSubmit={handleCreateUser}>
                                <DialogHeader>
                                    <DialogTitle>Create New User</DialogTitle>
                                    <DialogDescription>
                                        Provision a new account with specific role-based permissions.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="name" className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Full Name</Label>
                                        <Input
                                            id="name"
                                            required
                                            value={formData.name}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="John Doe"
                                            className="h-11"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="email" className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Email Address</Label>
                                        <Input
                                            id="email"
                                            type="email"
                                            required
                                            value={formData.email}
                                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                                            placeholder="john@example.com"
                                            className="h-11"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="password" className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Initial Password</Label>
                                        <Input
                                            id="password"
                                            type="password"
                                            required
                                            value={formData.password}
                                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                                            placeholder="••••••••"
                                            className="h-11"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="role" className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Assignment Role</Label>
                                        <Select
                                            value={formData.role}
                                            onValueChange={v => setFormData({ ...formData, role: v })}
                                        >
                                            <SelectTrigger className="h-11">
                                                <SelectValue placeholder="Select a role" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ADMIN">Administrator</SelectItem>
                                                <SelectItem value="MANAGER">Manager</SelectItem>
                                                <SelectItem value="INSPECTION_BOY">Inspector</SelectItem>
                                                <SelectItem value="CLIENT">Client Portal User</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {formData.role === "CLIENT" && (
                                        <div className="grid gap-2">
                                            <Label htmlFor="company" className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Designated Company</Label>
                                            <Select
                                                value={formData.companyId}
                                                onValueChange={v => setFormData({ ...formData, companyId: v })}
                                                required
                                            >
                                                <SelectTrigger className="h-11">
                                                    <SelectValue placeholder="Select a company" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {companies.map(c => (
                                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}

                                    {/* Group Assignment — Inspector only */}
                                    {formData.role === "INSPECTION_BOY" && (
                                        <div className="space-y-3 border rounded-lg p-3 bg-amber-50/40 border-amber-200">
                                            <Label className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Assign to Group (Optional)</Label>
                                            <div className="flex gap-2">
                                                {(["none", "existing", "new"] as const).map(m => (
                                                    <button
                                                        type="button"
                                                        key={m}
                                                        onClick={() => { setGroupMode(m); setGroupCompanyId(""); setGroupProjectId(""); setNewGroupProjectName(""); setGroupProjects([]); setGroupManagerIds([]) }}
                                                        className={`flex-1 text-xs py-1.5 rounded border font-medium transition-colors ${groupMode === m
                                                                ? "bg-amber-600 text-white border-amber-600"
                                                                : "bg-white border-gray-200 hover:bg-amber-50"
                                                            }`}
                                                    >
                                                        {m === "none" ? "Skip" : m === "existing" ? "Existing Group" : "New Group"}
                                                    </button>
                                                ))}
                                            </div>

                                            {groupMode !== "none" && (
                                                <>
                                                    <div className="grid gap-1">
                                                        <label className="text-xs font-medium">Company</label>
                                                        <select
                                                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                            value={groupCompanyId}
                                                            onChange={(e) => { setGroupCompanyId(e.target.value); fetchGroupProjects(e.target.value); setGroupProjectId("") }}
                                                        >
                                                            <option value="">Select Company</option>
                                                            {groupCompanies.map(c => (
                                                                <option key={c.id} value={c.id}>{c.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    {groupMode === "existing" && groupCompanyId && (
                                                        <div className="grid gap-1">
                                                            <label className="text-xs font-medium">Project (Group)</label>
                                                            <select
                                                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                                value={groupProjectId}
                                                                onChange={(e) => setGroupProjectId(e.target.value)}
                                                            >
                                                                <option value="">Select Project</option>
                                                                {groupProjects.map(p => (
                                                                    <option key={p.id} value={p.id}>{p.name}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    )}

                                                    {groupMode === "new" && groupCompanyId && (
                                                        <div className="grid gap-1">
                                                            <label className="text-xs font-medium">New Group Name</label>
                                                            <Input
                                                                placeholder="Enter project/group name"
                                                                value={newGroupProjectName}
                                                                onChange={e => setNewGroupProjectName(e.target.value)}
                                                                className="h-9 text-sm"
                                                            />
                                                        </div>
                                                    )}

                                                    {managers.length > 0 && (groupProjectId || (groupMode === "new" && newGroupProjectName)) && (
                                                        <div className="grid gap-1">
                                                            <label className="text-xs font-medium">Add Managers (Optional)</label>
                                                            <div className="border rounded max-h-28 overflow-y-auto p-2 space-y-1 bg-white">
                                                                {managers.map(m => (
                                                                    <label key={m.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/40 p-1 rounded text-sm">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={groupManagerIds.includes(m.id)}
                                                                            onChange={e => {
                                                                                if (e.target.checked) setGroupManagerIds([...groupManagerIds, m.id])
                                                                                else setGroupManagerIds(groupManagerIds.filter(id => id !== m.id))
                                                                            }}
                                                                            className="rounded border-gray-300"
                                                                        />
                                                                        <span className="font-medium">{m.name}</span>
                                                                        <span className="text-xs text-muted-foreground">({m.email})</span>
                                                                    </label>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <DialogFooter>
                                    <Button type="submit" disabled={submitting} className="w-full h-11 font-bold">
                                        {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                        Complete Provisioning
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search name or email..."
                        className="pl-10 h-11 border-none bg-white shadow-sm font-medium"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="w-[180px] h-11 border-none bg-white shadow-sm font-bold">
                        <div className="flex items-center gap-2">
                            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                            <SelectValue placeholder="Filter by Role" />
                        </div>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">All Roles</SelectItem>
                        <SelectItem value="ADMIN">Admins</SelectItem>
                        <SelectItem value="MANAGER">Managers</SelectItem>
                        <SelectItem value="INSPECTION_BOY">Inspectors</SelectItem>
                        <SelectItem value="CLIENT">Clients</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {filteredUsers.map((user) => (
                    <Card key={user.id} className={cn(
                        "hover:shadow-md transition-all border-none bg-white overflow-hidden group",
                        !user.isActive && "opacity-60 grayscale-[0.5]"
                    )}>
                        <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="flex items-center gap-4 min-w-0 flex-1">
                                <div className={cn(
                                    "h-12 w-12 rounded-2xl flex items-center justify-center text-lg font-bold shrink-0",
                                    user.isActive ? "bg-primary/5 text-primary" : "bg-muted text-muted-foreground"
                                )}>
                                    {user.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="space-y-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="font-bold text-base leading-tight truncate">{user.name}</h3>
                                        {getRoleBadge(user.role)}
                                        {!user.isActive && <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-bold border-red-200 text-red-600 bg-red-50/50">DISABLED</Badge>}
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-muted-foreground font-medium">
                                        <div className="flex items-center gap-1.5 truncate max-w-[200px]">
                                            <Mail className="h-3 w-3" />
                                            {user.email}
                                        </div>
                                        {user.company && (
                                            <div className="flex items-center gap-1.5 text-blue-600/80 font-bold bg-blue-50/50 px-1.5 py-0.5 rounded">
                                                <Building2 className="h-3 w-3" />
                                                {user.company.name}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex bg-muted/20 p-1.5 rounded-xl gap-1 shrink-0">
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0 hover:bg-white hover:shadow-sm"
                                    onClick={() => {
                                        setSelectedUserId(user.id)
                                        setIsResetModalOpen(true)
                                    }}
                                    title="Reset Password"
                                >
                                    <KeyRound className="h-4 w-4 text-amber-500" />
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className={cn(
                                        "h-8 w-8 p-0 hover:bg-white hover:shadow-sm",
                                        user.isActive ? "text-red-500" : "text-emerald-500"
                                    )}
                                    onClick={() => toggleUserStatus(user.id, user.isActive)}
                                    title={user.isActive ? "Disable User" : "Enable User"}
                                >
                                    {user.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                                </Button>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            {/* Password Reset Modal */}
            <Dialog open={isResetModalOpen} onOpenChange={setIsResetModalOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Reset Account Password</DialogTitle>
                        <DialogDescription>
                            Create a new secure password for this user.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">New Password</Label>
                            <Input
                                type="password"
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                placeholder="Enter strong password"
                                className="h-11"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsResetModalOpen(false)}>Cancel</Button>
                        <Button onClick={handlePasswordReset} disabled={submitting || !newPassword}>
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Reset"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {filteredUsers.length === 0 && (
                <div className="py-20 text-center space-y-3">
                    <Users className="h-12 w-12 text-muted-foreground mx-auto opacity-20" />
                    <p className="text-muted-foreground font-medium">No system users found matching your criteria.</p>
                </div>
            )}
        </div>
    )
}
