
"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Search, Loader2, Calendar, User, Briefcase, Building2, Trash2, Users, Zap } from "lucide-react"

export default function AssignmentsPage() {
    const { data: session, status } = useSession()
    const router = useRouter()

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login")
        } else if (status === "authenticated" && session?.user?.role !== "ADMIN" && session?.user?.role !== "MANAGER") {
            router.push("/client")
        }
    }, [status, session, router])

    const [companies, setCompanies] = useState<any[]>([])
    const [projects, setProjects] = useState<any[]>([])
    const [inspectors, setInspectors] = useState<any[]>([])
    const [managers, setManagers] = useState<any[]>([])
    const [assignments, setAssignments] = useState<any[]>([])
    const [groups, setGroups] = useState<any[]>([])

    const [selectedCompanyId, setSelectedCompanyId] = useState("")
    const [selectedProjectId, setSelectedProjectId] = useState("")
    const [selectedInspectorIds, setSelectedInspectorIds] = useState<string[]>([])
    const [selectedManagerIds, setSelectedManagerIds] = useState<string[]>([])

    const [loading, setLoading] = useState(false)
    const [fetching, setFetching] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
    const [filterStatus, setFilterStatus] = useState("all")

    useEffect(() => {
        fetchInitialData()
        fetchGroups()
    }, [])

    useEffect(() => {
        if (selectedCompanyId) {
            fetchProjects(selectedCompanyId)
        } else {
            setProjects([])
            setSelectedProjectId("")
        }
    }, [selectedCompanyId])

    const fetchGroups = async () => {
        try {
            const res = await fetch("/api/groups")
            if (res.ok) setGroups(await res.json())
        } catch (error) {
            console.error("Failed to fetch groups", error)
        }
    }

    const handleGroupSelect = async (groupProjectId: string) => {
        if (!groupProjectId) return
        // Find company by searching groups
        for (const company of groups) {
            const project = company.projects?.find((p: any) => p.id === groupProjectId)
            if (project) {
                setSelectedCompanyId(company.id)
                // fetch projects for that company first
                try {
                    const res = await fetch(`/api/projects?companyId=${company.id}`)
                    if (res.ok) {
                        const data = await res.json()
                        if (Array.isArray(data)) setProjects(data)
                    }
                } catch { }
                setSelectedProjectId(groupProjectId)
                break
            }
        }
    }

    const fetchInitialData = async () => {
        setFetching(true)
        try {
            const [compRes, insRes, mgrRes, assRes] = await Promise.all([
                fetch("/api/companies"),
                fetch("/api/users?role=INSPECTION_BOY"),
                fetch("/api/users?role=MANAGER"),
                fetch(`/api/assignments?t=${Date.now()}`)
            ])

            if (compRes.ok) setCompanies(await compRes.json())
            if (insRes.ok) setInspectors(await insRes.json())
            if (mgrRes.ok) setManagers(await mgrRes.json())
            if (assRes.ok) {
                const data = await assRes.json()
                setAssignments(Array.isArray(data) ? data : [])
            }
        } catch (error) {
            console.error("Failed to fetch data", error)
            setAssignments([])
        } finally {
            setFetching(false)
        }
    }

    const fetchProjects = async (companyId: string) => {
        try {
            const res = await fetch(`/api/projects?companyId=${companyId}`)
            if (res.ok) {
                const data = await res.json()
                if (Array.isArray(data)) {
                    setProjects(data)
                } else {
                    setProjects([])
                }
            } else {
                setProjects([])
            }
        } catch (error) {
            console.error("Failed to fetch projects", error)
            setProjects([])
        }
    }

    const handleAssign = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedProjectId || (selectedInspectorIds.length === 0 && selectedManagerIds.length === 0)) return

        setLoading(true)
        try {
            const res = await fetch("/api/assignments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectId: selectedProjectId,
                    inspectorIds: selectedInspectorIds.length > 0 ? selectedInspectorIds : undefined,
                    managerIds: selectedManagerIds.length > 0 ? selectedManagerIds : undefined
                })
            })

            if (res.ok) {
                const result = await res.json()

                // Refresh list and groups
                const assRes = await fetch(`/api/assignments?t=${Date.now()}`)
                const assData = await assRes.json()
                setAssignments(Array.isArray(assData) ? assData : [])
                fetchGroups() // Also update the group dropdown data

                // Reset form
                setSelectedInspectorIds([])
                setSelectedManagerIds([])
                setSelectedProjectId("")
                setSelectedCompanyId("")

                // Show results
                const createdCount = result.created?.length || 0
                const failedCount = result.failed?.length || 0
                const managerAssigned = selectedManagerIds.length > 0

                if (failedCount > 0) {
                    alert(`${createdCount} inspector(s) assigned. ${failedCount} failed (duplicates). ${managerAssigned ? 'Managers also assigned.' : ''}`)
                } else if (createdCount > 0 || managerAssigned) {
                    alert(`${createdCount > 0 ? createdCount + ' inspector(s)' : ''} ${managerAssigned ? (createdCount > 0 ? 'and ' : '') + selectedManagerIds.length + ' manager(s)' : ''} assigned successfully!`)
                }
            } else {
                const error = await res.json()
                alert(error.error + (error.details ? ": " + error.details : "") || "Failed to assign")
            }
        } catch (error) {
            alert("An error occurred")
        } finally {
            setLoading(false)
        }
    }

    const handleCancel = async (id: string) => {
        if (!confirm("Are you sure you want to cancel this assignment?")) return

        try {
            const res = await fetch(`/api/assignments/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "cancelled" })
            })

            if (res.ok) {
                setAssignments(assignments.map(a => a.id === id ? { ...a, status: "cancelled" } : a))
            }
        } catch (error) {
            alert("Failed to cancel assignment")
        }
    }

    const filteredAssignments = Array.isArray(assignments) ? assignments.filter(a => {
        const matchesSearch =
            a.project?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            a.inspectionBoy?.name?.toLowerCase().includes(searchTerm.toLowerCase())

        const matchesStatus = filterStatus === "all" || a.status === filterStatus

        return matchesSearch && matchesStatus
    }) : []

    const getStatusColor = (status: string) => {
        switch (status) {
            case "active": return "bg-green-100 text-green-800 border-green-200"
            case "completed": return "bg-gray-100 text-gray-800 border-gray-200"
            case "cancelled": return "bg-red-100 text-red-800 border-red-200"
            default: return "bg-blue-100 text-blue-800 border-blue-200"
        }
    }

    if (status === "loading" || fetching) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (session?.user?.role !== "ADMIN" && session?.user?.role !== "MANAGER") {
        return null // Will redirect in useEffect
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight">Assignments</h1>
            </div>

            {/* Quick Select Group */}
            {groups.length > 0 && (
                <Card className="max-w-4xl border-blue-200 bg-blue-50/30">
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Zap className="h-4 w-4 text-blue-600" />
                            Quick Select Existing Group
                        </CardTitle>
                        <CardDescription>
                            Select an existing group to auto-fill Company and Project below
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            defaultValue=""
                            onChange={(e) => handleGroupSelect(e.target.value)}
                        >
                            <option value="">— Select a group to auto-fill —</option>
                            {groups.map((company: any) =>
                                company.projects?.map((project: any) => (
                                    <option key={project.id} value={project.id}>
                                        {company.name} → {project.name} ({project.inspectors?.length ?? 0} inspectors)
                                    </option>
                                ))
                            )}
                        </select>
                    </CardContent>
                </Card>
            )}

            {/* Create Assignment Form */}
            <Card className="max-w-4xl">
                <CardHeader>
                    <CardTitle>New Assignment</CardTitle>
                    <CardDescription>Assign an inspector to a specific project.</CardDescription>
                </CardHeader>
                <form onSubmit={handleAssign}>
                    <CardContent className="grid gap-6 md:grid-cols-3">
                        <div className="space-y-2">
                            <Label htmlFor="company">Select Company</Label>
                            <select
                                id="company"
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                value={selectedCompanyId}
                                onChange={(e) => setSelectedCompanyId(e.target.value)}
                                required
                            >
                                <option value="">Select Company</option>
                                {companies.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="project">Select Project</Label>
                            <select
                                id="project"
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                value={selectedProjectId}
                                onChange={(e) => setSelectedProjectId(e.target.value)}
                                disabled={!selectedCompanyId}
                                required
                            >
                                <option value="">Select Project</option>
                                {projects.map((p) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                    </CardContent>
                    <CardContent className="grid gap-6">
                        <div className="space-y-2">
                            <Label>Select Inspectors</Label>
                            <div className="border rounded-md max-h-48 overflow-y-auto p-3 space-y-2 bg-muted/20">
                                {inspectors.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No inspectors available</p>
                                ) : (
                                    inspectors.map((i) => (
                                        <label key={i.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded">
                                            <input
                                                type="checkbox"
                                                checked={selectedInspectorIds.includes(i.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedInspectorIds([...selectedInspectorIds, i.id])
                                                    } else {
                                                        setSelectedInspectorIds(selectedInspectorIds.filter(id => id !== i.id))
                                                    }
                                                }}
                                                className="rounded border-gray-300"
                                            />
                                            <span className="text-sm">{i.name}</span>
                                            <span className="text-xs text-muted-foreground">({i.email})</span>
                                        </label>
                                    ))
                                )}
                            </div>
                            {selectedInspectorIds.length > 0 && (
                                <p className="text-xs text-muted-foreground">{selectedInspectorIds.length} inspector(s) selected</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label>Assign Managers (Optional - Multiple)</Label>
                            <div className="border rounded-md max-h-48 overflow-y-auto p-3 space-y-2 bg-muted/20">
                                {managers.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No managers available</p>
                                ) : (
                                    managers.map((m) => (
                                        <label key={m.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded">
                                            <input
                                                type="checkbox"
                                                checked={selectedManagerIds.includes(m.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedManagerIds([...selectedManagerIds, m.id])
                                                    } else {
                                                        setSelectedManagerIds(selectedManagerIds.filter(id => id !== m.id))
                                                    }
                                                }}
                                                className="rounded border-gray-300"
                                            />
                                            <span className="text-sm">{m.name}</span>
                                            <span className="text-xs text-muted-foreground">({m.email})</span>
                                        </label>
                                    ))
                                )}
                            </div>
                            {selectedManagerIds.length > 0 && (
                                <p className="text-xs text-muted-foreground">{selectedManagerIds.length} manager(s) selected</p>
                            )}
                        </div>
                    </CardContent>
                    <CardFooter className="justify-end border-t p-4">
                        <Button type="submit" disabled={loading || !selectedProjectId || (selectedInspectorIds.length === 0 && selectedManagerIds.length === 0)}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Assign {selectedInspectorIds.length > 0 ? `${selectedInspectorIds.length} Inspector${selectedInspectorIds.length > 1 ? 's' : ''}` : ''}
                            {selectedInspectorIds.length > 0 && selectedManagerIds.length > 0 ? ' + ' : ''}
                            {selectedManagerIds.length > 0 ? `${selectedManagerIds.length} Manager${selectedManagerIds.length > 1 ? 's' : ''}` : ''}
                            {selectedInspectorIds.length === 0 && selectedManagerIds.length === 0 ? 'Members' : ''}
                        </Button>
                    </CardFooter>
                </form>
            </Card>

            {/* Assignments List */}
            <div className="space-y-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
                        {["all", "active", "completed", "cancelled"].map((status) => (
                            <Button
                                key={status}
                                variant={filterStatus === status ? "default" : "outline"}
                                size="sm"
                                onClick={() => setFilterStatus(status)}
                                className="capitalize"
                            >
                                {status}
                            </Button>
                        ))}
                    </div>
                    <div className="relative w-full max-w-sm">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by inspector or project..."
                            className="pl-8"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="rounded-md border bg-card">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-muted/50 text-left font-medium">
                                    <th className="p-4">Company Name</th>
                                    <th className="p-4">Project Name</th>
                                    <th className="p-4">Manager</th>
                                    <th className="p-4">Inspector Name</th>
                                    <th className="p-4">Assigned By</th>
                                    <th className="p-4">Date Assigned</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredAssignments.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="p-8 text-center text-muted-foreground">
                                            No assignments found.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredAssignments.map((assignment) => (
                                        <tr key={assignment.id} className="hover:bg-muted/50 transition-colors">
                                            <td className="p-4 flex items-center gap-2">
                                                <Building2 className="h-4 w-4 text-muted-foreground" />
                                                {assignment.project.company.name}
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2 font-medium">
                                                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                                                    {assignment.project.name}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                {assignment.project.managers?.length > 0 ? (
                                                    <div className="flex flex-col gap-1">
                                                        {assignment.project.managers.map((m: any) => (
                                                            <Badge key={m.id} variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs w-fit">
                                                                {m.name}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground text-xs">No manager</span>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <User className="h-4 w-4 text-muted-foreground" />
                                                    {assignment.inspectionBoy?.name || "Pending Inspector"}
                                                </div>
                                            </td>
                                            <td className="p-4 text-muted-foreground">
                                                {assignment.assigner?.name || "System"}
                                            </td>
                                            <td className="p-4 text-muted-foreground">
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="h-4 w-4" />
                                                    {new Date(assignment.createdAt).toLocaleDateString()}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <Badge
                                                    variant="secondary"
                                                    className={
                                                        assignment.status === "active"
                                                            ? "bg-green-50 text-green-700 border-green-100"
                                                            : assignment.status === "manager_only"
                                                                ? "bg-blue-50 text-blue-700 border-blue-100"
                                                                : "bg-amber-50 text-amber-700 border-amber-100"
                                                    }
                                                >
                                                    {assignment.status === "manager_only" ? "Manager Assigned" : assignment.status.charAt(0).toUpperCase() + assignment.status.slice(1)}
                                                </Badge>
                                            </td>
                                            <td className="p-4 text-right">
                                                {assignment.status === "active" && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                        onClick={() => handleCancel(assignment.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4 mr-1" />
                                                        Cancel
                                                    </Button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    )
}
