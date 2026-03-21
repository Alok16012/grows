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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

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

interface Company {
    id: string
    name: string
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
        if (!confirm("Are you sure you want to remove this inspector from the group? This will permanently delete their assignment.")) return
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
        if (!confirm("Are you sure you want to remove this manager from the group?")) return
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
        <div className="p-6 lg:p-7 space-y-6">
            <div>
                <p className="text-[12.5px] text-[#6b6860] flex items-center gap-1.5">
                    <Building2 className="h-[13px] w-[13px] text-[#9e9b95]" /> {companyName}
                </p>
                <div className="flex items-center justify-between flex-wrap gap-4 mt-3">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onBack}
                            className="h-8 w-8 bg-white border border-[#e8e6e1] rounded-[8px] flex items-center justify-center text-[#6b6860] cursor-pointer hover:bg-[#f9f8f5] transition-colors"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </button>
                        <h1 className="text-[22px] font-semibold tracking-tight text-[#1a1a18]">{project.name}</h1>
                    </div>
                    <div className="flex items-center gap-[10px]">
                        {canEdit && (
                            <Button
                                onClick={openAddMembers}
                                className="bg-[#1a9e6e] text-white hover:bg-[#1a9e6e]/90 rounded-[9px] text-[13px] font-medium h-9 px-3"
                            >
                                <UserPlus className="h-4 w-4 mr-2" />
                                Add Members
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            onClick={exportToExcel}
                            className="bg-white border border-[#e8e6e1] text-[#6b6860] rounded-[9px] text-[13px] font-medium h-9 px-3"
                        >
                            <Download className="h-4 w-4 mr-2" />
                            Export Excel
                        </Button>
                    </div>
                </div>
                <p className="text-[13px] text-[#6b6860] mt-1.5 ml-[46px]">
                    {totalMembers} member{totalMembers !== 1 ? "s" : ""} ·{" "}
                    {project.managers.length} manager{project.managers.length !== 1 ? "s" : ""} ·{" "}
                    {project.inspectors.length} inspector{project.inspectors.length !== 1 ? "s" : ""}
                </p>
            </div>

            <div className="border-t border-[#e8e6e1] my-4" />

            <div className="grid gap-4 md:grid-cols-2">
                <div className="bg-white border border-[#e8e6e1] rounded-[14px] overflow-hidden">
                    <div className="px-[18px] py-[14px] border-b border-[#e8e6e1] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Shield className="h-[15px] w-[15px] text-[#6b6860]" />
                            <span className="text-[13.5px] font-semibold text-[#1a1a18]">Managers</span>
                        </div>
                        <span className="bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] text-[12px] font-semibold text-[#1a1a18] px-[10px] py-[2px]">
                            {project.managers.length}
                        </span>
                    </div>
                    <div className="divide-y divide-[#e8e6e1]">
                        {project.managers.length === 0 ? (
                            <p className="text-sm text-[#9e9b95] italic text-center py-6">No managers assigned</p>
                        ) : (
                            project.managers.map(manager => (
                                <div
                                    key={manager.id}
                                    className="px-[18px] py-3 flex items-center gap-3 hover:bg-[#f9f8f5] transition-colors"
                                >
                                    <div className="h-[34px] w-[34px] rounded-full bg-[#e8f7f1] flex items-center justify-center text-[#0d6b4a] font-semibold text-[13px] shrink-0">
                                        {manager.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[13px] font-medium text-[#1a1a18] truncate">{manager.name}</p>
                                        <p className="text-[12px] text-[#6b6860] flex items-center gap-1 truncate">
                                            <Mail className="h-[11px] w-[11px] text-[#9e9b95]" />{manager.email}
                                        </p>
                                    </div>
                                    {canEdit && (
                                        <button
                                            onClick={() => removeManager(manager.id)}
                                            disabled={deletingManagerId === manager.id}
                                            className="ml-auto h-7 w-7 rounded-[7px] bg-transparent border-none hover:bg-[#fef2f2] text-[#9e9b95] hover:text-[#dc2626] transition-colors shrink-0 flex items-center justify-center"
                                            title="Remove manager"
                                        >
                                            {deletingManagerId === manager.id
                                                ? <Loader2 className="h-[14px] w-[14px] animate-spin" />
                                                : <Trash2 className="h-[14px] w-[14px]" />
                                            }
                                        </button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="bg-white border border-[#e8e6e1] rounded-[14px] overflow-hidden">
                    <div className="px-[18px] py-[14px] border-b border-[#e8e6e1] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Users className="h-[15px] w-[15px] text-[#6b6860]" />
                            <span className="text-[13.5px] font-semibold text-[#1a1a18]">Inspectors</span>
                        </div>
                        <span className="bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] text-[12px] font-semibold text-[#1a1a18] px-[10px] py-[2px]">
                            {project.inspectors.length}
                        </span>
                    </div>
                    <div className="divide-y divide-[#e8e6e1]">
                        {project.inspectors.length === 0 ? (
                            <p className="text-sm text-[#9e9b95] italic text-center py-6">No inspectors assigned</p>
                        ) : (
                            project.inspectors.map(inspector => (
                                <div
                                    key={inspector.id}
                                    className="px-[18px] py-3 flex items-center gap-3 hover:bg-[#f9f8f5] transition-colors"
                                >
                                    <div className="h-[34px] w-[34px] rounded-full bg-[#fef3c7] flex items-center justify-center text-[#92400e] font-semibold text-[13px] shrink-0">
                                        {inspector.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[13px] font-medium text-[#1a1a18] truncate">{inspector.name}</p>
                                        <p className="text-[12px] text-[#6b6860] flex items-center gap-1 truncate">
                                            <Mail className="h-[11px] w-[11px] text-[#9e9b95]" />{inspector.email}
                                        </p>
                                    </div>
                                    {canEdit && (
                                        <button
                                            onClick={() => inspector.assignmentId && removeInspector(inspector.assignmentId)}
                                            disabled={deletingInspectorId === inspector.assignmentId}
                                            className="ml-auto h-7 w-7 rounded-[7px] bg-transparent border-none hover:bg-[#fef2f2] text-[#9e9b95] hover:text-[#dc2626] transition-colors shrink-0 flex items-center justify-center"
                                            title="Remove inspector"
                                        >
                                            {deletingInspectorId === inspector.assignmentId
                                                ? <Loader2 className="h-[14px] w-[14px] animate-spin" />
                                                : <Trash2 className="h-[14px] w-[14px]" />
                                            }
                                        </button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
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

    // Create Group State
    const [createGroupOpen, setCreateGroupOpen] = useState(false)
    const [companies, setCompanies] = useState<Company[]>([])
    const [fetchingCompanies, setFetchingCompanies] = useState(false)

    const openCreateGroupDialog = async () => {
        setCreateGroupOpen(true)
        if (companies.length === 0 && (session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER")) {
            setFetchingCompanies(true)
            try {
                const res = await fetch("/api/companies")
                if (res.ok) {
                    const data = await res.json()
                    setCompanies(data)
                } else {
                    toast.error("Failed to load companies")
                }
            } catch (error) {
                toast.error("Failed to fetch companies")
            } finally {
                setFetchingCompanies(false)
            }
        }
    }

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login")
        } else if (status === "authenticated" && session?.user?.role !== "ADMIN" && session?.user?.role !== "MANAGER") {
            router.push("/")
        }
    }, [status, session, router])

    useEffect(() => {
        if (session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER") {
            fetchGroups()
        }
    }, [session?.user?.role])

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
        if (!confirm("Are you sure you want to remove this inspector from the group? This will permanently delete their assignment.")) return
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
        <div className="min-h-screen bg-[#f5f4f0] p-6 lg:p-7">
            <div className="flex items-center justify-between mb-5">
                <div>
                    <h1 className="text-[22px] font-semibold tracking-tight text-[#1a1a18]">Groups</h1>
                    <p className="text-[13px] text-[#6b6860] mt-[3px]">View company projects and team members</p>
                </div>
                {groups.length > 0 && (
                    <div className="flex items-center gap-[10px]">
                        {canEdit && (
                            <Button
                                onClick={openCreateGroupDialog}
                                className="bg-[#1a9e6e] text-white hover:bg-[#1a9e6e]/90 rounded-[9px] text-[13px] font-medium h-9 px-3"
                            >
                                <Users name="Plus" className="h-4 w-4 mr-2" />
                                Create Group
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            onClick={() => exportToExcel()}
                            className="bg-white border border-[#e8e6e1] text-[#6b6860] rounded-[9px] text-[13px] font-medium h-9 px-3"
                        >
                            <Download className="h-4 w-4 mr-2" />
                            Export All
                        </Button>
                    </div>
                )}
                {groups.length === 0 && canEdit && (
                    <Button
                        onClick={openCreateGroupDialog}
                        className="bg-[#1a9e6e] text-white hover:bg-[#1a9e6e]/90 rounded-[9px] text-[13px] font-medium h-9 px-3"
                    >
                        <Users name="Plus" className="h-4 w-4 mr-2" />
                        Create Group
                    </Button>
                )}
            </div>

            <div className="relative w-full max-w-full mb-4">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9e9b95]" />
                <Input
                    placeholder="Search company or project..."
                    className="pl-9 pr-4 py-[9px] bg-white border border-[#e8e6e1] rounded-[10px] text-[13px] text-[#1a1a18] placeholder:text-[#9e9b95] focus:border-[#1a9e6e] focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)] focus:outline-none transition-shadow w-full"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {filteredGroups.length === 0 ? (
                <Card className="bg-white border border-[#e8e6e1] rounded-xl">
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <Users className="h-12 w-12 text-muted-foreground opacity-20 mb-4" />
                        <p className="text-muted-foreground mb-4">No groups found</p>
                        <Button asChild>
                            <Link href="/assignments">Go to Assignments</Link>
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {filteredGroups.map((group) => (
                        <div
                            key={group.id}
                            className="bg-white border border-[#e8e6e1] rounded-[12px] overflow-hidden"
                        >
                            <div
                                className="p-[14px] pl-5 flex items-center gap-[10px] cursor-pointer hover:bg-[#f9f8f5] transition-colors"
                                onClick={() => toggleCompany(group.id)}
                            >
                                {expandedCompanies.has(group.id)
                                    ? <ChevronDown className="h-4 w-4 text-[#9e9b95] transition-transform duration-200" />
                                    : <ChevronRight className="h-4 w-4 text-[#9e9b95] transition-transform duration-200" />
                                }
                                <Building2 className="h-4 w-4 text-[#6b6860] shrink-0" />
                                <span className="text-[14px] font-semibold text-[#1a1a18]">{group.name}</span>
                                <span className="bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] text-[11.5px] font-medium text-[#6b6860] px-[10px] py-[2px]">
                                    {group.projects.length} group{group.projects.length !== 1 ? "s" : ""}
                                </span>
                            </div>

                            {expandedCompanies.has(group.id) && (
                                <div className="px-4 pb-4 border-t border-[#e8e6e1]">
                                    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
                                        {group.projects.map((project) => (
                                            <div key={project.id} className="bg-white border border-[#e8e6e1] rounded-[10px] p-4">
                                                <div className="flex items-center gap-2 mb-[14px]">
                                                    <Briefcase className="h-[14px] w-[14px] text-[#6b6860] shrink-0" />
                                                    <span className="text-[14px] font-semibold text-[#1a1a18] truncate">{project.name}</span>
                                                </div>

                                                <div className="mb-3">
                                                    <div className="flex items-center gap-1.5 mb-2">
                                                        <Shield className="h-[13px] w-[13px] text-[#9e9b95]" />
                                                        <span className="text-[12px] font-medium text-[#6b6860]">Managers</span>
                                                        <span className="text-[12px] text-[#9e9b95] font-normal">({project.managers.length})</span>
                                                    </div>
                                                    {project.managers.length > 0 ? (
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {project.managers.map(m => (
                                                                <div key={m.id} className="flex items-center gap-[5px] bg-[#e8f7f1] text-[#0d6b4a] border border-[rgba(26,158,110,0.2)] rounded-[20px] px-[10px] py-[4px] pl-[10px] pr-[8px]">
                                                                    <span className="text-[12px] font-medium">{m.name}</span>
                                                                    {canEdit && (
                                                                        <button
                                                                            onClick={async (e) => {
                                                                                e.stopPropagation()
                                                                                if (!confirm(`Are you sure you want to remove ${m.name} as manager from this group?`)) return
                                                                                try {
                                                                                    const res = await fetch(`/api/groups?managerId=${m.id}&projectId=${project.id}`, { method: "DELETE" })
                                                                                    if (res.ok) { toast.success("Manager removed"); fetchGroups() }
                                                                                } catch { toast.error("Failed") }
                                                                            }}
                                                                            className="text-[#9e9b95] hover:text-[#dc2626] bg-transparent border-none cursor-pointer flex items-center justify-center p-0 leading-none"
                                                                            title="Remove manager"
                                                                        >
                                                                            <X className="h-3.5 w-3.5" />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-[11px] text-[#9e9b95] italic">No managers</span>
                                                    )}
                                                </div>

                                                <div>
                                                    <div className="flex items-center gap-1.5 mb-2">
                                                        <Users className="h-[13px] w-[13px] text-[#9e9b95]" />
                                                        <span className="text-[12px] font-medium text-[#6b6860]">Inspectors</span>
                                                        <span className="text-[12px] text-[#9e9b95] font-normal">({project.inspectors.length})</span>
                                                    </div>
                                                    {project.inspectors.length > 0 ? (
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {project.inspectors.map(inspector => (
                                                                <div key={inspector.id} className="flex items-center gap-[5px] bg-[#fef9ec] text-[#92400e] border border-[rgba(217,119,6,0.2)] rounded-[20px] px-[10px] py-[4px] pl-[10px] pr-[8px]">
                                                                    <span className="text-[12px] font-medium">{inspector.name}</span>
                                                                    {canEdit && (
                                                                        <button
                                                                            onClick={() => inspector.assignmentId && removeInspectorFromCard(inspector.assignmentId)}
                                                                            disabled={deletingId === inspector.assignmentId}
                                                                            className="text-[#9e9b95] hover:text-[#dc2626] bg-transparent border-none cursor-pointer flex items-center justify-center p-0 leading-none"
                                                                            title="Remove inspector"
                                                                        >
                                                                            {deletingId === inspector.assignmentId
                                                                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                                : <X className="h-3.5 w-3.5" />
                                                                            }
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-[11px] text-[#9e9b95] italic">No inspectors</span>
                                                    )}
                                                </div>

                                                <div className="flex gap-2 mt-[14px] pt-3 border-t border-[#e8e6e1]">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="flex-1 text-[12px] h-8 rounded-[8px] border-[#e8e6e1] text-[#6b6860] bg-white hover:bg-[#e8f7f1] hover:text-[#0d6b4a] hover:border-[#1a9e6e] px-3"
                                                        onClick={() => {
                                                            setDetailProject(project)
                                                            setDetailCompanyName(group.name)
                                                        }}
                                                    >
                                                        <Eye className="h-3 w-3 mr-1.5" />
                                                        View Details
                                                    </Button>
                                                    {canEdit && (
                                                        <Button
                                                            size="sm"
                                                            className="flex-1 text-[12px] h-8 rounded-[8px] bg-[#e8f7f1] text-[#0d6b4a] border border-[rgba(26,158,110,0.3)] hover:bg-[#1a9e6e] hover:text-white px-3"
                                                            onClick={() => openAddMembersDialog(project)}
                                                        >
                                                            <UserPlus className="h-3 w-3 mr-1.5" />
                                                            Add
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
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

            {/* Create Group Dialog */}
            <CreateGroupDialog
                open={createGroupOpen}
                onOpenChange={setCreateGroupOpen}
                companies={companies}
                fetchingCompanies={fetchingCompanies}
                onSuccess={() => {
                    fetchGroups()
                    setCreateGroupOpen(false)
                }}
            />
        </div>
    )
}

// ─── Create Group Dialog ─────────────────────────────────────────────────────

function CreateGroupDialog({
    open,
    onOpenChange,
    companies,
    fetchingCompanies,
    onSuccess,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    companies: Company[]
    fetchingCompanies: boolean
    onSuccess: () => void
}) {
    const [loading, setLoading] = useState(false)
    const [loadingUsers, setLoadingUsers] = useState(false)
    const [availableInspectors, setAvailableInspectors] = useState<AvailableUser[]>([])
    const [availableManagers, setAvailableManagers] = useState<AvailableUser[]>([])

    const [formData, setFormData] = useState({
        name: "",
        companyId: "",
        managerIds: [] as string[],
        inspectorIds: [] as string[]
    })

    useEffect(() => {
        if (open) {
            setFormData({
                name: "",
                companyId: "",
                managerIds: [],
                inspectorIds: []
            })
            fetchUsers()
        }
    }, [open])

    const fetchUsers = async () => {
        setLoadingUsers(true)
        try {
            const [insRes, mgrRes] = await Promise.all([
                fetch("/api/users?role=INSPECTION_BOY"),
                fetch("/api/users?role=MANAGER"),
            ])
            if (insRes.ok) setAvailableInspectors(await insRes.json())
            if (mgrRes.ok) setAvailableManagers(await mgrRes.json())
        } catch {
            toast.error("Failed to load users")
        } finally {
            setLoadingUsers(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.companyId) {
            toast.error("Please select a company")
            return
        }
        setLoading(true)
        try {
            const res = await fetch("/api/groups", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            })
            if (res.ok) {
                toast.success("Group created successfully")
                onSuccess()
            } else {
                const err = await res.json()
                toast.error(err.error || "Failed to create group")
            }
        } catch {
            toast.error("An error occurred")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-white rounded-2xl w-[640px] max-w-[95vw] max-h-[90vh] overflow-y-auto p-7 shadow-[0_20px_60px_rgba(0,0,0,0.12)] border-none [&>button]:hidden">
                <div className="flex items-start justify-between mb-1.5">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <Users className="h-[18px] w-[18px] text-[#1a9e6e]" />
                            <h2 className="text-[17px] font-semibold text-[#1a1a18]">Create New Group</h2>
                        </div>
                        <p className="text-[13px] text-[#6b6860] mt-1 ml-7">Create a new project group and assign team members</p>
                    </div>
                    <button
                        onClick={() => onOpenChange(false)}
                        className="h-[30px] w-[30px] rounded-[8px] bg-[#f9f8f5] border border-[#e8e6e1] text-[#6b6860] text-[16px] cursor-pointer hover:bg-[#fee2e2] hover:text-[#dc2626] hover:border-[#fca5a5] transition-colors flex items-center justify-center"
                    >
                        ✕
                    </button>
                </div>

                <div className="border-t border-[#e8e6e1] my-4" />

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid grid-cols-2 gap-3.5">
                        <div className="space-y-1.5">
                            <label className="text-[12.5px] font-medium text-[#1a1a18]">Company</label>
                            <Select
                                value={formData.companyId}
                                onValueChange={(val) => setFormData({ ...formData, companyId: val })}
                                disabled={fetchingCompanies}
                            >
                                <SelectTrigger className="w-full py-2.5 px-3.5 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#1a1a18] focus:bg-white focus:border-[#1a9e6e] focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)] focus:outline-none data-[placeholder]:text-[#9e9b95]">
                                    <SelectValue placeholder={fetchingCompanies ? "Loading..." : "Select company"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {companies.map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[12.5px] font-medium text-[#1a1a18]">Group Name</label>
                            <Input
                                placeholder="Enter group/project name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="py-2.5 px-3.5 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#1a1a18] placeholder:text-[#9e9b95] focus:bg-white focus:border-[#1a9e6e] focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)] focus:outline-none"
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3.5">
                        <div className="space-y-2.5">
                            <div className="flex items-center gap-1.5 mb-2.5">
                                <Shield className="h-[14px] w-[14px] text-[#6b6860]" />
                                <span className="text-[13px] font-semibold text-[#1a1a18]">Assign Managers</span>
                            </div>
                            <div className="bg-[#f9f8f5] border border-[#e8e6e1] rounded-[10px] overflow-hidden max-h-[220px] overflow-y-auto">
                                {loadingUsers ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="h-5 w-5 animate-spin text-[#9e9b95]" />
                                    </div>
                                ) : availableManagers.length === 0 ? (
                                    <p className="text-[12px] text-[#9e9b95] italic text-center py-4">No managers found</p>
                                ) : (
                                    availableManagers.map((m, idx) => (
                                        <label
                                            key={m.id}
                                            className={`flex items-center gap-2.5 p-[10px] cursor-pointer transition-colors hover:bg-[#f0fdf4] ${idx !== availableManagers.length - 1 ? 'border-b border-[#e8e6e1]' : ''}`}
                                        >
                                            <div className="relative">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.managerIds.includes(m.id)}
                                                    onChange={(e) => {
                                                        const ids = e.target.checked
                                                            ? [...formData.managerIds, m.id]
                                                            : formData.managerIds.filter(id => id !== m.id)
                                                        setFormData({ ...formData, managerIds: ids })
                                                    }}
                                                    className="w-4 h-4 rounded border-[1.5px] border-[#d4d1ca] bg-white appearance-none cursor-pointer checked:bg-[#1a9e6e] checked:border-[#1a9e6e] relative [&:checked:after]:content-['✓'] [&:checked:after]:absolute [&:checked:after]:text-white [&:checked:after]:text-[10px] [&:checked:after]:font-bold [&:checked:after]:left-[2px] [&:checked:after]:top-[0px]"
                                                />
                                            </div>
                                            <div className="h-8 w-8 rounded-full bg-[#e8f7f1] flex items-center justify-center text-[#0d6b4a] font-semibold text-[12px] shrink-0">
                                                {m.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[13px] font-medium text-[#1a1a18] truncate">{m.name}</p>
                                                <p className="text-[11.5px] text-[#9e9b95] mt-0.5">{m.email}</p>
                                            </div>
                                        </label>
                                    ))
                                )}
                            </div>
                        </div>

                        <div className="space-y-2.5">
                            <div className="flex items-center gap-1.5 mb-2.5">
                                <Users className="h-[14px] w-[14px] text-[#6b6860]" />
                                <span className="text-[13px] font-semibold text-[#1a1a18]">Assign Inspectors</span>
                            </div>
                            <div className="bg-[#f9f8f5] border border-[#e8e6e1] rounded-[10px] overflow-hidden max-h-[220px] overflow-y-auto">
                                {loadingUsers ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="h-5 w-5 animate-spin text-[#9e9b95]" />
                                    </div>
                                ) : availableInspectors.length === 0 ? (
                                    <p className="text-[12px] text-[#9e9b95] italic text-center py-4">No inspectors found</p>
                                ) : (
                                    availableInspectors.map((i, idx) => (
                                        <label
                                            key={i.id}
                                            className={`flex items-center gap-2.5 p-[10px] cursor-pointer transition-colors hover:bg-[#f0fdf4] ${idx !== availableInspectors.length - 1 ? 'border-b border-[#e8e6e1]' : ''}`}
                                        >
                                            <div className="relative">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.inspectorIds.includes(i.id)}
                                                    onChange={(e) => {
                                                        const ids = e.target.checked
                                                            ? [...formData.inspectorIds, i.id]
                                                            : formData.inspectorIds.filter(id => id !== i.id)
                                                        setFormData({ ...formData, inspectorIds: ids })
                                                    }}
                                                    className="w-4 h-4 rounded border-[1.5px] border-[#d4d1ca] bg-white appearance-none cursor-pointer checked:bg-[#d97706] checked:border-[#d97706] relative [&:checked:after]:content-['✓'] [&:checked:after]:absolute [&:checked:after]:text-white [&:checked:after]:text-[10px] [&:checked:after]:font-bold [&:checked:after]:left-[2px] [&:checked:after]:top-[0px]"
                                                />
                                            </div>
                                            <div className="h-8 w-8 rounded-full bg-[#fef3c7] flex items-center justify-center text-[#92400e] font-semibold text-[12px] shrink-0">
                                                {i.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[13px] font-medium text-[#1a1a18] truncate">{i.name}</p>
                                                <p className="text-[11.5px] text-[#9e9b95] mt-0.5">{i.email}</p>
                                            </div>
                                        </label>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-[#e8e6e1] pt-5 flex justify-end gap-2.5">
                        <button
                            type="button"
                            onClick={() => onOpenChange(false)}
                            disabled={loading}
                            className="px-6 py-2.5 bg-white border border-[#e8e6e1] text-[#6b6860] rounded-[9px] text-[13px] font-medium hover:bg-[#f9f8f5] hover:text-[#1a1a18] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 py-2.5 bg-[#1a9e6e] text-white border-none rounded-[9px] text-[13px] font-medium hover:bg-[#158a5e] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Creating...
                                </span>
                            ) : (
                                "Create Group"
                            )}
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
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
