"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Loader2, Check, ChevronDown, ChevronLeft, Search, Trash2 } from "lucide-react"
import { can } from "@/lib/can"

export default function AssignmentsPage() {
    const { data: session, status } = useSession()
    const router = useRouter()

    const [mounted, setMounted] = useState(false)
    const isManagerOrAdmin = can(session, "assignments.view")

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        if (!mounted) return
        if (status === "unauthenticated") {
            router.push("/login")
        } else if (status === "authenticated" && !isManagerOrAdmin) {
            router.push(session?.user?.role === "INSPECTION_BOY" ? "/inspection" : "/client")
        }
    }, [status, session, router, isManagerOrAdmin, mounted])

    const [sites, setSites] = useState<any[]>([])
    const [projects, setProjects] = useState<any[]>([])
    const [inspectors, setInspectors] = useState<any[]>([])
    const [managers, setManagers] = useState<any[]>([])
    const [assignments, setAssignments] = useState<any[]>([])

    // Site is the real HR Site (workforce site). Access is granted either to the
    // whole Site (all its projects, future ones auto-included) or to specific
    // projects under it.
    const [selectedSiteId, setSelectedSiteId] = useState("")
    const [wholeSite, setWholeSite] = useState(false)
    const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([])
    const [selectedInspectorIds, setSelectedInspectorIds] = useState<string[]>([])
    const [selectedManagerIds, setSelectedManagerIds] = useState<string[]>([])
    const [recurrenceType, setRecurrenceType] = useState("none")
    // Step-wise wizard for the New Assignment form
    const [wizardStep, setWizardStep] = useState(0)

    const [loading, setLoading] = useState(false)
    const [fetching, setFetching] = useState(true)
    const [filterStatus, setFilterStatus] = useState("all")
    // Search boxes for the selection lists + the assignments table
    const [inspectorSearch, setInspectorSearch] = useState("")
    const [managerSearch, setManagerSearch] = useState("")
    const [assignmentSearch, setAssignmentSearch] = useState("")

    useEffect(() => {
        if (mounted && isManagerOrAdmin) {
            fetchInitialData()
        }
    }, [isManagerOrAdmin, mounted])

    useEffect(() => {
        if (selectedSiteId) {
            fetchProjects(selectedSiteId)
        } else {
            setProjects([])
        }
        // Changing Site resets the project selection & access mode.
        setSelectedProjectIds([])
        setWholeSite(false)
    }, [selectedSiteId])

    // Auto-fill inspectors & managers from the chosen projects' existing members.
    // Runs only when the project selection (or access mode / project list) changes,
    // so it seeds the defaults without fighting the user's manual edits on later steps.
    useEffect(() => {
        const sourceProjects = wholeSite
            ? projects
            : projects.filter(p => selectedProjectIds.includes(p.id))
        if (sourceProjects.length === 0) return

        const mgr = new Set<string>()
        const ins = new Set<string>()
        sourceProjects.forEach(p => {
            (p.managerIds || []).forEach((id: string) => mgr.add(id))
            ;(p.inspectorIds || []).forEach((id: string) => ins.add(id))
        })
        setSelectedManagerIds(Array.from(mgr))
        setSelectedInspectorIds(Array.from(ins))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedProjectIds, wholeSite, projects])

    const fetchInitialData = async () => {
        setFetching(true)
        try {
            const [siteRes, insRes, mgrRes, assRes] = await Promise.all([
                fetch("/api/sites?isActive=true"),
                fetch("/api/users?role=INSPECTION_BOY"),
                fetch("/api/users?role=MANAGER"),
                fetch(`/api/assignments?t=${Date.now()}`)
            ])

            if (siteRes.ok) setSites(await siteRes.json())
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

    const fetchProjects = async (siteId: string) => {
        try {
            const res = await fetch(`/api/projects?siteId=${siteId}`)
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
        const hasProjects = wholeSite ? !!selectedSiteId : selectedProjectIds.length > 0
        if (!hasProjects || (selectedInspectorIds.length === 0 && selectedManagerIds.length === 0)) return

        setLoading(true)
        try {
            const res = await fetch("/api/assignments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    siteId: selectedSiteId,
                    wholeSite,
                    projectIds: wholeSite ? undefined : selectedProjectIds,
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

                setSelectedInspectorIds([])
                setSelectedManagerIds([])
                setSelectedProjectIds([])
                setWholeSite(false)
                setSelectedSiteId("")
                setRecurrenceType("none")
                setWizardStep(0)
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

    // Filtered selection lists (search by name or email)
    const insMatch = inspectorSearch.trim().toLowerCase()
    const filteredInspectors = insMatch
        ? inspectors.filter(i =>
            (i.name || "").toLowerCase().includes(insMatch) ||
            (i.email || "").toLowerCase().includes(insMatch))
        : inspectors
    const mgrMatch = managerSearch.trim().toLowerCase()
    const filteredManagers = mgrMatch
        ? managers.filter(m =>
            (m.name || "").toLowerCase().includes(mgrMatch) ||
            (m.email || "").toLowerCase().includes(mgrMatch))
        : managers

    const asgMatch = assignmentSearch.trim().toLowerCase()
    const filteredAssignments = Array.isArray(assignments) ? assignments.filter(a => {
        if (filterStatus !== "all" && a.status !== filterStatus) return false
        if (asgMatch) {
            const hay = [
                a.inspectionBoy?.name,
                a.project?.name,
                a.project?.site?.name,
                a.project?.company?.name,
            ].filter(Boolean).join(" ").toLowerCase()
            if (!hay.includes(asgMatch)) return false
        }
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
        setSelectedProjectIds([])
        setWholeSite(false)
        setSelectedSiteId("")
        setRecurrenceType("none")
        setWizardStep(0)
    }

    // ── Step-wise wizard for the New Assignment form ──
    const wizardSteps = [
        { key: "site", label: "Site & Access" },
        { key: "inspectors", label: "Inspectors" },
        { key: "managers", label: "Managers" },
        { key: "review", label: "Type & Review" },
    ]
    // Step 0 needs a Site and either "whole site" or at least one project ticked.
    const hasProjectAccess = wholeSite ? !!selectedSiteId : selectedProjectIds.length > 0
    const canLeaveStep0 = !!selectedSiteId && hasProjectAccess
    const handleWizardNext = () => {
        if (wizardStep === 0 && !canLeaveStep0) return
        setWizardStep(s => Math.min(s + 1, wizardSteps.length - 1))
    }
    const handleWizardBack = () => setWizardStep(s => Math.max(s - 1, 0))
    const goToWizardStep = (target: number) => {
        if (target === wizardStep) return
        if (target < wizardStep) { setWizardStep(target); return }
        // moving forward always requires a Site + project access first
        if (canLeaveStep0) setWizardStep(target)
    }
    const selectedSite = sites.find(s => s.id === selectedSiteId)
    const selectedProjectsList = projects.filter(p => selectedProjectIds.includes(p.id))
    const selectedInspectors = inspectors.filter(i => selectedInspectorIds.includes(i.id))
    const selectedManagers = managers.filter(m => selectedManagerIds.includes(m.id))
    const toggleProject = (id: string) => {
        setSelectedProjectIds(prev =>
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
        )
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
                    {/* NEW ASSIGNMENT */}
                    <div className="bg-white border border-[#e8e6e1] rounded-[14px] p-[22px]">
                        <h2 className="text-[15px] font-[600] text-[#1a1a18] mb-[4px]">New Assignment</h2>
                        <p className="text-[13px] text-[#6b6860] mb-[16px]">Pick a Site, then grant access to all its projects or specific ones.</p>

                        {/* STEPPER RAIL */}
                        <div className="mb-[20px]">
                            <div className="flex items-center justify-between mb-[10px]">
                                <span className="text-[12px] font-[600] text-[#1a1a18]">
                                    Step {wizardStep + 1} of {wizardSteps.length} — {wizardSteps[wizardStep].label}
                                </span>
                                <span className="text-[11px] font-[500] text-[#9e9b95]">
                                    {Math.round((wizardStep / (wizardSteps.length - 1)) * 100)}%
                                </span>
                            </div>
                            <div className="flex items-center">
                                {wizardSteps.map((s, i) => {
                                    const isDone = i < wizardStep
                                    const isActive = i === wizardStep
                                    return (
                                        <div key={s.key} className="flex items-center flex-1 last:flex-none">
                                            <button
                                                type="button"
                                                onClick={() => goToWizardStep(i)}
                                                className="flex flex-col items-center gap-[5px] shrink-0 focus:outline-none"
                                            >
                                                <span className={`flex items-center justify-center w-[26px] h-[26px] rounded-full text-[12px] font-[700] border-[1.5px] transition-colors ${isActive ? "bg-[#1a9e6e] border-[#1a9e6e] text-white" : isDone ? "bg-[#e8f7f1] border-[#1a9e6e] text-[#0d6b4a]" : "bg-white border-[#e8e6e1] text-[#9e9b95]"}`}>
                                                    {isDone ? <Check className="h-[14px] w-[14px]" strokeWidth={3} /> : i + 1}
                                                </span>
                                                <span className={`text-[10.5px] font-[500] whitespace-nowrap ${isActive ? "text-[#1a1a18]" : "text-[#9e9b95]"}`}>{s.label}</span>
                                            </button>
                                            {i < wizardSteps.length - 1 && (
                                                <span className={`h-[2px] flex-1 mx-[6px] mb-[18px] rounded-full transition-colors ${i < wizardStep ? "bg-[#1a9e6e]" : "bg-[#e8e6e1]"}`} />
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* STEP 1: SITE & ACCESS */}
                        {wizardStep === 0 && (
                        <div className="mb-[18px]">
                            <label className="block text-[12.5px] font-[500] text-[#1a1a18] mb-[6px]">
                                Select Site <span className="text-[#dc2626]">*</span>
                            </label>
                            <div className="relative mb-[16px]">
                                <select
                                    className="w-full appearance-none bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] p-[10px_14px] text-[13px] text-[#1a1a18] font-[500] outline-none transition-all hover:bg-white focus:border-[#1a9e6e] focus:bg-white cursor-pointer"
                                    value={selectedSiteId}
                                    onChange={(e) => setSelectedSiteId(e.target.value)}
                                >
                                    <option value="">Select Site</option>
                                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ""}</option>)}
                                </select>
                                <ChevronDown className="absolute right-[14px] top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-[#9e9b95] pointer-events-none" />
                            </div>

                            {selectedSiteId && (
                                <>
                                    <label className="block text-[12.5px] font-[500] text-[#1a1a18] mb-[8px]">
                                        Access <span className="text-[#dc2626]">*</span>
                                    </label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-[10px] mb-[14px]">
                                        <button
                                            type="button"
                                            onClick={() => { setWholeSite(true); setSelectedProjectIds([]) }}
                                            className={`text-left p-[12px_14px] rounded-[10px] border-[1.5px] transition-all ${wholeSite ? "border-[#1a9e6e] bg-[#f0fdf4]" : "border-[#e8e6e1] bg-[#f9f8f5] hover:bg-white"}`}
                                        >
                                            <div className="flex items-center gap-[6px] mb-[3px]">
                                                <div className={`flex items-center justify-center w-[15px] h-[15px] rounded-full border-[1.5px] ${wholeSite ? "border-[#1a9e6e]" : "border-[#d4d1ca]"}`}>
                                                    {wholeSite && <span className="w-[8px] h-[8px] rounded-full bg-[#1a9e6e]" />}
                                                </div>
                                                <span className="text-[12.5px] font-[600] text-[#1a1a18]">Whole Site</span>
                                            </div>
                                            <span className="text-[11px] text-[#6b6860] leading-tight block">All projects — new ones added later are auto-included.</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setWholeSite(false)}
                                            className={`text-left p-[12px_14px] rounded-[10px] border-[1.5px] transition-all ${!wholeSite ? "border-[#1a9e6e] bg-[#f0fdf4]" : "border-[#e8e6e1] bg-[#f9f8f5] hover:bg-white"}`}
                                        >
                                            <div className="flex items-center gap-[6px] mb-[3px]">
                                                <div className={`flex items-center justify-center w-[15px] h-[15px] rounded-full border-[1.5px] ${!wholeSite ? "border-[#1a9e6e]" : "border-[#d4d1ca]"}`}>
                                                    {!wholeSite && <span className="w-[8px] h-[8px] rounded-full bg-[#1a9e6e]" />}
                                                </div>
                                                <span className="text-[12.5px] font-[600] text-[#1a1a18]">Specific Projects</span>
                                            </div>
                                            <span className="text-[11px] text-[#6b6860] leading-tight block">Pick only the projects to grant access to.</span>
                                        </button>
                                    </div>

                                    {!wholeSite && (
                                        <>
                                            <div className="flex justify-between items-center mb-[8px]">
                                                <label className="text-[12.5px] font-[500] text-[#1a1a18]">Select Projects</label>
                                                {selectedProjectIds.length > 0 && (
                                                    <span className="bg-[#e8f7f1] text-[#0d6b4a] px-[8px] py-[2px] rounded-[20px] text-[11px] font-[500]">
                                                        {selectedProjectIds.length} selected
                                                    </span>
                                                )}
                                            </div>
                                            <div className="bg-[#f9f8f5] border border-[#e8e6e1] rounded-[10px] max-h-[220px] overflow-y-auto">
                                                {projects.length === 0 ? (
                                                    <div className="p-4 text-center text-[12px] text-[#9e9b95]">No projects under this Site.</div>
                                                ) : (
                                                    projects.map(project => {
                                                        const isChecked = selectedProjectIds.includes(project.id)
                                                        return (
                                                            <label key={project.id} className={`flex items-center gap-[10px] p-[10px_14px] border-b border-[#e8e6e1] last:border-0 cursor-pointer transition-colors ${isChecked ? 'bg-[#f0fdf4] border-l-[3px] border-l-[#1a9e6e]' : 'hover:bg-[#e8f7f1] border-l-[3px] border-l-transparent'}`}>
                                                                <div className={`flex items-center justify-center w-[16px] h-[16px] rounded-[4px] border-[1.5px] transition-colors ${isChecked ? 'bg-[#1a9e6e] border-[#1a9e6e]' : 'border-[#d4d1ca] bg-white'}`}>
                                                                    {isChecked && <Check className="h-[10px] w-[10px] text-white" strokeWidth={3} />}
                                                                </div>
                                                                <input type="checkbox" className="hidden" checked={isChecked} onChange={() => toggleProject(project.id)} />
                                                                <span className="text-[13px] font-[500] text-[#1a1a18]">{project.name}</span>
                                                            </label>
                                                        )
                                                    })
                                                )}
                                            </div>
                                        </>
                                    )}

                                    {wholeSite && (
                                        <p className="text-[11.5px] text-[#0d6b4a] bg-[#e8f7f1] px-[10px] py-[8px] rounded-[8px]">
                                            Covers all {projects.length} current project{projects.length === 1 ? "" : "s"} under this Site. Any project added later is automatically included.
                                        </p>
                                    )}
                                </>
                            )}
                        </div>

                        )}

                        {/* STEP 2: INSPECTORS */}
                        {wizardStep === 1 && (
                        <div className="mb-[18px]">
                            <div className="flex justify-between items-center mb-[8px]">
                                <label className="text-[12.5px] font-[500] text-[#1a1a18]">Select Inspectors</label>
                                {selectedInspectorIds.length > 0 && (
                                    <span className="bg-[#e8f7f1] text-[#0d6b4a] px-[8px] py-[2px] rounded-[20px] text-[11px] font-[500]">
                                        {selectedInspectorIds.length} selected
                                    </span>
                                )}
                            </div>
                            <div className="relative mb-[8px]">
                                <Search className="absolute left-[10px] top-1/2 -translate-y-1/2 h-[13px] w-[13px] text-[#9e9b95] pointer-events-none" />
                                <input
                                    type="text"
                                    value={inspectorSearch}
                                    onChange={(e) => setInspectorSearch(e.target.value)}
                                    placeholder="Search inspectors by name or email…"
                                    className="w-full bg-[#f9f8f5] border border-[#e8e6e1] rounded-[8px] pl-[30px] pr-[12px] py-[7px] text-[12.5px] text-[#1a1a18] outline-none focus:border-[#1a9e6e] transition-colors"
                                />
                            </div>
                            <div className="bg-[#f9f8f5] border border-[#e8e6e1] rounded-[10px] max-h-[220px] overflow-y-auto">
                                {inspectors.length === 0 ? (
                                    <div className="p-4 text-center text-[12px] text-[#9e9b95]">No inspectors found.</div>
                                ) : filteredInspectors.length === 0 ? (
                                    <div className="p-4 text-center text-[12px] text-[#9e9b95]">No inspectors match “{inspectorSearch}”.</div>
                                ) : (
                                    filteredInspectors.map(inspector => {
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

                        )}

                        {/* STEP 3: MANAGERS */}
                        {wizardStep === 2 && (
                        <div>
                            <div className="flex justify-between items-center mb-[8px]">
                                <label className="text-[12.5px] font-[500] text-[#1a1a18]">Assign Managers <span className="text-[12.5px] font-[400] text-[#9e9b95]">(Optional)</span></label>
                                {selectedManagerIds.length > 0 && (
                                    <span className="bg-[#eff6ff] text-[#1d4ed8] px-[8px] py-[2px] rounded-[20px] text-[11px] font-[500]">
                                        {selectedManagerIds.length} selected
                                    </span>
                                )}
                            </div>
                            <div className="relative mb-[8px]">
                                <Search className="absolute left-[10px] top-1/2 -translate-y-1/2 h-[13px] w-[13px] text-[#9e9b95] pointer-events-none" />
                                <input
                                    type="text"
                                    value={managerSearch}
                                    onChange={(e) => setManagerSearch(e.target.value)}
                                    placeholder="Search managers by name or email…"
                                    className="w-full bg-[#f9f8f5] border border-[#e8e6e1] rounded-[8px] pl-[30px] pr-[12px] py-[7px] text-[12.5px] text-[#1a1a18] outline-none focus:border-[#3b82f6] transition-colors"
                                />
                            </div>
                            <div className="bg-[#f9f8f5] border border-[#e8e6e1] rounded-[10px] max-h-[160px] overflow-y-auto">
                                {managers.length === 0 ? (
                                    <div className="p-4 text-center text-[12px] text-[#9e9b95]">No managers found.</div>
                                ) : filteredManagers.length === 0 ? (
                                    <div className="p-4 text-center text-[12px] text-[#9e9b95]">No managers match “{managerSearch}”.</div>
                                ) : (
                                    filteredManagers.map(manager => {
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

                        )}

                        {/* STEP 4: TYPE & REVIEW */}
                        {wizardStep === 3 && (
                        <>
                        <div>
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

                        {/* REVIEW SUMMARY */}
                        <div className="mt-[18px] bg-[#f9f8f5] border border-[#e8e6e1] rounded-[12px] p-[16px]">
                            <div className="text-[11px] font-[600] text-[#9e9b95] uppercase tracking-[0.5px] mb-[12px]">Review</div>
                            <div className="space-y-[10px]">
                                <div className="flex justify-between items-start gap-[12px]">
                                    <span className="text-[12.5px] text-[#6b6860]">Site</span>
                                    <span className="text-[12.5px] font-[500] text-[#1a1a18] text-right">{selectedSite?.name || <span className="text-[#dc2626]">Not selected</span>}</span>
                                </div>
                                <div className="flex justify-between items-start gap-[12px]">
                                    <span className="text-[12.5px] text-[#6b6860]">Access</span>
                                    <span className="text-[12.5px] font-[500] text-[#1a1a18] text-right">
                                        {wholeSite
                                            ? <span className="text-[#0d6b4a]">Whole Site — all projects (future auto-included)</span>
                                            : selectedProjectsList.length > 0
                                                ? selectedProjectsList.map(p => p.name).join(", ")
                                                : <span className="text-[#dc2626]">No projects selected</span>}
                                    </span>
                                </div>
                                <div className="flex justify-between items-start gap-[12px]">
                                    <span className="text-[12.5px] text-[#6b6860]">Inspectors</span>
                                    <span className="text-[12.5px] font-[500] text-[#1a1a18] text-right">
                                        {selectedInspectors.length > 0 ? selectedInspectors.map(i => i.name).join(", ") : <span className="text-[#9e9b95]">None</span>}
                                    </span>
                                </div>
                                <div className="flex justify-between items-start gap-[12px]">
                                    <span className="text-[12.5px] text-[#6b6860]">Managers</span>
                                    <span className="text-[12.5px] font-[500] text-[#1a1a18] text-right">
                                        {selectedManagers.length > 0 ? selectedManagers.map(m => m.name).join(", ") : <span className="text-[#9e9b95]">None</span>}
                                    </span>
                                </div>
                                <div className="flex justify-between items-start gap-[12px]">
                                    <span className="text-[12.5px] text-[#6b6860]">Type</span>
                                    <span className="text-[12.5px] font-[500] text-[#1a1a18] text-right capitalize">{recurrenceType === "none" ? "One-time" : recurrenceType}</span>
                                </div>
                            </div>
                            {selectedInspectorIds.length === 0 && selectedManagerIds.length === 0 && (
                                <p className="text-[11.5px] text-[#d97706] mt-[12px] bg-[#fef3c7] px-[10px] py-[6px] rounded-[7px]">
                                    Select at least one inspector or manager to create this assignment.
                                </p>
                            )}
                        </div>
                        </>
                        )}

                        {/* WIZARD NAV */}
                        <div className="flex justify-between items-center gap-[10px] mt-[18px] pt-[14px] border-t border-[#e8e6e1]">
                            <button
                                onClick={handleWizardBack}
                                disabled={wizardStep === 0}
                                className="inline-flex items-center gap-[4px] bg-white border border-[#e8e6e1] text-[#6b6860] rounded-[9px] text-[13px] font-[500] px-[14px] py-[8px] hover:bg-[#f9f8f5] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <ChevronLeft className="h-[15px] w-[15px]" />
                                Back
                            </button>
                            <div className="flex gap-[10px]">
                                <button
                                    onClick={resetForm}
                                    className="bg-white border border-[#e8e6e1] text-[#6b6860] rounded-[9px] text-[13px] font-[500] px-[16px] py-[8px] hover:bg-[#f9f8f5] transition-colors"
                                >
                                    Cancel
                                </button>
                                {wizardStep < wizardSteps.length - 1 ? (
                                    <button
                                        onClick={handleWizardNext}
                                        disabled={wizardStep === 0 && !canLeaveStep0}
                                        className="inline-flex items-center gap-[4px] bg-[#1a9e6e] text-white rounded-[9px] text-[13px] font-[500] px-[16px] py-[8px] hover:bg-[#158a5e] transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                                    >
                                        Next
                                        <ChevronLeft className="h-[15px] w-[15px] rotate-180" />
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleAssign}
                                        disabled={loading || !canLeaveStep0 || (selectedInspectorIds.length === 0 && selectedManagerIds.length === 0)}
                                        className="bg-[#1a9e6e] text-white rounded-[9px] text-[13px] font-[500] px-[16px] py-[8px] hover:bg-[#158a5e] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
                                    >
                                        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                                        Create Assignment
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: TABLE */}
                <div className="bg-white border border-[#e8e6e1] rounded-[14px] overflow-hidden lg:sticky lg:top-[24px]">
                    <div className="p-[14px_18px] border-b border-[#e8e6e1] flex justify-between items-center bg-white z-20">
                        <h2 className="text-[13.5px] font-[600] text-[#1a1a18]">Assignments</h2>
                        <div className="flex items-center gap-[8px]">
                        <div className="relative">
                            <Search className="absolute left-[10px] top-1/2 -translate-y-1/2 h-[12px] w-[12px] text-[#9e9b95] pointer-events-none" />
                            <input
                                type="text"
                                value={assignmentSearch}
                                onChange={(e) => setAssignmentSearch(e.target.value)}
                                placeholder="Search inspector, project, site…"
                                className="w-[200px] bg-[#f9f8f5] border border-[#e8e6e1] rounded-[8px] pl-[28px] pr-[10px] py-[6px] text-[12px] text-[#1a1a18] outline-none focus:border-[#1a9e6e] transition-colors"
                            />
                        </div>
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
                                                        <p className="text-[11px] text-[#9e9b95] truncate">{a.project?.site?.name || a.project?.company?.name || "Unknown"}</p>
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
                                            <th className="p-[10px_16px] text-[11px] font-[500] text-[#9e9b95] uppercase tracking-[0.5px]">Site</th>
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
                                                    <td className="p-[12px_16px] text-[13px] text-[#6b6860]">{a.project?.site?.name || a.project?.company?.name || "Unknown"}</td>
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
