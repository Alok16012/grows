"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Loader2, Zap, Check, ChevronDown, Search, Trash2 } from "lucide-react"

export default function AssignmentsPage() {
    const { data: session, status } = useSession()
    const router = useRouter()

    const isManagerOrAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER"

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login")
        } else if (status === "authenticated" && !isManagerOrAdmin && session?.user?.role !== "INSPECTION_BOY") {
            router.push("/client")
        }
    }, [status, session, router, isManagerOrAdmin])

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
    const [selectedGroupId, setSelectedGroupId] = useState("")
    const [recurrenceType, setRecurrenceType] = useState("none")

    const [loading, setLoading] = useState(false)
    const [fetching, setFetching] = useState(true)
    const [filterStatus, setFilterStatus] = useState("all")

    useEffect(() => {
        if (isManagerOrAdmin) {
            fetchInitialData()
            fetchGroups()
        }
    }, [isManagerOrAdmin])

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
        setSelectedGroupId(groupProjectId)
        if (!groupProjectId) return
        for (const company of groups) {
            const project = company.projects?.find((p: any) => p.id === groupProjectId)
            if (project) {
                setSelectedCompanyId(company.id)
                try {
                    const res = await fetch(`/api/projects?companyId=${company.id}`)
                    if (res.ok) {
                        const data = await res.json()
                        if (Array.isArray(data)) setProjects(data)
                    }
                } catch { }
                setSelectedProjectId(groupProjectId)

                if (project.managers) setSelectedManagerIds(project.managers.map((m: any) => m.id))
                if (project.inspectors) setSelectedInspectorIds(project.inspectors.map((i: any) => i.id))
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
                setProjects(Array.isArray(data) ? data : [])
            } else {
                setProjects([])
            }
        } catch (error) {
            console.error("Failed to fetch projects", error)
            setProjects([])
        }
    }

    const handleAssign = async () => {
        if (!selectedProjectId || (selectedInspectorIds.length === 0 && selectedManagerIds.length === 0)) return

        setLoading(true)
        try {
            const res = await fetch("/api/assignments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectId: selectedProjectId,
                    inspectorIds: selectedInspectorIds.length > 0 ? selectedInspectorIds : undefined,
                    managerIds: selectedManagerIds.length > 0 ? selectedManagerIds : undefined,
                    recurrenceType
                })
            })

            if (res.ok) {
                const result = await res.json()
                const assRes = await fetch(`/api/assignments?t=${Date.now()}`)
                const assData = await assRes.json()
                setAssignments(Array.isArray(assData) ? assData : [])
                fetchGroups()

                setSelectedInspectorIds([])
                setSelectedManagerIds([])
                setSelectedProjectId("")
                setSelectedCompanyId("")
                setSelectedGroupId("")
            } else {
                const error = await res.json()
                alert(error.error || "Failed to assign")
            }
        } catch (error) {
            alert("An error occurred")
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this assignment permanently?")) return
        try {
            const res = await fetch(`/api/assignments/${id}`, { method: "DELETE" })
            if (res.ok) {
                setAssignments(assignments.filter(a => a.id !== id))
            } else {
                alert("Failed to delete assignment")
            }
        } catch (error) {
            alert("An error occurred while deleting")
        }
    }

    const filteredAssignments = Array.isArray(assignments) ? assignments.filter(a => {
        if (filterStatus !== "all" && a.status !== filterStatus) return false
        return true
    }) : []

    const handleStopRecurrence = async (id: string) => {
        if (!confirm("Stop auto-recurring for this assignment? No more assignments will be created automatically.")) return
        try {
            const res = await fetch(`/api/assignments/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ recurrenceActive: false })
            })
            if (res.ok) {
                setAssignments(prev => prev.map(a => a.id === id ? { ...a, recurrenceActive: false } : a))
            }
        } catch { }
    }

    const resetForm = () => {
        setSelectedInspectorIds([])
        setSelectedManagerIds([])
        setSelectedProjectId("")
        setSelectedCompanyId("")
        setSelectedGroupId("")
        setRecurrenceType("none")
    }

    if (status === "loading" || fetching) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-[#1a9e6e]" />
            </div>
        )
    }

    if (!isManagerOrAdmin) return null

    return (
        <div className="min-h-screen bg-[#f5f4f0] p-4 lg:p-[24px_28px]">
            <div className="flex justify-between items-center mb-4 lg:mb-[20px]">
                <h1 className="text-[22px] font-[600] tracking-[-0.4px] text-[#1a1a18]">Assignments</h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-[20px] items-start">

                {/* LEFT COLUMN: FORM */}
                <div>
                    {/* CARD 1: QUICK SELECT */}
                    <div className="bg-white border border-[#e8e6e1] bg-white rounded-[14px] p-[18px_20px] mb-[14px]">
                        <div className="flex items-center gap-[8px] mb-[6px]">
                            <Zap className="h-[14px] w-[14px] text-[#d97706]" />
                            <h2 className="text-[13.5px] font-[600] text-[#1a1a18]">Quick Select Existing Group</h2>
                            <span className="bg-[#f9f8f5] border border-[#d4d1ca] text-[#9e9b95] text-[10px] font-[500] px-[8px] py-[2px] rounded-[20px]">Optional</span>
                        </div>
                        <p className="text-[12.5px] text-[#6b6860] mb-[12px]">Select an existing group to auto-fill Company and Project below</p>

                        <div className="relative">
                            <select
                                className="w-full appearance-none bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] p-[10px_14px] text-[13px] text-[#1a1a18] font-[500] outline-none transition-all hover:bg-white focus:border-[#1a9e6e] focus:bg-white cursor-pointer"
                                value={selectedGroupId}
                                onChange={(e) => handleGroupSelect(e.target.value)}
                            >
                                <option value="">— Select a group to auto-fill —</option>
                                {groups.map((company: any) =>
                                    company.projects?.map((project: any) => (
                                        <option key={project.id} value={project.id}>
                                            {company.name} - {project.name}
                                        </option>
                                    ))
                                )}
                            </select>
                            <ChevronDown className="absolute right-[14px] top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-[#9e9b95] pointer-events-none" />
                        </div>
                    </div>

                    <div className="text-center relative my-[14px]">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#e8e6e1]"></div></div>
                        <span className="relative bg-[#f5f4f0] px-[12px] text-[11px] font-[500] text-[#9e9b95] uppercase tracking-[0.5px]">OR</span>
                    </div>

                    {/* CARD 2: NEW ASSIGNMENT */}
                    <div className="bg-white border border-[#e8e6e1] rounded-[14px] p-[22px]">
                        <h2 className="text-[15px] font-[600] text-[#1a1a18] mb-[4px]">New Assignment</h2>
                        <p className="text-[13px] text-[#6b6860] mb-[18px]">Assign members to a specific project.</p>

                        {/* STEP 1 */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-[12px] mb-[18px]">
                            <div>
                                <label className="block text-[12.5px] font-[500] text-[#1a1a18] mb-[6px]">
                                    Select Company <span className="text-[#dc2626]">*</span>
                                </label>
                                <div className="relative">
                                    <select
                                        className="w-full appearance-none bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] p-[10px_14px] text-[13px] text-[#1a1a18] font-[500] outline-none transition-all hover:bg-white focus:border-[#1a9e6e] focus:bg-white cursor-pointer"
                                        value={selectedCompanyId}
                                        onChange={(e) => setSelectedCompanyId(e.target.value)}
                                    >
                                        <option value="">Select Company</option>
                                        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                    <ChevronDown className="absolute right-[14px] top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-[#9e9b95] pointer-events-none" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[12.5px] font-[500] text-[#1a1a18] mb-[6px]">
                                    Select Project <span className="text-[#dc2626]">*</span>
                                </label>
                                <div className="relative">
                                    <select
                                        disabled={!selectedCompanyId}
                                        className="w-full appearance-none bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] p-[10px_14px] text-[13px] text-[#1a1a18] font-[500] outline-none transition-all hover:bg-white focus:border-[#1a9e6e] focus:bg-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                        value={selectedProjectId}
                                        onChange={(e) => setSelectedProjectId(e.target.value)}
                                    >
                                        <option value="">{selectedCompanyId ? "Select Project..." : "Select company first"}</option>
                                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                    <ChevronDown className="absolute right-[14px] top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-[#9e9b95] pointer-events-none" />
                                </div>
                            </div>
                        </div>

                        {/* STEP 2: INSPECTORS */}
                        <div className="mb-[18px]">
                            <div className="flex justify-between items-center mb-[8px]">
                                <label className="text-[12.5px] font-[500] text-[#1a1a18]">Select Inspectors</label>
                                {selectedInspectorIds.length > 0 && (
                                    <span className="bg-[#e8f7f1] text-[#0d6b4a] px-[8px] py-[2px] rounded-[20px] text-[11px] font-[500]">
                                        {selectedInspectorIds.length} selected
                                    </span>
                                )}
                            </div>
                            <div className="bg-[#f9f8f5] border border-[#e8e6e1] rounded-[10px] max-h-[220px] overflow-y-auto">
                                {inspectors.length === 0 ? (
                                    <div className="p-4 text-center text-[12px] text-[#9e9b95]">No inspectors found.</div>
                                ) : (
                                    inspectors.map(inspector => {
                                        const isChecked = selectedInspectorIds.includes(inspector.id)
                                        return (
                                            <label key={inspector.id} className={`flex items-center gap-[10px] p-[10px_14px] border-b border-[#e8e6e1] last:border-0 cursor-pointer transition-colors ${isChecked ? 'bg-[#f0fdf4] border-l-[3px] border-l-[#1a9e6e]' : 'hover:bg-[#e8f7f1] border-l-[3px] border-l-transparent'}`}>
                                                <div className={`flex items-center justify-center w-[16px] h-[16px] rounded-[4px] border-[1.5px] transition-colors ${isChecked ? 'bg-[#1a9e6e] border-[#1a9e6e]' : 'border-[#d4d1ca] bg-white'}`}>
                                                    {isChecked && <Check className="h-[10px] w-[10px] text-white" strokeWidth={3} />}
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    className="hidden"
                                                    checked={isChecked}
                                                    onChange={() => {
                                                        setSelectedInspectorIds(prev =>
                                                            prev.includes(inspector.id) ? prev.filter(id => id !== inspector.id) : [...prev, inspector.id]
                                                        )
                                                    }}
                                                />
                                                <div className="flex items-center justify-center w-[28px] h-[28px] rounded-full bg-[#fef3c7] text-[#92400e] text-[11px] font-[600]">
                                                    {inspector.name?.substring(0, 2).toUpperCase() || "IN"}
                                                </div>
                                                <div className="flex items-center gap-[4px]">
                                                    <span className="text-[13px] font-[500] text-[#1a1a18]">{inspector.name}</span>
                                                    <span className="text-[12px] text-[#9e9b95]">({inspector.email})</span>
                                                </div>
                                            </label>
                                        )
                                    })
                                )}
                            </div>
                        </div>

                        {/* STEP 3: MANAGERS */}
                        <div>
                            <div className="flex justify-between items-center mb-[8px]">
                                <label className="text-[12.5px] font-[500] text-[#1a1a18]">Assign Managers <span className="text-[12.5px] font-[400] text-[#9e9b95]">(Optional)</span></label>
                                {selectedManagerIds.length > 0 && (
                                    <span className="bg-[#eff6ff] text-[#1d4ed8] px-[8px] py-[2px] rounded-[20px] text-[11px] font-[500]">
                                        {selectedManagerIds.length} selected
                                    </span>
                                )}
                            </div>
                            <div className="bg-[#f9f8f5] border border-[#e8e6e1] rounded-[10px] max-h-[160px] overflow-y-auto">
                                {managers.length === 0 ? (
                                    <div className="p-4 text-center text-[12px] text-[#9e9b95]">No managers found.</div>
                                ) : (
                                    managers.map(manager => {
                                        const isChecked = selectedManagerIds.includes(manager.id)
                                        return (
                                            <label key={manager.id} className={`flex items-center gap-[10px] p-[10px_14px] border-b border-[#e8e6e1] last:border-0 cursor-pointer transition-colors ${isChecked ? 'bg-[#eff6ff] border-l-[3px] border-l-[#3b82f6]' : 'hover:bg-[#eff6ff] border-l-[3px] border-l-transparent'}`}>
                                                <div className={`flex items-center justify-center w-[16px] h-[16px] rounded-[4px] border-[1.5px] transition-colors ${isChecked ? 'bg-[#3b82f6] border-[#3b82f6]' : 'border-[#d4d1ca] bg-white'}`}>
                                                    {isChecked && <Check className="h-[10px] w-[10px] text-white" strokeWidth={3} />}
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    className="hidden"
                                                    checked={isChecked}
                                                    onChange={() => {
                                                        setSelectedManagerIds(prev =>
                                                            prev.includes(manager.id) ? prev.filter(id => id !== manager.id) : [...prev, manager.id]
                                                        )
                                                    }}
                                                />
                                                <div className="flex items-center justify-center w-[28px] h-[28px] rounded-full bg-[#eff6ff] text-[#1d4ed8] text-[11px] font-[600]">
                                                    {manager.name?.substring(0, 2).toUpperCase() || "MA"}
                                                </div>
                                                <div className="flex items-center gap-[4px]">
                                                    <span className="text-[13px] font-[500] text-[#1a1a18]">{manager.name}</span>
                                                    <span className="text-[12px] text-[#9e9b95]">({manager.email})</span>
                                                </div>
                                            </label>
                                        )
                                    })
                                )}
                            </div>
                        </div>

                        {/* STEP 4: RECURRENCE */}
                        <div className="mt-[18px]">
                            <label className="block text-[12.5px] font-[500] text-[#1a1a18] mb-[8px]">
                                Assignment Type
                            </label>
                            <div className="flex gap-[8px]">
                                {[
                                    { value: "none", label: "One-time", icon: "📋" },
                                    { value: "daily", label: "Daily", icon: "📅" },
                                    { value: "weekly", label: "Weekly", icon: "🗓️" }
                                ].map(opt => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setRecurrenceType(opt.value)}
                                        className={`flex-1 flex flex-col items-center gap-[4px] p-[10px_8px] rounded-[10px] border-[1.5px] transition-all text-[12px] font-[500] ${recurrenceType === opt.value
                                                ? opt.value === "none"
                                                    ? "border-[#1a9e6e] bg-[#f0fdf4] text-[#0d6b4a]"
                                                    : "border-[#3b82f6] bg-[#eff6ff] text-[#1d4ed8]"
                                                : "border-[#e8e6e1] bg-[#f9f8f5] text-[#6b6860] hover:bg-white"
                                            }`}
                                    >
                                        <span className="text-[16px]">{opt.icon}</span>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                            {recurrenceType !== "none" && (
                                <p className="text-[11.5px] text-[#3b82f6] mt-[6px] bg-[#eff6ff] px-[10px] py-[6px] rounded-[7px]">
                                    After each inspection is approved, a new assignment will be auto-created {recurrenceType === "daily" ? "daily" : "weekly"}.
                                    Manager can stop this anytime.
                                </p>
                            )}
                        </div>

                        {/* ACTIONS */}
                        <div className="flex justify-end gap-[10px] mt-[18px] pt-[14px] border-t border-[#e8e6e1]">
                            <button
                                onClick={resetForm}
                                className="bg-white border border-[#e8e6e1] text-[#6b6860] rounded-[9px] text-[13px] font-[500] px-[16px] py-[8px] hover:bg-[#f9f8f5] transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAssign}
                                disabled={loading || !selectedCompanyId || !selectedProjectId || (selectedInspectorIds.length === 0 && selectedManagerIds.length === 0)}
                                className="bg-[#1a9e6e] text-white rounded-[9px] text-[13px] font-[500] px-[16px] py-[8px] hover:bg-[#158a5e] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
                            >
                                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                                Create Assignment
                            </button>
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: TABLE */}
                <div className="bg-white border border-[#e8e6e1] rounded-[14px] overflow-hidden lg:sticky lg:top-[24px]">
                    <div className="p-[14px_18px] border-b border-[#e8e6e1] flex justify-between items-center bg-white z-20">
                        <h2 className="text-[13.5px] font-[600] text-[#1a1a18]">Assignments</h2>
                        <div className="relative">
                            <select
                                className="w-[120px] appearance-none bg-[#f9f8f5] border border-[#e8e6e1] rounded-[8px] p-[6px_12px] text-[12px] text-[#1a1a18] font-[500] outline-none transition-all hover:bg-white focus:border-[#1a9e6e] cursor-pointer"
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                            >
                                <option value="all">All Status</option>
                                <option value="active">Active</option>
                                <option value="pending">Pending</option>
                                <option value="manager_only">Manager Only</option>
                            </select>
                            <ChevronDown className="absolute right-[10px] top-1/2 -translate-y-1/2 h-[12px] w-[12px] text-[#9e9b95] pointer-events-none" />
                        </div>
                    </div>

                    <div className="overflow-x-auto lg:max-h-[calc(100vh-140px)] overflow-y-auto">
                        {filteredAssignments.length === 0 ? (
                            <div className="p-[30px] text-center text-[13px] text-[#9e9b95]">
                                No assignments found.
                            </div>
                        ) : (
                            <>
                                {/* Mobile Card View */}
                                <div className="lg:hidden divide-y divide-[#e8e6e1]">
                                    {filteredAssignments.map((a: any) => {
                                        let statusBadge = { label: "Inactive", classes: "bg-[#f9f8f5] border border-[#e8e6e1] text-[#9e9b95]" }
                                        const displayStatus = a.status || ""
                                        if (displayStatus === "active") statusBadge = { label: "Active", classes: "bg-[#e8f7f1] text-[#0d6b4a]" }
                                        else if (displayStatus === "pending") statusBadge = { label: "Pending", classes: "bg-[#fef3c7] text-[#d97706]" }
                                        else if (displayStatus === "manager_only") statusBadge = { label: "Manager Only", classes: "bg-[#eff6ff] text-[#1d4ed8]" }
                                        return (
                                            <div key={a.id} className="p-[14px_16px] hover:bg-[#f9f8f5] transition-colors">
                                                <div className="flex items-start justify-between gap-2 mb-2">
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-[13.5px] font-[600] text-[#1a1a18] truncate">{a.inspectionBoy?.name || "System"}</p>
                                                        <p className="text-[12px] text-[#6b6860] font-[500] truncate">{a.project?.name || "Unknown"}</p>
                                                        <p className="text-[11px] text-[#9e9b95] truncate">{a.project?.company?.name || "Unknown"}</p>
                                                    </div>
                                                    <span className={`shrink-0 inline-flex items-center px-[10px] py-[3px] rounded-[20px] text-[11px] font-[500] ${statusBadge.classes}`}>
                                                        {statusBadge.label}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between mt-[8px]">
                                                    <div>
                                                        {a.recurrenceType && a.recurrenceType !== "none" ? (
                                                            <span className={`inline-flex items-center gap-[4px] px-[8px] py-[3px] rounded-[20px] text-[11px] font-[500] ${a.recurrenceActive ? "bg-[#eff6ff] text-[#1d4ed8]" : "bg-[#f9f8f5] text-[#9e9b95] line-through"}`}>
                                                                {a.recurrenceType === "daily" ? "📅 Daily" : "🗓️ Weekly"}
                                                                {!a.recurrenceActive && " (stopped)"}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[11px] text-[#9e9b95]">One-time</span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-[6px]">
                                                        {a.recurrenceType && a.recurrenceType !== "none" && a.recurrenceActive && (
                                                            <button onClick={() => handleStopRecurrence(a.id)} className="h-[28px] px-[10px] inline-flex items-center justify-center rounded-[7px] text-[11px] font-[500] text-[#d97706] bg-[#fef3c7] hover:bg-[#fde68a] transition-colors">Stop</button>
                                                        )}
                                                        <button onClick={() => handleDelete(a.id)} title="Delete" className="w-[28px] h-[28px] inline-flex items-center justify-center rounded-[7px] text-[#9e9b95] hover:bg-[#fef2f2] hover:text-[#dc2626] transition-colors">
                                                            <Trash2 className="h-[14px] w-[14px]" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                                {/* Desktop Table View */}
                                <table className="w-full text-left border-collapse hidden lg:table">
                                    <thead className="sticky top-0 z-10 bg-[#f9f8f5]">
                                        <tr className="border-b border-[#e8e6e1]">
                                            <th className="p-[10px_16px] text-[11px] font-[500] text-[#9e9b95] uppercase tracking-[0.5px]">Inspector</th>
                                            <th className="p-[10px_16px] text-[11px] font-[500] text-[#9e9b95] uppercase tracking-[0.5px]">Project</th>
                                            <th className="p-[10px_16px] text-[11px] font-[500] text-[#9e9b95] uppercase tracking-[0.5px]">Company</th>
                                            <th className="p-[10px_16px] text-[11px] font-[500] text-[#9e9b95] uppercase tracking-[0.5px]">Status</th>
                                            <th className="p-[10px_16px] text-[11px] font-[500] text-[#9e9b95] uppercase tracking-[0.5px]">Recurrence</th>
                                            <th className="p-[10px_16px] text-right text-[11px] font-[500] text-[#9e9b95] uppercase tracking-[0.5px]">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredAssignments.map((a: any) => {
                                            let statusBadge = { label: "Inactive", classes: "bg-[#f9f8f5] border border-[#e8e6e1] text-[#9e9b95]" }
                                            let displayStatus = a.status || ""

                                            if (displayStatus === "active") {
                                                statusBadge = { label: "Active", classes: "bg-[#e8f7f1] text-[#0d6b4a]" }
                                            } else if (displayStatus === "pending") {
                                                statusBadge = { label: "Pending", classes: "bg-[#fef3c7] text-[#d97706]" }
                                            } else if (displayStatus === "manager_only") {
                                                statusBadge = { label: "Manager Only", classes: "bg-[#eff6ff] text-[#1d4ed8]" }
                                            }

                                            return (
                                                <tr key={a.id} className="border-b border-[#e8e6e1] last:border-b-0 hover:bg-[#f9f8f5] transition-colors">
                                                    <td className="p-[12px_16px]">
                                                        <div className="text-[13px] font-[500] text-[#1a1a18] mb-[1px]">{a.inspectionBoy?.name || "System"}</div>
                                                        <div className="text-[11.5px] text-[#9e9b95]">{a.manager ? "Manager" : "Inspector Role"}</div>
                                                    </td>
                                                    <td className="p-[12px_16px] text-[13px] text-[#6b6860] font-[500]">{a.project?.name || "Unknown"}</td>
                                                    <td className="p-[12px_16px] text-[13px] text-[#6b6860]">{a.project?.company?.name || "Unknown"}</td>
                                                    <td className="p-[12px_16px]">
                                                        <span className={`inline-flex items-center px-[12px] py-[3px] rounded-[20px] text-[11.5px] font-[500] ${statusBadge.classes}`}>{statusBadge.label}</span>
                                                    </td>
                                                    <td className="p-[12px_16px]">
                                                        {a.recurrenceType && a.recurrenceType !== "none" ? (
                                                            <span className={`inline-flex items-center gap-[4px] px-[8px] py-[3px] rounded-[20px] text-[11px] font-[500] ${a.recurrenceActive ? "bg-[#eff6ff] text-[#1d4ed8]" : "bg-[#f9f8f5] text-[#9e9b95] line-through"}`}>
                                                                {a.recurrenceType === "daily" ? "📅 Daily" : "🗓️ Weekly"}
                                                                {!a.recurrenceActive && " (stopped)"}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[11px] text-[#9e9b95]">One-time</span>
                                                        )}
                                                    </td>
                                                    <td className="p-[12px_16px] text-right">
                                                        <div className="flex items-center justify-end gap-[4px]">
                                                            {a.recurrenceType && a.recurrenceType !== "none" && a.recurrenceActive && (
                                                                <button onClick={() => handleStopRecurrence(a.id)} title="Stop Recurrence" className="h-[26px] px-[8px] inline-flex items-center justify-center rounded-[7px] text-[11px] font-[500] text-[#d97706] bg-[#fef3c7] hover:bg-[#fde68a] transition-colors">Stop</button>
                                                            )}
                                                            <button onClick={() => handleDelete(a.id)} title="Delete Assignment" className="w-[28px] h-[28px] inline-flex items-center justify-center rounded-[7px] text-[#9e9b95] hover:bg-[#fef2f2] hover:text-[#dc2626] transition-colors">
                                                                <Trash2 className="h-[14px] w-[14px]" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </>
                        )}
                    </div>
                </div>

            </div>
        </div>
    )
}
