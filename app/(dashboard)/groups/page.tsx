"use client"

import { Suspense, useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Search, Loader2, Users, Briefcase, Building2,
    ChevronDown, ChevronRight, Download, Trash2, X,
    ArrowLeft, UserPlus, Shield, Mail, Eye
} from "lucide-react"
import Link from "next/link"
import * as XLSX from "xlsx"
import { toast } from "sonner"

interface Manager {
    id: string
    name: string
    email: string
}

interface Inspector {
    id: string
    name: string
    email: string
    assignmentId?: string
}

interface Project {
    id: string
    name: string
    managers: Manager[]
    inspectors: Inspector[]
}

interface CompanyGroup {
    id: string
    name: string
    projects: Project[]
}

interface AvailableUser {
    id: string
    name: string
    email: string
}

// ─── Detail View ─────────────────────────────────────────────────────────────

function GroupDetailView({
    project,
    companyName,
    canEdit,
    onBack,
    onRefresh,
}: {
    project: Project
    companyName: string
    canEdit: boolean
    onBack: () => void
    onRefresh: () => void
}) {
    const [deletingInspectorId, setDeletingInspectorId] = useState<string | null>(null)
    const [deletingManagerId, setDeletingManagerId] = useState<string | null>(null)
    const [addMembersOpen, setAddMembersOpen] = useState(false)
    const [availableInspectors, setAvailableInspectors] = useState<AvailableUser[]>([])
    const [availableManagers, setAvailableManagers] = useState<AvailableUser[]>([])
    const [selectedInspectorIds, setSelectedInspectorIds] = useState<string[]>([])
    const [selectedManagerIds, setSelectedManagerIds] = useState<string[]>([])
    const [addingMembers, setAddingMembers] = useState(false)
    const [loadingMembers, setLoadingMembers] = useState(false)

    const removeInspector = async (assignmentId: string) => {
        if (!confirm("Remove this inspector from the group?")) return
        setDeletingInspectorId(assignmentId)
        try {
            const res = await fetch(`/api/groups?assignmentId=${assignmentId}`, { method: "DELETE" })
            if (res.ok) {
                toast.success("Inspector removed")
                onRefresh()
            } else {
                toast.error("Failed to remove inspector")
            }
        } catch {
            toast.error("Error removing inspector")
        } finally {
            setDeletingInspectorId(null)
        }
    }

    const removeManager = async (managerId: string) => {
        if (!confirm("Remove this manager from the group?")) return
        setDeletingManagerId(managerId)
        try {
            const res = await fetch(`/api/groups?managerId=${managerId}&projectId=${project.id}`, { method: "DELETE" })
            if (res.ok) {
                toast.success("Manager removed")
                onRefresh()
            } else {
                toast.error("Failed to remove manager")
            }
        } catch {
            toast.error("Error removing manager")
        } finally {
            setDeletingManagerId(null)
        }
    }

    const openAddMembers = async () => {
        setSelectedInspectorIds([])
        setSelectedManagerIds([])
        setAddMembersOpen(true)
        setLoadingMembers(true)
        try {
            const [insRes, mgrRes] = await Promise.all([
                fetch("/api/users?role=INSPECTION_BOY"),
                fetch("/api/users?role=MANAGER"),
            ])
            if (insRes.ok) {
                const all = await insRes.json()
                const existing = new Set(project.inspectors.map(i => i.id))
                setAvailableInspectors(all.filter((i: AvailableUser) => !existing.has(i.id)))
            }
            if (mgrRes.ok) {
                const all = await mgrRes.json()
                const existing = new Set(project.managers.map(m => m.id))
                setAvailableManagers(all.filter((m: AvailableUser) => !existing.has(m.id)))
            }
        } catch {
            toast.error("Failed to load users")
        } finally {
            setLoadingMembers(false)
        }
    }

    const handleAddMembers = async () => {
        if (selectedInspectorIds.length === 0 && selectedManagerIds.length === 0) return
        setAddingMembers(true)
        try {
            const res = await fetch("/api/assignments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectId: project.id,
                    inspectorIds: selectedInspectorIds.length > 0 ? selectedInspectorIds : undefined,
                    managerIds: selectedManagerIds.length > 0 ? selectedManagerIds : undefined,
                }),
            })
            if (res.ok) {
                toast.success("Members added successfully")
                setAddMembersOpen(false)
                onRefresh()
            } else {
                const err = await res.json()
                toast.error(err.error || "Failed to add members")
            }
        } catch {
            toast.error("An error occurred")
        } finally {
            setAddingMembers(false)
        }
    }

    const exportToExcel = () => {
        const exportData: any[] = []
        project.managers.forEach(m => exportData.push({ Role: "Manager", Name: m.name, Email: m.email }))
        project.inspectors.forEach(i => exportData.push({ Role: "Inspector", Name: i.name, Email: i.email }))
        const ws = XLSX.utils.json_to_sheet(exportData)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, "Members")
        XLSX.writeFile(wb, `${project.name}_members.xlsx`)
    }

    const totalMembers = project.managers.length + project.inspectors.length

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={onBack}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Building2 className="h-3 w-3" /> {companyName}
                        </p>
                        <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
                        <p className="text-sm text-muted-foreground">
                            {totalMembers} member{totalMembers !== 1 ? "s" : ""} ·{" "}
                            {project.managers.length} manager{project.managers.length !== 1 ? "s" : ""} ·{" "}
                            {project.inspectors.length} inspector{project.inspectors.length !== 1 ? "s" : ""}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {canEdit && (
                        <Button onClick={openAddMembers}>
                            <UserPlus className="h-4 w-4 mr-2" />
                            Add Members
                        </Button>
                    )}
                    <Button variant="outline" onClick={exportToExcel}>
                        <Download className="h-4 w-4 mr-2" />
                        Export Excel
                    </Button>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Managers Card */}
                <Card>
                    <CardHeader className="pb-3 border-b">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Shield className="h-4 w-4 text-purple-600" />
                            Managers
                            <Badge variant="secondary" className="ml-auto">{project.managers.length}</Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-2">
                        {project.managers.length === 0 ? (
                            <p className="text-sm text-muted-foreground italic text-center py-6">No managers assigned</p>
                        ) : (
                            project.managers.map(manager => (
                                <div
                                    key={manager.id}
                                    className="flex items-center justify-between bg-purple-50 border border-purple-100 rounded-lg p-3"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-sm shrink-0">
                                            {manager.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-medium text-sm truncate">{manager.name}</p>
                                            <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                                                <Mail className="h-3 w-3" />{manager.email}
                                            </p>
                                        </div>
                                    </div>
                                    {canEdit && (
                                        <button
                                            onClick={() => removeManager(manager.id)}
                                            disabled={deletingManagerId === manager.id}
                                            className="text-red-400 hover:text-red-600 p-2 rounded-md hover:bg-red-50 transition-colors shrink-0"
                                            title="Remove manager"
                                        >
                                            {deletingManagerId === manager.id
                                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                                : <Trash2 className="h-4 w-4" />
                                            }
                                        </button>
                                    )}
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>

                {/* Inspectors Card */}
                <Card>
                    <CardHeader className="pb-3 border-b">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Users className="h-4 w-4 text-amber-600" />
                            Inspectors
                            <Badge variant="secondary" className="ml-auto">{project.inspectors.length}</Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-2">
                        {project.inspectors.length === 0 ? (
                            <p className="text-sm text-muted-foreground italic text-center py-6">No inspectors assigned</p>
                        ) : (
                            project.inspectors.map(inspector => (
                                <div
                                    key={inspector.id}
                                    className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-lg p-3"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-sm shrink-0">
                                            {inspector.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-medium text-sm truncate">{inspector.name}</p>
                                            <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                                                <Mail className="h-3 w-3" />{inspector.email}
                                            </p>
                                        </div>
                                    </div>
                                    {canEdit && (
                                        <button
                                            onClick={() => inspector.assignmentId && removeInspector(inspector.assignmentId)}
                                            disabled={deletingInspectorId === inspector.assignmentId}
                                            className="text-red-400 hover:text-red-600 p-2 rounded-md hover:bg-red-50 transition-colors shrink-0"
                                            title="Remove inspector"
                                        >
                                            {deletingInspectorId === inspector.assignmentId
                                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                                : <Trash2 className="h-4 w-4" />
                                            }
                                        </button>
                                    )}
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Add Members Dialog */}
            <AddMembersDialog
                open={addMembersOpen}
                onOpenChange={setAddMembersOpen}
                projectName={project.name}
                availableInspectors={availableInspectors}
                availableManagers={availableManagers}
                selectedInspectorIds={selectedInspectorIds}
                setSelectedInspectorIds={setSelectedInspectorIds}
                selectedManagerIds={selectedManagerIds}
                setSelectedManagerIds={setSelectedManagerIds}
                onSubmit={handleAddMembers}
                loading={addingMembers}
                loadingMembers={loadingMembers}
            />
        </div>
    )
}

// ─── Main Groups Content ──────────────────────────────────────────────────────

function GroupsContent() {
    const { data: session, status } = useSession()
    const router = useRouter()

    const [groups, setGroups] = useState<CompanyGroup[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
    const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set())
    const [deletingId, setDeletingId] = useState<string | null>(null)

    // Detail view state
    const [detailProject, setDetailProject] = useState<Project | null>(null)
    const [detailCompanyName, setDetailCompanyName] = useState("")

    // Add Members Dialog State (for card-level button)
    const [addMembersOpen, setAddMembersOpen] = useState(false)
    const [addMembersProject, setAddMembersProject] = useState<Project | null>(null)
    const [availableInspectors, setAvailableInspectors] = useState<AvailableUser[]>([])
    const [availableManagers, setAvailableManagers] = useState<AvailableUser[]>([])
    const [selectedInspectorIds, setSelectedInspectorIds] = useState<string[]>([])
    const [selectedManagerIds, setSelectedManagerIds] = useState<string[]>([])
    const [addingMembers, setAddingMembers] = useState(false)
    const [loadingMembers, setLoadingMembers] = useState(false)

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login")
        } else if (status === "authenticated" && session?.user?.role !== "ADMIN" && session?.user?.role !== "MANAGER") {
            router.push("/")
        }
    }, [status, session, router])

    useEffect(() => {
        fetchGroups()
    }, [])

    const fetchGroups = async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/groups?t=${Date.now()}`)
            if (res.ok) {
                const data = await res.json()
                setGroups(data)

                // Sync detailProject if it exists
                if (detailProject) {
                    for (const company of data) {
                        const updatedProj = company.projects.find((p: Project) => p.id === detailProject.id)
                        if (updatedProj) {
                            setDetailProject(updatedProj)
                            setDetailCompanyName(company.name)
                            break
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Failed to fetch groups", error)
        } finally {
            setLoading(false)
        }
    }

    const toggleCompany = (companyId: string) => {
        setExpandedCompanies(prev => {
            const newSet = new Set(prev)
            if (newSet.has(companyId)) newSet.delete(companyId)
            else newSet.add(companyId)
            return newSet
        })
    }

    const removeInspectorFromCard = async (assignmentId: string) => {
        if (!confirm("Remove this inspector from the group?")) return
        setDeletingId(assignmentId)
        try {
            const res = await fetch(`/api/groups?assignmentId=${assignmentId}`, { method: "DELETE" })
            if (res.ok) fetchGroups()
        } catch {
            toast.error("Failed to remove inspector")
        } finally {
            setDeletingId(null)
        }
    }

    const openAddMembersDialog = async (project: Project) => {
        setAddMembersProject(project)
        setSelectedInspectorIds([])
        setSelectedManagerIds([])
        setAddMembersOpen(true)
        setLoadingMembers(true)
        try {
            const [insRes, mgrRes] = await Promise.all([
                fetch("/api/users?role=INSPECTION_BOY"),
                fetch("/api/users?role=MANAGER"),
            ])
            if (insRes.ok) {
                const allInspectors = await insRes.json()
                const existingIds = new Set(project.inspectors.map(i => i.id))
                setAvailableInspectors(allInspectors.filter((i: AvailableUser) => !existingIds.has(i.id)))
            }
            if (mgrRes.ok) {
                const allManagers = await mgrRes.json()
                const existingMgrIds = new Set(project.managers.map(m => m.id))
                setAvailableManagers(allManagers.filter((m: AvailableUser) => !existingMgrIds.has(m.id)))
            }
        } catch {
            toast.error("Failed to load users")
        } finally {
            setLoadingMembers(false)
        }
    }

    const handleAddMembers = async () => {
        if (!addMembersProject || (selectedInspectorIds.length === 0 && selectedManagerIds.length === 0)) return
        setAddingMembers(true)
        try {
            const res = await fetch("/api/assignments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectId: addMembersProject.id,
                    inspectorIds: selectedInspectorIds.length > 0 ? selectedInspectorIds : undefined,
                    managerIds: selectedManagerIds.length > 0 ? selectedManagerIds : undefined,
                }),
            })
            if (res.ok) {
                const result = await res.json()
                toast.success(`Members added to group`)
                setAddMembersOpen(false)
                fetchGroups()
            } else {
                const error = await res.json()
                toast.error(error.error || "Failed to add members")
            }
        } catch {
            toast.error("An error occurred")
        } finally {
            setAddingMembers(false)
        }
    }

    const exportToExcel = (project?: Project, companyName?: string) => {
        const exportData: any[] = []
        if (project) {
            project.managers.forEach(m => exportData.push({ Role: "Manager", Name: m.name, Email: m.email }))
            project.inspectors.forEach(i => exportData.push({ Role: "Inspector", Name: i.name, Email: i.email }))
        } else {
            groups.forEach(company => {
                company.projects.forEach(proj => {
                    proj.managers.forEach(m => exportData.push({ Company: company.name, Project: proj.name, Role: "Manager", Name: m.name, Email: m.email }))
                    proj.inspectors.forEach(i => exportData.push({ Company: company.name, Project: proj.name, Role: "Inspector", Name: i.name, Email: i.email }))
                })
            })
        }
        const ws = XLSX.utils.json_to_sheet(exportData)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, project ? "Project Members" : "Groups")
        XLSX.writeFile(wb, project ? `${project.name}_members.xlsx` : "project_groups.xlsx")
    }

    const filteredGroups = groups.filter(group =>
        group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        group.projects.some(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
    )

    const canEdit = session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER"

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    // ─── Detail View ────────────────────────────────────────
    if (detailProject) {
        return (
            <GroupDetailView
                project={detailProject}
                companyName={detailCompanyName}
                canEdit={canEdit}
                onBack={() => setDetailProject(null)}
                onRefresh={fetchGroups}
            />
        )
    }

    // ─── Main List View ─────────────────────────────────────
    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Groups</h1>
                    <p className="text-muted-foreground">View company projects and team members</p>
                </div>
                {groups.length > 0 && (
                    <Button variant="outline" onClick={() => exportToExcel()}>
                        <Download className="h-4 w-4 mr-2" />
                        Export All
                    </Button>
                )}
            </div>

            <div className="relative w-full max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search company or project..."
                    className="pl-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {filteredGroups.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <Users className="h-12 w-12 text-muted-foreground opacity-20 mb-4" />
                        <p className="text-muted-foreground mb-4">No groups found</p>
                        <Button asChild>
                            <Link href="/assignments">Go to Assignments</Link>
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {filteredGroups.map((group) => (
                        <Card key={group.id} className="overflow-hidden">
                            <CardHeader
                                className="cursor-pointer hover:bg-muted/50 transition-colors py-4"
                                onClick={() => toggleCompany(group.id)}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        {expandedCompanies.has(group.id)
                                            ? <ChevronDown className="h-5 w-5 text-muted-foreground" />
                                            : <ChevronRight className="h-5 w-5 text-muted-foreground" />
                                        }
                                        <Building2 className="h-5 w-5 text-primary" />
                                        <CardTitle className="text-lg">{group.name}</CardTitle>
                                        <Badge variant="secondary">{group.projects.length} group{group.projects.length !== 1 ? "s" : ""}</Badge>
                                    </div>
                                </div>
                            </CardHeader>

                            {expandedCompanies.has(group.id) && (
                                <CardContent className="pt-0">
                                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                        {group.projects.map((project) => (
                                            <Card key={project.id} className="bg-muted/30 hover:bg-muted/50 transition-colors">
                                                <CardHeader className="pb-2">
                                                    <div className="flex items-center gap-2">
                                                        <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" />
                                                        <span className="font-semibold text-sm truncate">{project.name}</span>
                                                    </div>
                                                </CardHeader>
                                                <CardContent className="space-y-3">
                                                    {/* Managers */}
                                                    <div>
                                                        <p className="text-xs text-muted-foreground font-medium mb-1.5 flex items-center gap-1">
                                                            <Shield className="h-3 w-3" /> Managers ({project.managers.length})
                                                        </p>
                                                        {project.managers.length > 0 ? (
                                                            <div className="space-y-1 max-h-20 overflow-y-auto">
                                                                {project.managers.map(m => (
                                                                    <div key={m.id} className="flex items-center justify-between bg-purple-50 border border-purple-100 rounded px-2 py-1">
                                                                        <span className="text-xs font-medium text-purple-800 truncate">{m.name}</span>
                                                                        {canEdit && (
                                                                            <button
                                                                                onClick={async (e) => {
                                                                                    e.stopPropagation()
                                                                                    if (!confirm(`Remove ${m.name} as manager?`)) return
                                                                                    try {
                                                                                        const res = await fetch(`/api/groups?managerId=${m.id}&projectId=${project.id}`, { method: "DELETE" })
                                                                                        if (res.ok) { toast.success("Manager removed"); fetchGroups() }
                                                                                    } catch { toast.error("Failed") }
                                                                                }}
                                                                                className="text-red-400 hover:text-red-600 p-1 shrink-0 ml-1"
                                                                                title="Remove manager"
                                                                            >
                                                                                <X className="h-3 w-3" />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground italic">No manager</span>
                                                        )}
                                                    </div>

                                                    {/* Inspectors */}
                                                    <div>
                                                        <p className="text-xs text-muted-foreground font-medium mb-1.5 flex items-center gap-1">
                                                            <Users className="h-3 w-3" /> Inspectors ({project.inspectors.length})
                                                        </p>
                                                        {project.inspectors.length > 0 ? (
                                                            <div className="space-y-1 max-h-24 overflow-y-auto">
                                                                {project.inspectors.map(inspector => (
                                                                    <div key={inspector.id} className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded px-2 py-1">
                                                                        <span className="text-xs font-medium text-amber-800 truncate">{inspector.name}</span>
                                                                        {canEdit && (
                                                                            <button
                                                                                onClick={() => inspector.assignmentId && removeInspectorFromCard(inspector.assignmentId)}
                                                                                disabled={deletingId === inspector.assignmentId}
                                                                                className="text-red-400 hover:text-red-600 p-1 shrink-0 ml-1"
                                                                                title="Remove inspector"
                                                                            >
                                                                                {deletingId === inspector.assignmentId
                                                                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                                                                    : <X className="h-3 w-3" />
                                                                                }
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground italic">No inspectors</span>
                                                        )}
                                                    </div>

                                                    {/* Action buttons */}
                                                    <div className="flex gap-2 pt-1">
                                                        <Button
                                                            variant="default"
                                                            size="sm"
                                                            className="flex-1 text-xs h-8"
                                                            onClick={() => {
                                                                setDetailProject(project)
                                                                setDetailCompanyName(group.name)
                                                            }}
                                                        >
                                                            <Eye className="h-3 w-3 mr-1" />
                                                            View Details
                                                        </Button>
                                                        {canEdit && (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="flex-1 text-xs h-8"
                                                                onClick={() => openAddMembersDialog(project)}
                                                            >
                                                                <UserPlus className="h-3 w-3 mr-1" />
                                                                Add
                                                            </Button>
                                                        )}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                </CardContent>
                            )}
                        </Card>
                    ))}
                </div>
            )}

            {/* Add Members Dialog */}
            {addMembersProject && (
                <AddMembersDialog
                    open={addMembersOpen}
                    onOpenChange={setAddMembersOpen}
                    projectName={addMembersProject.name}
                    availableInspectors={availableInspectors}
                    availableManagers={availableManagers}
                    selectedInspectorIds={selectedInspectorIds}
                    setSelectedInspectorIds={setSelectedInspectorIds}
                    selectedManagerIds={selectedManagerIds}
                    setSelectedManagerIds={setSelectedManagerIds}
                    onSubmit={handleAddMembers}
                    loading={addingMembers}
                    loadingMembers={loadingMembers}
                />
            )}
        </div>
    )
}

// ─── Reusable Add Members Dialog ─────────────────────────────────────────────

function AddMembersDialog({
    open,
    onOpenChange,
    projectName,
    availableInspectors,
    availableManagers,
    selectedInspectorIds,
    setSelectedInspectorIds,
    selectedManagerIds,
    setSelectedManagerIds,
    onSubmit,
    loading,
    loadingMembers,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    projectName: string
    availableInspectors: AvailableUser[]
    availableManagers: AvailableUser[]
    selectedInspectorIds: string[]
    setSelectedInspectorIds: (ids: string[]) => void
    selectedManagerIds: string[]
    setSelectedManagerIds: (ids: string[]) => void
    onSubmit: () => void
    loading: boolean
    loadingMembers: boolean
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <UserPlus className="h-5 w-5" />
                        Add Members to {projectName}
                    </DialogTitle>
                    <DialogDescription>
                        Select inspectors and managers to add to this group
                    </DialogDescription>
                </DialogHeader>

                {loadingMembers ? (
                    <div className="py-8 text-center">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                        <p className="text-muted-foreground mt-2">Loading available members...</p>
                    </div>
                ) : (
                    <div className="space-y-4 py-2">
                        {/* Inspectors */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-1">
                                <Users className="h-4 w-4 text-amber-600" /> Select Inspectors
                            </label>
                            <div className="border rounded-md max-h-48 overflow-y-auto p-3 space-y-2 bg-muted/20">
                                {availableInspectors.length === 0 ? (
                                    <p className="text-sm text-muted-foreground italic">No more inspectors available</p>
                                ) : (
                                    availableInspectors.map(i => (
                                        <label key={i.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded">
                                            <input
                                                type="checkbox"
                                                checked={selectedInspectorIds.includes(i.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) setSelectedInspectorIds([...selectedInspectorIds, i.id])
                                                    else setSelectedInspectorIds(selectedInspectorIds.filter(id => id !== i.id))
                                                }}
                                                className="rounded border-gray-300"
                                            />
                                            <span className="text-sm font-medium">{i.name}</span>
                                            <span className="text-xs text-muted-foreground">({i.email})</span>
                                        </label>
                                    ))
                                )}
                            </div>
                            {selectedInspectorIds.length > 0 && (
                                <p className="text-xs text-muted-foreground">{selectedInspectorIds.length} inspector(s) selected</p>
                            )}
                        </div>

                        {/* Managers */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-1">
                                <Shield className="h-4 w-4 text-purple-600" /> Select Managers (Optional)
                            </label>
                            <div className="border rounded-md max-h-36 overflow-y-auto p-3 space-y-2 bg-muted/20">
                                {availableManagers.length === 0 ? (
                                    <p className="text-sm text-muted-foreground italic">No more managers available</p>
                                ) : (
                                    availableManagers.map(m => (
                                        <label key={m.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded">
                                            <input
                                                type="checkbox"
                                                checked={selectedManagerIds.includes(m.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) setSelectedManagerIds([...selectedManagerIds, m.id])
                                                    else setSelectedManagerIds(selectedManagerIds.filter(id => id !== m.id))
                                                }}
                                                className="rounded border-gray-300"
                                            />
                                            <span className="text-sm font-medium">{m.name}</span>
                                            <span className="text-xs text-muted-foreground">({m.email})</span>
                                        </label>
                                    ))
                                )}
                            </div>
                            {selectedManagerIds.length > 0 && (
                                <p className="text-xs text-muted-foreground">{selectedManagerIds.length} manager(s) selected</p>
                            )}
                        </div>

                        <div className="flex gap-3 pt-2">
                            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                            <Button
                                className="flex-1"
                                onClick={onSubmit}
                                disabled={loading || (selectedInspectorIds.length === 0 && selectedManagerIds.length === 0)}
                            >
                                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Add {selectedInspectorIds.length > 0 ? `${selectedInspectorIds.length} Inspector(s)` : ""}
                                {selectedInspectorIds.length > 0 && selectedManagerIds.length > 0 ? " + " : ""}
                                {selectedManagerIds.length > 0 ? `${selectedManagerIds.length} Manager(s)` : ""}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}

export default function GroupsPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        }>
            <GroupsContent />
        </Suspense>
    )
}
