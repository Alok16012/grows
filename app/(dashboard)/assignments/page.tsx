"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import {
    Loader2, Check, ChevronLeft, ChevronRight, Search, Trash2, X,
    Users, Sparkles, Eye, MoreVertical, Calendar, RefreshCw,
    ClipboardList, StopCircle, FileText,
} from "lucide-react"
import { can } from "@/lib/can"

// ─── Types ────────────────────────────────────────────────────────────────────

type Person = { id: string; name: string | null; email: string | null; phone?: string | null }

type Assignment = {
    id: string
    projectId: string
    inspectionBoyId: string | null
    status: string
    code?: string | null
    recurrenceType?: string
    recurrenceActive?: boolean
    startDate?: string | null
    notes?: string | null
    createdAt: string
    inspectionBoy?: { id?: string; name: string | null; email?: string | null } | null
    assigner?: { name: string | null } | null
    project?: {
        id: string
        name: string
        company?: { name: string } | null
        site?: { id: string; name: string } | null
        managers?: { id: string; name: string | null; email?: string | null }[]
    } | null
}

// Older assignments predate the ASG-… codes — derive a stable readable
// number from the row id so every assignment has one.
function assignmentNo(a: Assignment) {
    return a.code ?? `ASG-${a.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`
}

const WIZARD_STEPS = [
    { key: "site", label: "Site & Access" },
    { key: "inspectors", label: "Inspectors" },
    { key: "managers", label: "Managers" },
    { key: "review", label: "Type & Review" },
]

const RECURRENCE_OPTIONS = [
    { value: "none", label: "One-time" },
    { value: "daily", label: "Recurring — Daily" },
    { value: "weekly", label: "Recurring — Weekly" },
]

const inputCls = "w-full h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text3)]"
const selectCls = inputCls + " cursor-pointer"

// Derived display status: active assignments whose start date is in the
// future read as "Scheduled" — matches how admins think about them.
function displayStatus(a: Assignment): { label: string; bg: string; fg: string } {
    if (a.status === "manager_only") return { label: "Manager Only", bg: "#f5f3ff", fg: "#7c3aed" }
    if (a.status === "inactive") return { label: "Inactive", bg: "#f3f4f6", fg: "#6b7280" }
    if (a.startDate && new Date(a.startDate) > new Date()) return { label: "Scheduled", bg: "#eff6ff", fg: "#1d4ed8" }
    return { label: "Active", bg: "#e8f7f1", fg: "#0d6b4a" }
}

function fmtDate(s?: string | null) {
    if (!s) return "—"
    return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

function PersonRow({ person, checked, onToggle }: { person: Person; checked: boolean; onToggle: () => void }) {
    const initials = (person.name || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
    return (
        <button type="button" onClick={onToggle}
            className={`flex items-center gap-2.5 p-[9px_12px] w-full text-left border-b border-[var(--border)] last:border-0 transition-colors ${
                checked ? "bg-[#f0fdf4]" : "hover:bg-[var(--surface2)]"
            }`}>
            <span className={`flex items-center justify-center w-[16px] h-[16px] rounded-[4px] border-[1.5px] shrink-0 transition-colors ${
                checked ? "bg-[var(--accent)] border-[var(--accent)]" : "border-[#d4d1ca] bg-white"
            }`}>
                {checked && <Check size={10} className="text-white" strokeWidth={3.5} />}
            </span>
            <span className="w-7 h-7 rounded-full bg-[var(--surface2)] text-[var(--text2)] text-[10px] font-bold flex items-center justify-center shrink-0">
                {initials}
            </span>
            <span className="min-w-0">
                <span className="block text-[12.5px] font-semibold text-[var(--text)] truncate">{person.name || "Unnamed"}</span>
                <span className="block text-[11px] text-[var(--text3)] truncate">{person.phone || person.email || "—"}</span>
            </span>
        </button>
    )
}

function RowMenu({ assignment, onDelete, onStopRecurrence }: {
    assignment: Assignment
    onDelete: () => void
    onStopRecurrence: () => void
}) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener("mousedown", handler)
        return () => document.removeEventListener("mousedown", handler)
    }, [])
    const isVirtual = assignment.id.startsWith("virtual-")
    if (isVirtual) return <span className="w-7 inline-block" />
    return (
        <div className="relative inline-block" ref={ref}>
            <button onClick={() => setOpen(o => !o)}
                className="p-1.5 rounded-[6px] border border-[var(--border)] bg-white text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors">
                <MoreVertical size={13} />
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-[var(--border)] rounded-[10px] shadow-lg z-20 py-1 overflow-hidden">
                    {assignment.recurrenceActive && (
                        <button onClick={() => { onStopRecurrence(); setOpen(false) }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors">
                            <StopCircle size={13} /> Stop Recurrence
                        </button>
                    )}
                    <button onClick={() => { onDelete(); setOpen(false) }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] text-[var(--red)] hover:bg-red-50 transition-colors">
                        <Trash2 size={13} /> Delete Assignment
                    </button>
                </div>
            )}
        </div>
    )
}

