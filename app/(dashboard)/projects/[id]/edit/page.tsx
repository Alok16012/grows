"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
    ChevronLeft, Loader2, FileText, Users, Search, Copy, Check,
    CheckCircle2, Clock, User, MapPin, ExternalLink, Info, Phone,
} from "lucide-react"

type Site = { id: string; name: string; code?: string | null; city?: string | null }
type Person = { id: string; name: string | null; email: string | null; phone?: string | null }

type Project = {
    id: string
    name: string
    description: string | null
    companyId: string
    siteId: string | null
    code?: string | null
    status?: string | null
    projectType?: string | null
    priority?: string | null
    startDate?: string | null
    endDate?: string | null
    createdAt: string
    createdByName?: string | null
    site?: { id: string; name: string; code?: string | null } | null
    managerIds?: string[]
    inspectorIds?: string[]
    inspectionStats?: { total: number; approved: number; pending: number; sentBack: number }
}

const PROJECT_TYPES = ["Mechanical", "Electrical", "Civil", "Safety", "Facility", "Quality", "Other"]
const PRIORITIES = ["Low", "Medium", "High"]
const STATUS_OPTIONS = [
    { value: "PLANNING", label: "Planning" },
    { value: "ACTIVE", label: "Active" },
    { value: "ON_HOLD", label: "On Hold" },
    { value: "COMPLETED", label: "Completed" },
    { value: "ARCHIVED", label: "Archived" },
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
    return (
        <button type="button" onClick={onToggle}
            className={`flex items-center gap-2.5 p-2.5 rounded-[10px] border-[1.5px] text-left transition-all w-full ${
                checked ? "border-[var(--accent)] bg-[#f0fdf4]" : "border-[var(--border)] bg-white hover:border-[var(--accent)]/40"
            }`}>
            <span className={`flex items-center justify-center w-[17px] h-[17px] rounded-[4px] border-[1.5px] shrink-0 transition-colors ${
                checked ? "bg-[var(--accent)] border-[var(--accent)]" : "border-[#d4d1ca] bg-white"
            }`}>
                {checked && <Check size={11} className="text-white" strokeWidth={3.5} />}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold text-[var(--text)] truncate">{person.name || "Unnamed"}</span>
                <span className="block text-[11px] text-[var(--text3)] truncate">
                    {showContact && person.phone ? (
                        <span className="inline-flex items-center gap-1"><Phone size={9} /> {person.phone}</span>
                    ) : (person.phone || person.email || "—")}
                </span>
            </span>
        </button>
    )
}

function SummaryRow({ icon, label, value, valueClass }: {
    icon: React.ReactNode; label: string; value: React.ReactNode; valueClass?: string
}) {
    return (
        <div className="flex items-start gap-2.5 py-2">
            <span className="text-[var(--text3)] mt-0.5">{icon}</span>
            <span className="flex-1 min-w-0">
                <span className="block text-[11px] text-[var(--text3)]">{label}</span>
                <span className={`block text-[12.5px] font-medium mt-0.5 ${valueClass ?? "text-[var(--text)]"}`}>{value}</span>
            </span>
        </div>
    )
}

