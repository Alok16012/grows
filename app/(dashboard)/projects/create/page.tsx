"use client"

import { Suspense, useState, useEffect, useMemo, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
    ScopePicker, SCOPE_ALL, scopeLabel, matchPeople, fetchStaff,
    toggleAllVisible, allVisibleSelected,
} from "@/components/StaffPicker"
import {
    ChevronLeft, Loader2, FileText, Users, Search, ShieldCheck,
    CheckCircle2, Globe, Sparkles, Lock, Phone,
} from "lucide-react"

type Site = { id: string; name: string; code?: string | null; city?: string | null }
type Person = { id: string; name: string | null; email: string | null; phone?: string | null }

const PROJECT_TYPES = ["Mechanical", "Electrical", "Civil", "Safety", "Facility", "Quality", "Other"]
const PRIORITIES = [
    { value: "Low", dot: "#6b7280" },
    { value: "Medium", dot: "#f59e0b" },
    { value: "High", dot: "#ef4444" },
]
const STATUS_OPTIONS = [
    { value: "PLANNING", label: "Planning", dot: "#3b82f6" },
    { value: "ACTIVE", label: "Active", dot: "#1a9e6e" },
    { value: "ON_HOLD", label: "On Hold", dot: "#ef4444" },
]

const inputCls = "w-full h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text3)]"
const selectCls = inputCls + " cursor-pointer"

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
    return (
        <label className="block text-[12px] font-medium text-[var(--text)] mb-1.5">
            {children}{required && <span className="text-[var(--red)] ml-0.5">*</span>}
        </label>
    )
}