export default function AssignmentsPage() {
    const { data: session, status } = useSession()
    const router = useRouter()

    const [mounted, setMounted] = useState(false)
    const isManagerOrAdmin = can(session, "assignments.view")

    useEffect(() => { setMounted(true) }, [])

    useEffect(() => {
        if (!mounted) return
        if (status === "unauthenticated") {
            router.push("/login")
        } else if (status === "authenticated" && !isManagerOrAdmin) {
            router.push(session?.user?.role === "INSPECTION_BOY" ? "/inspection" : "/client")
        }
    }, [status, session, router, isManagerOrAdmin, mounted])

    // ── Data ──
    const [sites, setSites] = useState<any[]>([])
    const [projects, setProjects] = useState<any[]>([])
    const [inspectors, setInspectors] = useState<Person[]>([])
    const [managers, setManagers] = useState<Person[]>([])
    const [assignments, setAssignments] = useState<Assignment[]>([])
    const [fetching, setFetching] = useState(true)

    // ── Wizard state ──
    const [wizardStep, setWizardStep] = useState(0)
    const [selectedSiteId, setSelectedSiteId] = useState("")
    const [wholeSite, setWholeSite] = useState(true)
    const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([])
    const [selectedInspectorIds, setSelectedInspectorIds] = useState<string[]>([])
    const [selectedManagerIds, setSelectedManagerIds] = useState<string[]>([])
    const [recurrenceType, setRecurrenceType] = useState("none")
    const [startDate, setStartDate] = useState("")
    const [notes, setNotes] = useState("")
    const [loading, setLoading] = useState(false)
    const [inspectorSearch, setInspectorSearch] = useState("")
    const [managerSearch, setManagerSearch] = useState("")

    // ── Table state ──
    const [assignmentSearch, setAssignmentSearch] = useState("")
    const [filterStatus, setFilterStatus] = useState("all")
    const [page, setPage] = useState(1)
    const [perPage, setPerPage] = useState(10)
    const [detail, setDetail] = useState<Assignment | null>(null)

    useEffect(() => { setPage(1) }, [assignmentSearch, filterStatus, perPage])

    useEffect(() => {
        if (mounted && isManagerOrAdmin) fetchInitialData()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isManagerOrAdmin, mounted])

    useEffect(() => {
        if (selectedSiteId) fetchProjects(selectedSiteId)
        else setProjects([])
        // Changing Site resets the project selection.
        setSelectedProjectIds([])
    }, [selectedSiteId])

    // Auto-fill inspectors & managers from the chosen projects' existing members.
    useEffect(() => {
        const sourceProjects = wholeSite ? projects : projects.filter(p => selectedProjectIds.includes(p.id))
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
                fetch(`/api/assignments?t=${Date.now()}`),
            ])
            if (siteRes.ok) setSites(await siteRes.json())
            if (insRes.ok) setInspectors(await insRes.json())
            if (mgrRes.ok) setManagers(await mgrRes.json())
            if (assRes.ok) {
                const data = await assRes.json()
                setAssignments(Array.isArray(data) ? data : [])
            }
        } catch {
            setAssignments([])
        } finally {
            setFetching(false)
        }
    }

    const fetchProjects = async (siteId: string) => {
        try {
            const res = await fetch(`/api/projects?siteId=${siteId}`)
            const data = res.ok ? await res.json() : []
            setProjects(Array.isArray(data) ? data : [])
        } catch {
            setProjects([])
        }
    }

    const refreshAssignments = async () => {
        try {
            const res = await fetch(`/api/assignments?t=${Date.now()}`)
            const data = await res.json()
            setAssignments(Array.isArray(data) ? data : [])
        } catch { /* keep old */ }
    }

    const resetForm = () => {
        setSelectedInspectorIds([])
        setSelectedManagerIds([])
        setSelectedProjectIds([])
        setWholeSite(true)
        setSelectedSiteId("")
        setRecurrenceType("none")
        setStartDate("")
        setNotes("")
        setWizardStep(0)
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
                    recurrenceType,
                    startDate: startDate || undefined,
                    notes: notes || undefined,
                }),
            })
            if (res.ok) {
                await refreshAssignments()
                resetForm()
            } else {
                const error = await res.json()
                alert(error.error || "Failed to assign")
            }
        } catch {
            alert("An error occurred")
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this assignment permanently?")) return
        try {
            const res = await fetch(`/api/assignments/${id}`, { method: "DELETE" })
            if (res.ok) setAssignments(prev => prev.filter(a => a.id !== id))
            else alert("Failed to delete assignment")
        } catch {
            alert("An error occurred while deleting")
        }
    }

    const handleStopRecurrence = async (id: string) => {
        if (!confirm("Stop auto-recurring for this assignment? No more assignments will be created automatically.")) return
        try {
            const res = await fetch(`/api/assignments/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ recurrenceActive: false }),
            })
            if (res.ok) setAssignments(prev => prev.map(a => a.id === id ? { ...a, recurrenceActive: false } : a))
        } catch { /* ignore */ }
    }

    // ── Wizard helpers ──
    const hasProjectAccess = wholeSite ? !!selectedSiteId : selectedProjectIds.length > 0
    const canLeaveStep0 = !!selectedSiteId && hasProjectAccess && !!startDate
    const goNext = () => {
        if (wizardStep === 0 && !canLeaveStep0) return
        setWizardStep(s => Math.min(s + 1, WIZARD_STEPS.length - 1))
    }
    const goBack = () => setWizardStep(s => Math.max(s - 1, 0))
    const goToStep = (target: number) => {
        if (target === wizardStep) return
        if (target < wizardStep) { setWizardStep(target); return }
        if (canLeaveStep0) setWizardStep(target)
    }
    const toggleId = (id: string, setter: React.Dispatch<React.SetStateAction<string[]>>) =>
        setter(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

    const selectedSite = sites.find(s => s.id === selectedSiteId)

    const insMatch = inspectorSearch.trim().toLowerCase()
    const filteredInspectors = insMatch
        ? inspectors.filter(i => (i.name || "").toLowerCase().includes(insMatch) || (i.email || "").toLowerCase().includes(insMatch) || (i.phone || "").toLowerCase().includes(insMatch))
        : inspectors
    const mgrMatch = managerSearch.trim().toLowerCase()
    const filteredManagers = mgrMatch
        ? managers.filter(m => (m.name || "").toLowerCase().includes(mgrMatch) || (m.email || "").toLowerCase().includes(mgrMatch))
        : managers

    // ── Table data ──
    const realAssignments = useMemo(() => assignments.filter(a => !a.id.startsWith("virtual-")), [assignments])
    const stats = useMemo(() => ({
        total: realAssignments.length,
        active: realAssignments.filter(a => displayStatus(a).label === "Active").length,
        oneTime: realAssignments.filter(a => (a.recurrenceType ?? "none") === "none").length,
        recurring: realAssignments.filter(a => (a.recurrenceType ?? "none") !== "none").length,
    }), [realAssignments])

    const filteredAssignments = useMemo(() => {
        const q = assignmentSearch.trim().toLowerCase()
        return assignments.filter(a => {
            if (filterStatus !== "all" && displayStatus(a).label !== filterStatus) return false
            if (q) {
                const hay = [
                    a.inspectionBoy?.name,
                    a.project?.name,
                    a.project?.site?.name,
                    a.project?.company?.name,
                ].filter(Boolean).join(" ").toLowerCase()
                if (!hay.includes(q)) return false
            }
            return true
        })
    }, [assignments, assignmentSearch, filterStatus])

    const totalPages = Math.max(1, Math.ceil(filteredAssignments.length / perPage))
    const safePage = Math.min(page, totalPages)
    const pageRows = filteredAssignments.slice((safePage - 1) * perPage, safePage * perPage)
    const showFrom = filteredAssignments.length === 0 ? 0 : (safePage - 1) * perPage + 1
    const showTo = Math.min(safePage * perPage, filteredAssignments.length)

    if (status === "loading" || fetching) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
            </div>
        )
    }
    if (!isManagerOrAdmin) return null

    const listBox = "bg-[var(--surface2)]/40 border border-[var(--border)] rounded-[10px] max-h-[260px] overflow-y-auto"

    return (
        <div className="pb-8">
            {/* Header */}
            <div className="mb-4">
                <h1 className="text-[24px] font-semibold tracking-[-0.4px] text-[var(--text)] flex items-center gap-2">
                    <span className="w-8 h-8 rounded-[9px] bg-[var(--accent-light)] flex items-center justify-center">
                        <Users size={16} className="text-[var(--accent)]" />
                    </span>
                    Assignments
                </h1>
                <p className="text-[13px] text-[var(--text3)] mt-0.5">Assign inspectors and managers to projects and define access, scope, and schedules.</p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[440px_1fr] gap-4 items-start">

                {/* ── LEFT: New Assignment wizard ── */}
                <div className="bg-white border border-[var(--border)] rounded-[14px] p-5">
                    <div className="flex items-center gap-2 mb-0.5">
                        <Sparkles size={15} className="text-[var(--accent)]" />
                        <h2 className="text-[15px] font-semibold text-[var(--text)]">New Assignment</h2>
                    </div>
                    <p className="text-[12px] text-[var(--text3)] mb-4">Create a new assignment in a few simple steps.</p>

                    {/* Stepper */}
                    <p className="text-[12px] font-semibold text-[var(--text)] mb-2.5">
                        Step {wizardStep + 1} of {WIZARD_STEPS.length} — {WIZARD_STEPS[wizardStep].label}
                    </p>
                    <div className="flex items-center mb-5">
                        {WIZARD_STEPS.map((s, i) => {
                            const isDone = i < wizardStep
                            const isActive = i === wizardStep
                            return (
                                <div key={s.key} className="flex items-center flex-1 last:flex-none">
                                    <button type="button" onClick={() => goToStep(i)} className="flex flex-col items-center gap-[5px] shrink-0 focus:outline-none">
                                        <span className={`flex items-center justify-center w-[26px] h-[26px] rounded-full text-[12px] font-bold border-[1.5px] transition-colors ${
                                            isActive ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                                                : isDone ? "bg-[var(--accent-light)] border-[var(--accent)] text-[var(--accent)]"
                                                    : "bg-white border-[var(--border)] text-[var(--text3)]"
                                        }`}>
                                            {isDone ? <Check size={13} strokeWidth={3} /> : i + 1}
                                        </span>
                                        <span className={`text-[10px] font-medium whitespace-nowrap ${isActive ? "text-[var(--text)]" : "text-[var(--text3)]"}`}>{s.label}</span>
                                    </button>
                                    {i < WIZARD_STEPS.length - 1 && (
                                        <span className={`h-[2px] flex-1 mx-1.5 mb-[18px] rounded-full transition-colors ${i < wizardStep ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`} />
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    {/* STEP 1: Site & Access */}
                    {wizardStep === 0 && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[12px] font-medium text-[var(--text)] mb-1.5">Select Site <span className="text-[var(--red)]">*</span></label>
                                <select value={selectedSiteId} onChange={e => setSelectedSiteId(e.target.value)} className={selectCls}>
                                    <option value="">Select Site</option>
                                    {sites.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}{s.city ? `, ${s.city}` : ""}{s.code ? ` (${s.code})` : ""}</option>
                                    ))}
                                </select>
                            </div>

                            {selectedSiteId && (
                                <div>
                                    <label className="block text-[12px] font-medium text-[var(--text)] mb-1.5">Access Scope</label>
                                    <div className="space-y-2">
                                        <button type="button" onClick={() => { setWholeSite(true); setSelectedProjectIds([]) }}
                                            className={`w-full flex items-center gap-2.5 p-[11px_14px] rounded-[10px] border-[1.5px] text-left transition-all ${
                                                wholeSite ? "border-[var(--accent)] bg-[#f0fdf4]" : "border-[var(--border)] bg-white hover:border-[var(--accent)]/40"
                                            }`}>
                                            <span className={`flex items-center justify-center w-[15px] h-[15px] rounded-full border-[1.5px] shrink-0 ${wholeSite ? "border-[var(--accent)]" : "border-[#d4d1ca]"}`}>
                                                {wholeSite && <span className="w-[7px] h-[7px] rounded-full bg-[var(--accent)]" />}
                                            </span>
                                            <span>
                                                <span className="block text-[12.5px] font-semibold text-[var(--text)] underline decoration-transparent">All Projects</span>
                                                <span className="block text-[11px] text-[var(--text3)]">Every project under this site — future ones auto-included.</span>
                                            </span>
                                        </button>
                                        <button type="button" onClick={() => setWholeSite(false)}
                                            className={`w-full flex items-center gap-2.5 p-[11px_14px] rounded-[10px] border-[1.5px] text-left transition-all ${
                                                !wholeSite ? "border-[var(--accent)] bg-[#f0fdf4]" : "border-[var(--border)] bg-white hover:border-[var(--accent)]/40"
                                            }`}>
                                            <span className={`flex items-center justify-center w-[15px] h-[15px] rounded-full border-[1.5px] shrink-0 ${!wholeSite ? "border-[var(--accent)]" : "border-[#d4d1ca]"}`}>
                                                {!wholeSite && <span className="w-[7px] h-[7px] rounded-full bg-[var(--accent)]" />}
                                            </span>
                                            <span>
                                                <span className="block text-[12.5px] font-semibold text-[var(--text)]">Specific Projects</span>
                                                <span className="block text-[11px] text-[var(--text3)]">Pick only the projects to grant access to.</span>
                                            </span>
                                        </button>
                                    </div>

                                    {!wholeSite && (
                                        <div className="mt-2.5">
                                            <div className="flex justify-between items-center mb-1.5">
                                                <span className="text-[12px] font-medium text-[var(--text)]">Select Projects</span>
                                                {selectedProjectIds.length > 0 && (
                                                    <span className="bg-[var(--accent-light)] text-[var(--accent)] px-2 py-0.5 rounded-full text-[11px] font-medium">
                                                        {selectedProjectIds.length} selected
                                                    </span>
                                                )}
                                            </div>
                                            <div className={listBox}>
                                                {projects.length === 0 ? (
                                                    <p className="p-4 text-center text-[12px] text-[var(--text3)]">No projects under this Site.</p>
                                                ) : projects.map(p => {
                                                    const checked = selectedProjectIds.includes(p.id)
                                                    return (
                                                        <button key={p.id} type="button" onClick={() => toggleId(p.id, setSelectedProjectIds)}
                                                            className={`flex items-center gap-2.5 p-[9px_12px] w-full text-left border-b border-[var(--border)] last:border-0 transition-colors ${
                                                                checked ? "bg-[#f0fdf4]" : "hover:bg-[var(--surface2)]"
                                                            }`}>
                                                            <span className={`flex items-center justify-center w-[16px] h-[16px] rounded-[4px] border-[1.5px] shrink-0 ${
                                                                checked ? "bg-[var(--accent)] border-[var(--accent)]" : "border-[#d4d1ca] bg-white"
                                                            }`}>
                                                                {checked && <Check size={10} className="text-white" strokeWidth={3.5} />}
                                                            </span>
                                                            <span className="text-[12.5px] font-medium text-[var(--text)] truncate">{p.name}</span>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[12px] font-medium text-[var(--text)] mb-1.5">Start Date <span className="text-[var(--red)]">*</span></label>
                                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
                                </div>
                                <div>
                                    <label className="block text-[12px] font-medium text-[var(--text)] mb-1.5">Recurrence</label>
                                    <select value={recurrenceType} onChange={e => setRecurrenceType(e.target.value)} className={selectCls}>
                                        {RECURRENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[12px] font-medium text-[var(--text)] mb-1.5">Notes / Summary <span className="text-[var(--text3)] font-normal">(Optional)</span></label>
                                <textarea value={notes} onChange={e => setNotes(e.target.value.slice(0, 250))} rows={3}
                                    placeholder="e.g. Routine inspection for mechanical & safety compliance."
                                    className="w-full rounded-[8px] border border-[var(--border)] bg-white px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text3)] resize-y min-h-[70px]" />
                                <p className="text-[10.5px] text-[var(--text3)] text-right">{notes.length}/250</p>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: Inspectors */}
                    {wizardStep === 1 && (
                        <div>
                            <div className="flex justify-between items-center mb-1.5">
                                <span className="text-[12px] font-medium text-[var(--text)]">Select Inspectors</span>
                                {selectedInspectorIds.length > 0 && (
                                    <span className="bg-[var(--accent-light)] text-[var(--accent)] px-2 py-0.5 rounded-full text-[11px] font-medium">
                                        {selectedInspectorIds.length} selected
                                    </span>
                                )}
                            </div>
                            <div className="relative mb-2">
                                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                                <input value={inspectorSearch} onChange={e => setInspectorSearch(e.target.value)}
                                    placeholder="Search inspectors by name or email..." className={inputCls + " pl-8"} />
                            </div>
                            <div className={listBox}>
                                {filteredInspectors.length === 0 ? (
                                    <p className="p-4 text-center text-[12px] text-[var(--text3)]">No inspectors found.</p>
                                ) : filteredInspectors.map(i => (
                                    <PersonRow key={i.id} person={i} checked={selectedInspectorIds.includes(i.id)} onToggle={() => toggleId(i.id, setSelectedInspectorIds)} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* STEP 3: Managers */}
                    {wizardStep === 2 && (
                        <div>
                            <div className="flex justify-between items-center mb-1.5">
                                <span className="text-[12px] font-medium text-[var(--text)]">Select Managers</span>
                                {selectedManagerIds.length > 0 && (
                                    <span className="bg-[var(--accent-light)] text-[var(--accent)] px-2 py-0.5 rounded-full text-[11px] font-medium">
                                        {selectedManagerIds.length} selected
                                    </span>
                                )}
                            </div>
                            <div className="relative mb-2">
                                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                                <input value={managerSearch} onChange={e => setManagerSearch(e.target.value)}
                                    placeholder="Search managers by name or email..." className={inputCls + " pl-8"} />
                            </div>
                            <div className={listBox}>
                                {filteredManagers.length === 0 ? (
                                    <p className="p-4 text-center text-[12px] text-[var(--text3)]">No managers found.</p>
                                ) : filteredManagers.map(m => (
                                    <PersonRow key={m.id} person={m} checked={selectedManagerIds.includes(m.id)} onToggle={() => toggleId(m.id, setSelectedManagerIds)} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* STEP 4: Review */}
                    {wizardStep === 3 && (
                        <div className="space-y-2.5">
                            {[
                                { label: "Site", value: selectedSite ? selectedSite.name : "—" },
                                { label: "Scope", value: wholeSite ? `All Projects (${projects.length})` : `${selectedProjectIds.length} specific project(s)` },
                                { label: "Start Date", value: startDate ? fmtDate(startDate) : "—" },
                                { label: "Recurrence", value: RECURRENCE_OPTIONS.find(o => o.value === recurrenceType)?.label ?? "One-time" },
                                { label: "Inspectors", value: selectedInspectorIds.length > 0 ? `${selectedInspectorIds.length} selected` : "None" },
                                { label: "Managers", value: selectedManagerIds.length > 0 ? `${selectedManagerIds.length} selected` : "None" },
                            ].map(r => (
                                <div key={r.label} className="flex items-center justify-between bg-[var(--surface2)]/50 border border-[var(--border)] rounded-[9px] px-3 py-2">
                                    <span className="text-[12px] text-[var(--text2)]">{r.label}</span>
                                    <span className="text-[12.5px] font-semibold text-[var(--text)]">{r.value}</span>
                                </div>
                            ))}
                            {notes && (
                                <div className="bg-[var(--surface2)]/50 border border-[var(--border)] rounded-[9px] px-3 py-2">
                                    <p className="text-[12px] text-[var(--text2)] mb-0.5">Notes</p>
                                    <p className="text-[12.5px] text-[var(--text)]">{notes}</p>
                                </div>
                            )}
                            {selectedInspectorIds.length === 0 && selectedManagerIds.length === 0 && (
                                <p className="text-[12px] text-[var(--red)] bg-[var(--red-light)] rounded-[9px] px-3 py-2">
                                    Select at least one inspector or manager before creating the assignment.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between gap-2 mt-5 pt-4 border-t border-[var(--border)]">
                        <button onClick={goBack} disabled={wizardStep === 0}
                            className="inline-flex items-center gap-1 px-3.5 h-9 rounded-[9px] border border-[var(--border)] bg-white text-[12.5px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                            <ChevronLeft size={13} /> Back
                        </button>
                        <div className="flex items-center gap-2">
                            <button onClick={resetForm}
                                className="px-3.5 h-9 rounded-[9px] text-[12.5px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors">
                                Cancel
                            </button>
                            {wizardStep < WIZARD_STEPS.length - 1 ? (
                                <button onClick={goNext} disabled={wizardStep === 0 && !canLeaveStep0}
                                    className="inline-flex items-center gap-1 px-4 h-9 rounded-[9px] bg-[var(--accent)] text-white text-[12.5px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed">
                                    Next <ChevronRight size={13} />
                                </button>
                            ) : (
                                <button onClick={handleAssign}
                                    disabled={loading || (selectedInspectorIds.length === 0 && selectedManagerIds.length === 0)}
                                    className="inline-flex items-center gap-1.5 px-4 h-9 rounded-[9px] bg-[var(--accent)] text-white text-[12.5px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed">
                                    {loading && <Loader2 size={13} className="animate-spin" />}
                                    Create Assignment
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── RIGHT: stats + table ── */}
                <div className="space-y-4 min-w-0">
                    {/* Stats strip */}
                    <div className="bg-white border border-[var(--border)] rounded-[14px] p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-3 divide-x-0 sm:divide-x divide-[var(--border)]">
                        <div className="flex items-center gap-2.5 sm:pl-2">
                            <span className="w-9 h-9 rounded-[9px] bg-[var(--accent-light)] flex items-center justify-center"><ClipboardList size={16} className="text-[var(--accent)]" /></span>
                            <span>
                                <span className="block text-[18px] font-bold text-[var(--text)] leading-none tabular-nums">{stats.total}</span>
                                <span className="block text-[10.5px] text-[var(--text3)] mt-0.5">Total Assignments</span>
                            </span>
                        </div>
                        <div className="flex items-center gap-2.5 sm:pl-4">
                            <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent)] shrink-0" />
                            <span>
                                <span className="block text-[18px] font-bold text-[var(--text)] leading-none tabular-nums">{stats.active}</span>
                                <span className="block text-[10.5px] text-[var(--text3)] mt-0.5">Active</span>
                            </span>
                        </div>
                        <div className="flex items-center gap-2.5 sm:pl-4">
                            <span className="w-9 h-9 rounded-[9px] bg-[#eff6ff] flex items-center justify-center"><Calendar size={15} className="text-[#3b82f6]" /></span>
                            <span>
                                <span className="block text-[18px] font-bold text-[var(--text)] leading-none tabular-nums">{stats.oneTime}</span>
                                <span className="block text-[10.5px] text-[var(--text3)] mt-0.5">One-time</span>
                            </span>
                        </div>
                        <div className="flex items-center gap-2.5 sm:pl-4">
                            <span className="w-9 h-9 rounded-[9px] bg-[#f5f3ff] flex items-center justify-center"><RefreshCw size={15} className="text-[#7c3aed]" /></span>
                            <span>
                                <span className="block text-[18px] font-bold text-[var(--text)] leading-none tabular-nums">{stats.recurring}</span>
                                <span className="block text-[10.5px] text-[var(--text3)] mt-0.5">Recurring</span>
                            </span>
                        </div>
                    </div>

                    {/* Table card */}
                    <div className="bg-white border border-[var(--border)] rounded-[14px] overflow-hidden">
                        <div className="p-3.5 flex flex-wrap items-center gap-2.5 border-b border-[var(--border)]">
                            <h2 className="text-[15px] font-semibold text-[var(--text)] flex-1">Assignments</h2>
                            <div className="relative min-w-[200px]">
                                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                                <input value={assignmentSearch} onChange={e => setAssignmentSearch(e.target.value)}
                                    placeholder="Search by inspector, project, site..." className={inputCls + " pl-8 h-8"} />
                            </div>
                            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                                className="h-8 rounded-[8px] border border-[var(--border)] bg-white px-2.5 text-[12.5px] text-[var(--text2)] outline-none cursor-pointer">
                                <option value="all">All Status</option>
                                {["Active", "Scheduled", "Inactive", "Manager Only"].map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>

                        {filteredAssignments.length === 0 ? (
                            <p className="text-center text-[13px] text-[var(--text3)] py-12">No assignments found.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full" style={{ fontSize: 12.5 }}>
                                    <thead>
                                        <tr className="bg-[var(--surface2)]/60 text-[11px] text-[var(--text3)] uppercase tracking-wide">
                                            <th className="text-left font-semibold px-4 py-2.5 whitespace-nowrap">Assignment #</th>
                                            <th className="text-left font-semibold px-3 py-2.5">Inspector</th>
                                            <th className="text-left font-semibold px-3 py-2.5">Project</th>
                                            <th className="text-left font-semibold px-3 py-2.5">Status</th>
                                            <th className="text-left font-semibold px-3 py-2.5">Type</th>
                                            <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Start Date</th>
                                            <th className="text-right font-semibold px-4 py-2.5">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border)]">
                                        {pageRows.map(a => {
                                            const st = displayStatus(a)
                                            return (
                                                <tr key={a.id} onClick={() => setDetail(a)}
                                                    className="hover:bg-[var(--surface2)]/40 transition-colors cursor-pointer">
                                                    <td className="px-4 py-2.5">
                                                        <p className="font-mono text-[11.5px] font-semibold text-[var(--accent)] whitespace-nowrap">{assignmentNo(a)}</p>
                                                        <p className="text-[10.5px] text-[var(--text3)] whitespace-nowrap">{a.project?.site?.name || a.project?.company?.name || "—"}</p>
                                                    </td>
                                                    <td className="px-3 py-2.5">
                                                        <p className="font-semibold text-[var(--text)] leading-tight">{a.inspectionBoy?.name || "—"}</p>
                                                        <p className="text-[10.5px] text-[var(--text3)]">Inspector</p>
                                                    </td>
                                                    <td className="px-3 py-2.5 text-[var(--text2)] max-w-[150px] truncate">{a.project?.name || "—"}</td>
                                                    <td className="px-3 py-2.5">
                                                        <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold whitespace-nowrap" style={{ background: st.bg, color: st.fg }}>
                                                            {st.label}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2.5 text-[var(--text2)] whitespace-nowrap">
                                                        {(a.recurrenceType ?? "none") === "none" ? "One-time" : "Recurring"}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-[var(--text3)] whitespace-nowrap tabular-nums">{fmtDate(a.startDate ?? a.createdAt)}</td>
                                                    <td className="px-4 py-2.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                                        <div className="inline-flex items-center gap-1.5">
                                                            <button onClick={() => setDetail(a)} title="View details"
                                                                className="p-1.5 rounded-[6px] border border-[var(--border)] bg-white text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors">
                                                                <Eye size={13} />
                                                            </button>
                                                            <RowMenu assignment={a} onDelete={() => handleDelete(a.id)} onStopRecurrence={() => handleStopRecurrence(a.id)} />
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Pagination */}
                        {filteredAssignments.length > 0 && (
                            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-[var(--border)]">
                                <p className="text-[12px] text-[var(--text3)]">
                                    Showing {showFrom} to {showTo} of {filteredAssignments.length} assignment{filteredAssignments.length !== 1 ? "s" : ""}
                                </p>
                                <div className="flex items-center gap-1.5">
                                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
                                        className="w-7 h-7 flex items-center justify-center rounded-[7px] border border-[var(--border)] bg-white text-[var(--text2)] hover:bg-[var(--surface2)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                                        <ChevronLeft size={13} />
                                    </button>
                                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                                        .filter(p => totalPages <= 7 || Math.abs(p - safePage) <= 2 || p === 1 || p === totalPages)
                                        .map((p, idx, arr) => (
                                            <span key={p} className="flex items-center gap-1.5">
                                                {idx > 0 && arr[idx - 1] !== p - 1 && <span className="text-[11px] text-[var(--text3)]">…</span>}
                                                <button onClick={() => setPage(p)}
                                                    className={`min-w-7 h-7 px-1.5 rounded-[7px] text-[12px] font-medium border transition-colors ${
                                                        p === safePage
                                                            ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                                                            : "bg-white border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)]"
                                                    }`}>
                                                    {p}
                                                </button>
                                            </span>
                                        ))}
                                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                                        className="w-7 h-7 flex items-center justify-center rounded-[7px] border border-[var(--border)] bg-white text-[var(--text2)] hover:bg-[var(--surface2)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                                        <ChevronRight size={13} />
                                    </button>
                                    <select value={perPage} onChange={e => setPerPage(Number(e.target.value))}
                                        className="h-7 rounded-[7px] border border-[var(--border)] bg-white px-1.5 text-[12px] text-[var(--text2)] outline-none cursor-pointer">
                                        {[10, 25, 50].map(n => <option key={n} value={n}>{n} / page</option>)}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Detail modal */}
            {detail && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setDetail(null)}>
                    <div className="bg-white rounded-[16px] border border-[var(--border)] w-full max-w-md shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                            <div>
                                <h2 className="text-[15px] font-semibold text-[var(--text)] flex items-center gap-2">
                                    <FileText size={15} className="text-[var(--accent)]" /> Assignment Details
                                </h2>
                                <p className="font-mono text-[11.5px] font-semibold text-[var(--accent)] mt-0.5">{assignmentNo(detail)}</p>
                            </div>
                            <button onClick={() => setDetail(null)} className="p-1 text-[var(--text3)] hover:text-[var(--text)] rounded-md hover:bg-[var(--surface2)] transition-colors">
                                <X size={17} />
                            </button>
                        </div>
                        <div className="p-5 space-y-2.5">
                            {[
                                { label: "Project", value: detail.project?.name || "—" },
                                { label: "Site", value: detail.project?.site?.name || detail.project?.company?.name || "—" },
                                { label: "Status", value: displayStatus(detail).label },
                                { label: "Type", value: (detail.recurrenceType ?? "none") === "none" ? "One-time" : `Recurring (${detail.recurrenceType})${detail.recurrenceActive ? "" : " — stopped"}` },
                                { label: "Start Date", value: fmtDate(detail.startDate ?? detail.createdAt) },
                                { label: "Assigned By", value: detail.assigner?.name || "—" },
                                { label: "Created", value: fmtDate(detail.createdAt) },
                            ].map(r => (
                                <div key={r.label} className="flex items-center justify-between">
                                    <span className="text-[12.5px] text-[var(--text2)]">{r.label}</span>
                                    <span className="text-[12.5px] font-semibold text-[var(--text)] text-right max-w-[60%] truncate">{r.value}</span>
                                </div>
                            ))}
                            {/* People on this assignment */}
                            <div className="pt-2.5 border-t border-[var(--border)]">
                                <p className="text-[12px] text-[var(--text2)] mb-1.5">People</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {detail.inspectionBoy?.name && (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--accent-light)] text-[var(--accent)] text-[11px] font-semibold">
                                            <Users size={10} /> {detail.inspectionBoy.name} · Inspector
                                        </span>
                                    )}
                                    {(detail.project?.managers ?? []).map(m => (
                                        <span key={m.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#eff6ff] text-[#1d4ed8] text-[11px] font-semibold">
                                            <Users size={10} /> {m.name || "Unnamed"} · Manager
                                        </span>
                                    ))}
                                    {!detail.inspectionBoy?.name && (detail.project?.managers ?? []).length === 0 && (
                                        <span className="text-[12px] text-[var(--text3)]">No people linked.</span>
                                    )}
                                </div>
                            </div>
                            {detail.notes && (
                                <div className="pt-2 border-t border-[var(--border)]">
                                    <p className="text-[12px] text-[var(--text2)] mb-1">Notes</p>
                                    <p className="text-[12.5px] text-[var(--text)] bg-[var(--surface2)]/50 rounded-[8px] p-2.5">{detail.notes}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