export default function EditProjectPage({ params }: { params: { id: string } }) {
    const router = useRouter()
    const [project, setProject] = useState<Project | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState<false | "save" | "draft">(false)
    const [copied, setCopied] = useState(false)

    const [form, setForm] = useState({
        name: "", description: "", siteId: "", projectType: "",
        startDate: "", endDate: "", priority: "Medium", status: "ACTIVE",
    })
    const [managerIds, setManagerIds] = useState<string[]>([])
    const [inspectorIds, setInspectorIds] = useState<string[]>([])

    const [sites, setSites] = useState<Site[]>([])
    const [managers, setManagers] = useState<Person[]>([])
    const [inspectors, setInspectors] = useState<Person[]>([])
    const [inspectorSearch, setInspectorSearch] = useState("")

    useEffect(() => {
        const toDateInput = (s?: string | null) => (s ? new Date(s).toISOString().slice(0, 10) : "")
        fetch(`/api/projects/${params.id}`)
            .then(r => { if (!r.ok) throw new Error("Not found"); return r.json() })
            .then((d: Project) => {
                setProject(d)
                setForm({
                    name: d.name,
                    description: d.description || "",
                    siteId: d.siteId || "",
                    projectType: d.projectType || "",
                    startDate: toDateInput(d.startDate),
                    endDate: toDateInput(d.endDate),
                    priority: d.priority || "Medium",
                    status: d.status || "ACTIVE",
                })
                setManagerIds(Array.isArray(d.managerIds) ? d.managerIds : [])
                setInspectorIds(Array.isArray(d.inspectorIds) ? d.inspectorIds : [])
            })
            .catch(() => setProject(null))
            .finally(() => setLoading(false))

        fetch("/api/sites?isActive=true").then(r => r.ok ? r.json() : []).then(d => setSites(Array.isArray(d) ? d : [])).catch(() => {})
        fetch("/api/users?role=MANAGER").then(r => r.ok ? r.json() : []).then(d => setManagers(Array.isArray(d) ? d : [])).catch(() => {})
        fetch("/api/users?role=INSPECTION_BOY").then(r => r.ok ? r.json() : []).then(d => setInspectors(Array.isArray(d) ? d : [])).catch(() => {})
    }, [params.id])

    const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
    const toggle = (id: string, setter: React.Dispatch<React.SetStateAction<string[]>>) =>
        setter(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

    const filteredInspectors = useMemo(() => {
        const q = inspectorSearch.trim().toLowerCase()
        if (!q) return inspectors
        return inspectors.filter(i =>
            (i.name || "").toLowerCase().includes(q) ||
            (i.phone || "").toLowerCase().includes(q) ||
            (i.email || "").toLowerCase().includes(q))
    }, [inspectors, inspectorSearch])

    const save = async (mode: "save" | "draft") => {
        if (!form.name.trim() || !form.siteId) {
            toast.error("Project Name and Site are required")
            return
        }
        setSaving(mode)
        try {
            const res = await fetch(`/api/projects/${params.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...form,
                    status: mode === "draft" ? "PLANNING" : form.status,
                    startDate: form.startDate || null,
                    endDate: form.endDate || null,
                    managerIds,
                    inspectorIds,
                }),
            })
            if (!res.ok) throw new Error(await res.text() || "Failed to update")
            toast.success(mode === "draft" ? "Saved as draft" : "Project updated!")
            router.push("/projects")
            router.refresh()
        } catch (e) {
            toast.error((e as Error).message || "Something went wrong")
        } finally {
            setSaving(false)
        }
    }

    const copyCode = () => {
        if (!project?.code) return
        navigator.clipboard?.writeText(project.code).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        }).catch(() => {})
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
            </div>
        )
    }

    if (!project) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
                <h1 className="text-2xl font-bold text-[var(--text)]">Project not found</h1>
                <Link href="/projects" className="inline-flex items-center justify-center bg-white border border-[var(--border)] text-[var(--text2)] px-4 py-2 rounded-md text-sm hover:bg-[var(--surface2)]">
                    Go Back
                </Link>
            </div>
        )
    }

    const stats = project.inspectionStats ?? { total: 0, approved: 0, pending: 0, sentBack: 0 }
    const completedPct = stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0
    const sectionCls = "bg-white border border-[var(--border)] rounded-[14px] p-5"

    return (
        <div className="pb-8">
            <Link href="/projects" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[var(--text2)] hover:text-[var(--text)] transition-colors mb-3">
                <ChevronLeft size={14} /> Back to Projects
            </Link>
            <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-[12px] bg-[var(--accent)] flex items-center justify-center">
                    <FileText size={20} className="text-white" />
                </div>
                <div>
                    <h1 className="text-[24px] font-semibold tracking-[-0.4px] text-[var(--text)]">Edit Project</h1>
                    <p className="text-[13px] text-[var(--text3)]">Update project information and assignments.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4 items-start">
                {/* ── LEFT: form ── */}
                <div className="space-y-4">
                    <div className={sectionCls}>
                        <div className="flex items-center gap-2.5 mb-1">
                            <div className="w-8 h-8 rounded-[9px] bg-[var(--accent-light)] flex items-center justify-center">
                                <FileText size={15} className="text-[var(--accent)]" />
                            </div>
                            <div>
                                <h2 className="text-[14px] font-semibold text-[var(--text)]">Project Details</h2>
                                <p className="text-[11.5px] text-[var(--text3)]">Update the core information and settings for this project.</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 mt-4">
                            <div>
                                <FieldLabel required>Project Name</FieldLabel>
                                <input value={form.name} onChange={e => set("name", e.target.value)} className={inputCls} />
                            </div>
                            <div>
                                <FieldLabel required>Project Type</FieldLabel>
                                <select value={form.projectType} onChange={e => set("projectType", e.target.value)} className={selectCls}>
                                    <option value="">Select project type</option>
                                    {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <FieldLabel>Description</FieldLabel>
                                <textarea value={form.description} onChange={e => set("description", e.target.value.slice(0, 500))}
                                    rows={3}
                                    className="w-full rounded-[8px] border border-[var(--border)] bg-white px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors resize-y min-h-[76px]" />
                                <p className="text-[10.5px] text-[var(--text3)] text-right mt-0.5">{form.description.length} / 500</p>
                            </div>
                            <div>
                                <FieldLabel required>Site</FieldLabel>
                                <select value={form.siteId} onChange={e => set("siteId", e.target.value)} className={selectCls}>
                                    <option value="">Select a site</option>
                                    {sites.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ""}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <FieldLabel>Start Date</FieldLabel>
                                <input type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)} className={inputCls} />
                            </div>
                            <div>
                                <FieldLabel>End Date</FieldLabel>
                                <input type="date" value={form.endDate} onChange={e => set("endDate", e.target.value)} className={inputCls} />
                            </div>
                            <div>
                                <FieldLabel>Priority</FieldLabel>
                                <select value={form.priority} onChange={e => set("priority", e.target.value)} className={selectCls}>
                                    {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            <div>
                                <FieldLabel>Status</FieldLabel>
                                <select value={form.status} onChange={e => set("status", e.target.value)} className={selectCls}>
                                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                </select>
                            </div>
                        </div>
                        <p className="text-[11px] text-[var(--text3)] mt-2 flex items-center gap-1">
                            <Info size={11} /> Dates help schedule inspections and track project timelines.
                        </p>
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
                                    <p className="text-[11.5px] text-[var(--text3)]">Select managers who can oversee and manage this project.</p>
                                </div>
                            </div>
                            <span className="text-[12px] font-medium text-[var(--accent)]">{managerIds.length} selected</span>
                        </div>
                        {managers.length === 0 ? (
                            <p className="text-[12.5px] text-[var(--text3)] border border-dashed border-[var(--border)] rounded-[10px] p-4 text-center mt-3">No managers available.</p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-3">
                                {managers.map(m => (
                                    <PersonCard key={m.id} person={m} checked={managerIds.includes(m.id)} onToggle={() => toggle(m.id, setManagerIds)} />
                                ))}
                            </div>
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
                                    <p className="text-[11.5px] text-[var(--text3)]">Select inspectors who will be assigned to this project.</p>
                                </div>
                            </div>
                            <span className="text-[12px] font-medium text-[var(--accent)]">{inspectorIds.length} selected</span>
                        </div>
                        <div className="relative mt-3 mb-2">
                            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                            <input value={inspectorSearch} onChange={e => setInspectorSearch(e.target.value)}
                                placeholder="Search inspectors by name or phone..."
                                className={inputCls + " pl-8"} />
                        </div>
                        {filteredInspectors.length === 0 ? (
                            <p className="text-[12.5px] text-[var(--text3)] border border-dashed border-[var(--border)] rounded-[10px] p-4 text-center">No inspectors found.</p>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1">
                                    {filteredInspectors.map(i => (
                                        <PersonCard key={i.id} person={i} checked={inspectorIds.includes(i.id)} onToggle={() => toggle(i.id, setInspectorIds)} showContact />
                                    ))}
                                </div>
                                <p className="text-[11px] text-[var(--text3)] mt-2">Showing {filteredInspectors.length} of {inspectors.length} inspectors</p>
                            </>
                        )}
                    </div>

                    {/* Footer actions */}
                    <div className="flex items-center justify-end gap-2">
                        <Link href="/projects"
                            className="px-4 h-9 inline-flex items-center rounded-[9px] border border-[var(--border)] bg-white text-[13px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors">
                            Cancel
                        </Link>
                        <button onClick={() => save("draft")} disabled={!!saving}
                            className="px-4 h-9 inline-flex items-center gap-1.5 rounded-[9px] border border-[var(--accent)] bg-white text-[13px] font-medium text-[var(--accent)] hover:bg-[var(--accent-light)] transition-colors disabled:opacity-50">
                            {saving === "draft" && <Loader2 size={13} className="animate-spin" />}
                            Save Draft
                        </button>
                        <button onClick={() => save("save")} disabled={!!saving}
                            className="px-5 h-9 inline-flex items-center gap-1.5 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                            {saving === "save" && <Loader2 size={13} className="animate-spin" />}
                            Save Changes
                        </button>
                    </div>
                </div>

                {/* ── RIGHT: Project Summary ── */}
                <div className={sectionCls}>
                    <h3 className="text-[13.5px] font-semibold text-[var(--text)] mb-2">Project Summary</h3>
                    <div className="divide-y divide-[var(--border)]">
                        <SummaryRow icon={<FileText size={13} />} label="Project Code"
                            value={
                                <span className="flex items-center gap-1.5">
                                    <span className="font-mono">{project.code || "—"}</span>
                                    {project.code && (
                                        <button onClick={copyCode} className="text-[var(--text3)] hover:text-[var(--text)]" title="Copy code">
                                            {copied ? <Check size={12} className="text-[var(--accent)]" /> : <Copy size={12} />}
                                        </button>
                                    )}
                                </span>
                            } />
                        <SummaryRow icon={<Clock size={13} />} label="Created On"
                            value={new Date(project.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} />
                        <SummaryRow icon={<User size={13} />} label="Created By" value={project.createdByName || "—"} />
                        <SummaryRow icon={<MapPin size={13} />} label="Linked Site"
                            value={
                                project.site ? (
                                    <Link href={`/sites`} className="text-[var(--accent)] hover:underline inline-flex items-center gap-1">
                                        {project.site.name}{project.site.code ? ` (${project.site.code})` : ""} <ExternalLink size={11} />
                                    </Link>
                                ) : "—"
                            } />
                    </div>
                    <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-2">
                        {[
                            { label: "Managers", value: String(managerIds.length) },
                            { label: "Inspectors", value: String(inspectorIds.length) },
                            { label: "Total Inspections", value: String(stats.total) },
                            { label: "Completed", value: `${stats.approved}${stats.total > 0 ? ` (${completedPct}%)` : ""}`, cls: "text-[var(--accent)]" },
                            { label: "Pending Review", value: String(stats.pending), cls: stats.pending > 0 ? "text-[#d97706]" : undefined },
                            { label: "Sent Back", value: String(stats.sentBack), cls: stats.sentBack > 0 ? "text-[var(--red)]" : undefined },
                        ].map(r => (
                            <div key={r.label} className="flex items-center justify-between text-[12.5px]">
                                <span className="text-[var(--text2)]">{r.label}</span>
                                <span className={`font-semibold tabular-nums ${r.cls ?? "text-[var(--text)]"}`}>{r.value}</span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 rounded-[10px] bg-[var(--accent-light)] border border-[#6ee7b7]/40 p-3 flex gap-2">
                        <CheckCircle2 size={13} className="text-[var(--accent)] shrink-0 mt-0.5" />
                        <p className="text-[11.5px] text-[var(--text2)] leading-snug">Changes you make will be updated across the project and visible to all related team members.</p>
                    </div>
                </div>
            </div>
        </div>
    )
}