function PersonCard({ person, checked, onToggle, showContact }: {
    person: Person; checked: boolean; onToggle: () => void; showContact?: boolean
}) {
    const initials = (person.name || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
    return (
        <button type="button" onClick={onToggle}
            className={`flex items-center gap-2.5 p-2.5 rounded-[10px] border-[1.5px] text-left transition-all w-full ${
                checked ? "border-[var(--accent)] bg-[#f0fdf4]" : "border-[var(--border)] bg-white hover:border-[var(--accent)]/40"
            }`}>
            <span className={`flex items-center justify-center w-[17px] h-[17px] rounded-[4px] border-[1.5px] shrink-0 transition-colors ${
                checked ? "bg-[var(--accent)] border-[var(--accent)]" : "border-[#d4d1ca] bg-white"
            }`}>
                {checked && <CheckCircle2 size={11} className="text-white" strokeWidth={3} />}
            </span>
            <span className="w-8 h-8 rounded-full bg-[var(--surface2)] text-[var(--text2)] text-[10.5px] font-bold flex items-center justify-center shrink-0">
                {initials}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold text-[var(--text)] truncate">{person.name || "Unnamed"}</span>
                <span className="block text-[11px] text-[var(--text3)] truncate">
                    {showContact && person.phone ? (
                        <span className="inline-flex items-center gap-1"><Phone size={9} /> {person.phone}</span>
                    ) : (person.email || "—")}
                </span>
            </span>
        </button>
    )
}

function CreateProjectForm() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const initialSiteId = searchParams.get("siteId") || ""

    const [saving, setSaving] = useState<false | "create" | "draft">(false)
    const [sites, setSites] = useState<Site[]>([])
    const [loadingSites, setLoadingSites] = useState(true)
    const [managers, setManagers] = useState<Person[]>([])
    const [inspectors, setInspectors] = useState<Person[]>([])
    const [managerSearch, setManagerSearch] = useState("")
    const [inspectorSearch, setInspectorSearch] = useState("")
    // One flag per picker: they load independently, so a shared flag let the
    // faster response clear the other list's "Loading…" while it was still in
    // flight, briefly reading as "nobody here".
    const [loadingManagers, setLoadingManagers] = useState(false)
    const [loadingInspectors, setLoadingInspectors] = useState(false)
    // Which site's staff each picker is browsing. Independent of the project's own
    // site, so you can borrow one person from a neighbouring site without losing
    // the people already ticked.
    const [managerScope, setManagerScope] = useState("")
    const [inspectorScope, setInspectorScope] = useState("")

    const [form, setForm] = useState({
        name: "", description: "", siteId: "", projectType: "",
        startDate: "", endDate: "", priority: "Medium", status: "PLANNING",
    })
    const [managerIds, setManagerIds] = useState<string[]>([])
    const [inspectorIds, setInspectorIds] = useState<string[]>([])

    useEffect(() => {
        if (initialSiteId) setForm(f => ({ ...f, siteId: initialSiteId }))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialSiteId])

    useEffect(() => {
        fetch("/api/sites?isActive=true")
            .then(r => r.ok ? r.json() : [])
            .then(d => setSites(Array.isArray(d) ? d : []))
            .catch(() => toast.error("Failed to load sites"))
            .finally(() => setLoadingSites(false))
    }, [])

    // Read at fetch time so that ticking a box never triggers a refetch, while the
    // people already ticked still get merged into whatever list is being shown.
    const selectedRef = useRef({ managers: [] as string[], inspectors: [] as string[] })
    useEffect(() => {
        selectedRef.current = { managers: managerIds, inspectors: inspectorIds }
    }, [managerIds, inspectorIds])

    // Managers and inspectors are fetched per site, and each picker browses
    // independently — see ScopePicker. They deliberately do not share one effect:
    // changing the manager filter should not re-fetch the inspector list.
    useEffect(() => {
        if (!form.siteId) { setManagers([]); return }
        let cancelled = false
        setLoadingManagers(true)
        fetchStaff("MANAGER", form.siteId, managerScope, selectedRef.current.managers)
            .then(rows => { if (!cancelled) setManagers(rows) })
            .finally(() => { if (!cancelled) setLoadingManagers(false) })
        return () => { cancelled = true }
    }, [form.siteId, managerScope])

    useEffect(() => {
        if (!form.siteId) { setInspectors([]); return }
        let cancelled = false
        setLoadingInspectors(true)
        fetchStaff("INSPECTION_BOY", form.siteId, inspectorScope, selectedRef.current.inspectors)
            .then(rows => { if (!cancelled) setInspectors(rows) })
            .finally(() => { if (!cancelled) setLoadingInspectors(false) })
        return () => { cancelled = true }
    }, [form.siteId, inspectorScope])

    // Changing the project's site resets both pickers: the team belonged to the old
    // site, and carrying it over would submit people who have nothing to do with
    // the new one.
    const changeSite = (siteId: string) => {
        setForm(f => ({ ...f, siteId }))
        setManagerScope("")
        setInspectorScope("")
        setManagerIds([])
        setInspectorIds([])
    }

    const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
    const toggle = (id: string, setter: React.Dispatch<React.SetStateAction<string[]>>) =>
        setter(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

    const filteredManagers = useMemo(() => matchPeople(managers, managerSearch), [managers, managerSearch])
    const filteredInspectors = useMemo(() => matchPeople(inspectors, inspectorSearch), [inspectors, inspectorSearch])


    const requirements = [
        { label: "Project Name is required", ok: form.name.trim().length > 0 },
        { label: "Site selection is required", ok: !!form.siteId },
        { label: "At least one Manager is required", ok: managerIds.length > 0 },
        { label: "At least one Inspector is required", ok: inspectorIds.length > 0 },
    ]
    const canSubmit = form.name.trim().length > 0 && !!form.siteId

    const submit = async (mode: "create" | "draft") => {
        if (!canSubmit) {
            toast.error("Project Name and Site are required")
            return
        }
        setSaving(mode)
        try {
            const res = await fetch("/api/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...form,
                    status: mode === "draft" ? "PLANNING" : form.status,
                    startDate: form.startDate || undefined,
                    endDate: form.endDate || undefined,
                    managerIds,
                    inspectorIds,
                }),
            })
            if (!res.ok) throw new Error(await res.text() || "Failed to create project")
            toast.success(mode === "draft" ? "Project saved as draft" : "Project created!")
            router.push("/projects")
            router.refresh()
        } catch (e) {
            toast.error((e as Error).message || "Something went wrong")
        } finally {
            setSaving(false)
        }
    }

    const sectionCls = "bg-white border border-[var(--border)] rounded-[14px] p-5"

    return (
        <div className="p-4 lg:p-0 pb-8">
            <Link href="/projects" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[var(--text2)] hover:text-[var(--text)] transition-colors mb-3">
                <ChevronLeft size={14} /> Back to Projects
            </Link>
            <div className="mb-5">
                <h1 className="text-[24px] font-semibold tracking-[-0.4px] text-[var(--text)]">Create Project</h1>
                <p className="text-[13px] text-[var(--text3)] mt-0.5">Create a new inspection project and assign your team.</p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4 items-start">
                {/* ── LEFT: form ── */}
                <div className="space-y-4">
                    {/* Project details */}
                    <div className={sectionCls}>
                        <div className="flex items-center gap-2.5 mb-1">
                            <div className="w-8 h-8 rounded-[9px] bg-[var(--accent-light)] flex items-center justify-center">
                                <FileText size={15} className="text-[var(--accent)]" />
                            </div>
                            <div>
                                <h2 className="text-[14px] font-semibold text-[var(--text)]">Project Details</h2>
                                <p className="text-[11.5px] text-[var(--text3)]">Provide the basic information about your new project.</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 mt-4">
                            <div>
                                <FieldLabel required>Project Name</FieldLabel>
                                <input value={form.name} onChange={e => set("name", e.target.value)}
                                    className={inputCls} placeholder="e.g. Annual Electrical Safety Audit" />
                            </div>
                            <div className="sm:row-span-2">
                                <FieldLabel>Description</FieldLabel>
                                <textarea value={form.description} onChange={e => set("description", e.target.value.slice(0, 500))}
                                    rows={4}
                                    className="w-full rounded-[8px] border border-[var(--border)] bg-white px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text3)] resize-y min-h-[90px]"
                                    placeholder="Describe the scope and objectives of this project..." />
                                <p className="text-[10.5px] text-[var(--text3)] text-right mt-0.5">{form.description.length} / 500</p>
                            </div>
                            <div>
                                <FieldLabel required>Site</FieldLabel>
                                <select value={form.siteId} onChange={e => changeSite(e.target.value)} className={selectCls} disabled={loadingSites}>
                                    <option value="">{loadingSites ? "Loading sites..." : "Select a site"}</option>
                                    {sites.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ""}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <FieldLabel required>Project Type</FieldLabel>
                                <select value={form.projectType} onChange={e => set("projectType", e.target.value)} className={selectCls}>
                                    <option value="">Select project type</option>
                                    {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <FieldLabel required>Estimated Start Date</FieldLabel>
                                <input type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)} className={inputCls} />
                            </div>
                            <div>
                                <FieldLabel required>Target End Date</FieldLabel>
                                <input type="date" value={form.endDate} onChange={e => set("endDate", e.target.value)} className={inputCls} />
                            </div>
                            <div>
                                <FieldLabel required>Priority</FieldLabel>
                                <select value={form.priority} onChange={e => set("priority", e.target.value)} className={selectCls}>
                                    {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.value}</option>)}
                                </select>
                            </div>
                            <div>
                                <FieldLabel required>Status</FieldLabel>
                                <select value={form.status} onChange={e => set("status", e.target.value)} className={selectCls}>
                                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Managers */}
                    <div className={sectionCls}>
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-[9px] bg-[#eff6ff] flex items-center justify-center">
                                    <Users size={15} className="text-[#3b82f6]" />
                                </div>
                                <div>
                                    <h2 className="text-[14px] font-semibold text-[var(--text)]">Managers</h2>
                                    <p className="text-[11.5px] text-[var(--text3)]">Staff at this site who can approve reports or manage assignments.</p>
                                </div>
                            </div>
                            <button type="button"
                                onClick={() => toggleAllVisible(filteredManagers, managerIds, setManagerIds)}
                                className="text-[12px] font-medium text-[var(--accent)] hover:underline">
                                {allVisibleSelected(filteredManagers, managerIds) ? "Clear All" : "Select All"}
                            </button>
                        </div>
                        {form.siteId && (
                            <ScopePicker sites={sites} projectSiteId={form.siteId} value={managerScope}
                                onChange={setManagerScope} loading={loadingManagers}
                                count={filteredManagers.length} noun="managers" />
                        )}
                        {form.siteId && managers.length > 0 && (
                            <div className="relative mt-3 mb-2">
                                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                                <input value={managerSearch} onChange={e => setManagerSearch(e.target.value)}
                                    placeholder="Search managers by name or phone..."
                                    className={inputCls + " pl-8"} />
                            </div>
                        )}
                        {!form.siteId ? (
                            <p className="text-[12.5px] text-[var(--text3)] border border-dashed border-[var(--border)] rounded-[10px] p-4 text-center mt-3">Select a site first to see who works there.</p>
                        ) : filteredManagers.length === 0 ? (
                            <p className="text-[12.5px] text-[var(--text3)] border border-dashed border-[var(--border)] rounded-[10px] p-4 text-center mt-3">
                                {loadingManagers ? "Loading…" : managerSearch.trim()
                                    ? "No managers match that search."
                                    : managerScope === SCOPE_ALL
                                        ? "No staff hold approval or assignment permissions yet."
                                        : `Nobody at ${scopeLabel(sites, form.siteId, managerScope)} can approve reports or manage assignments. Add them to that site's team, or pick another site above.`}
                            </p>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 max-h-[300px] overflow-y-auto pr-1">
                                    {filteredManagers.map(m => (
                                        <PersonCard key={m.id} person={m} checked={managerIds.includes(m.id)} onToggle={() => toggle(m.id, setManagerIds)} />
                                    ))}
                                </div>
                                <p className="text-[11px] text-[var(--text3)] mt-2">
                                    Showing {filteredManagers.length} of {managers.length} · {managerIds.length} selected
                                </p>
                            </>
                        )}
                    </div>

                    {/* Inspectors */}
                    <div className={sectionCls}>
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-[9px] bg-[#fef3c7] flex items-center justify-center">
                                    <Users size={15} className="text-[#d97706]" />
                                </div>
                                <div>
                                    <h2 className="text-[14px] font-semibold text-[var(--text)]">Inspectors</h2>
                                    <p className="text-[11.5px] text-[var(--text3)]">Staff at this site who hold the Inspection (Inspector) permission. This only sets the project team — work is handed out from the Assignments screen.</p>
                                </div>
                            </div>
                            <button type="button"
                                onClick={() => toggleAllVisible(filteredInspectors, inspectorIds, setInspectorIds)}
                                className="text-[12px] font-medium text-[var(--accent)] hover:underline">
                                {allVisibleSelected(filteredInspectors, inspectorIds) ? "Clear All" : "Select All"}
                            </button>
                        </div>
                        {form.siteId && (
                            <ScopePicker sites={sites} projectSiteId={form.siteId} value={inspectorScope}
                                onChange={setInspectorScope} loading={loadingInspectors}
                                count={filteredInspectors.length} noun="inspectors" />
                        )}
                        {form.siteId && inspectors.length > 0 && (
                            <div className="relative mt-3 mb-2">
                                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                                <input value={inspectorSearch} onChange={e => setInspectorSearch(e.target.value)}
                                    placeholder="Search inspectors by name or phone..."
                                    className={inputCls + " pl-8"} />
                            </div>
                        )}
                        {!form.siteId ? (
                            <p className="text-[12.5px] text-[var(--text3)] border border-dashed border-[var(--border)] rounded-[10px] p-4 text-center">Select a site first to see who works there.</p>
                        ) : filteredInspectors.length === 0 ? (
                            <p className="text-[12.5px] text-[var(--text3)] border border-dashed border-[var(--border)] rounded-[10px] p-4 text-center">
                                {loadingInspectors ? "Loading…" : inspectorSearch.trim()
                                    ? "No inspectors match that search."
                                    : inspectorScope === SCOPE_ALL
                                        ? "No staff hold the Inspection (Inspector) permission yet."
                                        : `No inspectors work at ${scopeLabel(sites, form.siteId, inspectorScope)} yet. Add them to that site's team, or pick another site above.`}
                            </p>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1">
                                    {filteredInspectors.map(i => (
                                        <PersonCard key={i.id} person={i} checked={inspectorIds.includes(i.id)} onToggle={() => toggle(i.id, setInspectorIds)} showContact />
                                    ))}
                                </div>
                                <p className="text-[11px] text-[var(--text3)] mt-2">
                                    Showing {filteredInspectors.length} of {inspectors.length} inspectors{inspectorIds.length > 0 ? ` · ${inspectorIds.length} selected` : ""}
                                </p>
                            </>
                        )}
                    </div>

                    {/* Footer actions */}
                    <div className="flex items-center justify-end gap-2">
                        <Link href="/projects"
                            className="px-4 h-9 inline-flex items-center rounded-[9px] border border-[var(--border)] bg-white text-[13px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors">
                            Cancel
                        </Link>
                        <button onClick={() => submit("draft")} disabled={!!saving}
                            className="px-4 h-9 inline-flex items-center gap-1.5 rounded-[9px] border border-[var(--border)] bg-white text-[13px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors disabled:opacity-50">
                            {saving === "draft" && <Loader2 size={13} className="animate-spin" />}
                            Save as Draft
                        </button>
                        <button onClick={() => submit("create")} disabled={!!saving}
                            className="px-5 h-9 inline-flex items-center gap-1.5 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                            {saving === "create" && <Loader2 size={13} className="animate-spin" />}
                            Create Project
                        </button>
                    </div>
                </div>

                {/* ── RIGHT: sidebar ── */}
                <div className="space-y-4">
                    <div className={sectionCls}>
                        <h3 className="text-[13.5px] font-semibold text-[var(--text)] flex items-center gap-2 mb-3">
                            <Sparkles size={14} className="text-[var(--accent)]" /> Getting Started
                        </h3>
                        <ol className="space-y-3">
                            {[
                                ["Project Basics", "Name your project clearly and add a description of its scope."],
                                ["Link a Site", "Select the site where inspections will be conducted."],
                                ["Assign Your Team", "Add managers and inspectors who will be responsible for this project."],
                                ["Review & Create", "Review details and create your project to get started."],
                            ].map(([title, sub], i) => (
                                <li key={title} className="flex gap-2.5">
                                    <span className="w-[22px] h-[22px] rounded-full bg-[var(--accent)] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                                    <span>
                                        <span className="block text-[12.5px] font-semibold text-[var(--text)]">{title}</span>
                                        <span className="block text-[11.5px] text-[var(--text3)] leading-snug mt-0.5">{sub}</span>
                                    </span>
                                </li>
                            ))}
                        </ol>
                    </div>

                    <div className={sectionCls}>
                        <h3 className="text-[13.5px] font-semibold text-[var(--text)] flex items-center gap-2 mb-3">
                            <ShieldCheck size={14} className="text-[var(--accent)]" /> Requirements
                        </h3>
                        <ul className="space-y-2">
                            {requirements.map(r => (
                                <li key={r.label} className="flex items-center gap-2 text-[12px]">
                                    <CheckCircle2 size={14} className={r.ok ? "text-[var(--accent)]" : "text-[var(--text3)] opacity-40"} />
                                    <span className={r.ok ? "text-[var(--text)]" : "text-[var(--text3)]"}>{r.label}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className={sectionCls}>
                        <h3 className="text-[13.5px] font-semibold text-[var(--text)] flex items-center gap-2 mb-1">
                            <Lock size={14} className="text-[var(--accent)]" /> Permissions
                        </h3>
                        <p className="text-[11.5px] text-[var(--text3)] mb-3">Project visibility and access control</p>
                        <FieldLabel>Who can access this project?</FieldLabel>
                        <div className="flex items-center gap-2 h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface2)]/40 px-3 text-[13px] text-[var(--text2)]">
                            <Globe size={13} className="text-[var(--text3)]" /> All authorized users
                        </div>
                        <p className="text-[11px] text-[var(--text3)] mt-2">Managers and inspectors you assign will be able to access this project.</p>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function CreateProjectPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
            </div>
        }>
            <CreateProjectForm />
        </Suspense>
    )
}
