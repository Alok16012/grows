
"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, Loader2 } from "lucide-react"

type Site = {
    id: string
    name: string
    code?: string | null
    city?: string | null
}

type Person = {
    id: string
    name: string | null
    email: string | null
}

type Project = {
    id: string
    name: string
    description: string | null
    companyId: string
    siteId: string | null
    managerIds?: string[]
    inspectorIds?: string[]
}

export default function EditProjectPage({ params }: { params: { id: string } }) {
    const router = useRouter()
    const [project, setProject] = useState<Project | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState("")

    const [name, setName] = useState("")
    const [description, setDescription] = useState("")
    const [selectedSiteId, setSelectedSiteId] = useState("")

    const [sites, setSites] = useState<Site[]>([])
    const [loadingSites, setLoadingSites] = useState(true)
    const [managers, setManagers] = useState<Person[]>([])
    const [inspectors, setInspectors] = useState<Person[]>([])
    const [selectedManagerIds, setSelectedManagerIds] = useState<string[]>([])
    const [selectedInspectorIds, setSelectedInspectorIds] = useState<string[]>([])

    useEffect(() => {
        const fetchProject = async () => {
            try {
                const res = await fetch(`/api/projects/${params.id}`)
                if (!res.ok) throw new Error("Not found")
                const data = await res.json()
                setProject(data)
                setName(data.name)
                setDescription(data.description || "")
                setSelectedSiteId(data.siteId || "")
                setSelectedManagerIds(Array.isArray(data.managerIds) ? data.managerIds : [])
                setSelectedInspectorIds(Array.isArray(data.inspectorIds) ? data.inspectorIds : [])
            } catch {
                setError("Project not found")
            } finally {
                setLoading(false)
            }
        }
        fetchProject()
    }, [params.id])

    useEffect(() => {
        const fetchSites = async () => {
            try {
                const res = await fetch("/api/sites?isActive=true")
                const data = await res.json()
                setSites(Array.isArray(data) ? data : [])
            } catch {
                // Non-fatal — the current site is still preserved on save.
            } finally {
                setLoadingSites(false)
            }
        }
        fetchSites()
    }, [])

    useEffect(() => {
        const fetchPeople = async () => {
            try {
                const [mRes, iRes] = await Promise.all([
                    fetch("/api/users?role=MANAGER"),
                    fetch("/api/users?role=INSPECTION_BOY"),
                ])
                const mData = await mRes.json()
                const iData = await iRes.json()
                setManagers(Array.isArray(mData) ? mData : [])
                setInspectors(Array.isArray(iData) ? iData : [])
            } catch {
                // Non-fatal
            }
        }
        fetchPeople()
    }, [])

    const toggleId = (
        id: string,
        setter: React.Dispatch<React.SetStateAction<string[]>>
    ) => setter((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        setError("")
        try {
            const res = await fetch(`/api/projects/${params.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    description,
                    siteId: selectedSiteId,
                    managerIds: selectedManagerIds,
                    inspectorIds: selectedInspectorIds,
                }),
            })
            if (!res.ok) throw new Error("Failed to update")
            router.push("/projects")
            router.refresh()
        } catch {
            setError("Something went wrong. Please try again.")
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (!project) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
                <h1 className="text-2xl font-bold">Project not found</h1>
                <Link href="/projects" className="inline-flex items-center justify-center bg-white border border-[var(--border)] text-[var(--text2)] px-4 py-2 rounded-md text-sm hover:bg-[var(--surface2)]">
                    Go Back
                </Link>
            </div>
        )
    }

    const inputClasses = "w-full p-[10px_14px] bg-[var(--surface2)] border border-[var(--border)] rounded-[9px] text-[13px] text-[var(--text)] outline-none transition-all placeholder:text-[var(--text3)] focus:border-[var(--accent)] focus:bg-white focus:shadow-[0_0_0_3px_rgba(26,158,110,0.08)]"

    return (
        <div className="min-h-[calc(100vh-54px)] bg-[var(--bg)] py-[28px] px-[24px]">
            <div className="max-w-[520px] mx-auto w-full">
                {/* Header Row */}
                <div className="flex items-center gap-[14px] mb-[28px]">
                    <Link
                        href="/projects"
                        className="w-[32px] h-[32px] bg-white border border-[var(--border)] rounded-[8px] flex items-center justify-center shrink-0 hover:bg-[var(--surface2)] transition-colors"
                    >
                        <ChevronLeft className="h-4 w-4 text-[var(--text2)]" />
                    </Link>
                    <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[var(--text)]">
                        Edit Project
                    </h1>
                </div>

                {/* Form Card */}
                <div className="bg-white border border-[var(--border)] rounded-[14px] p-[28px] shadow-none">
                    <form onSubmit={handleSubmit}>
                        {/* Card Header */}
                        <div className="mb-[24px]">
                            <h2 className="text-[16px] font-semibold text-[var(--text)] mb-1">
                                Project Details
                            </h2>
                            <p className="text-[13px] text-[var(--text2)] leading-[1.5]">
                                Update the information for this project.
                            </p>
                        </div>

                        <div className="flex flex-col gap-[18px]">
                            {error && (
                                <div className="p-3 text-[13px] text-[var(--red)] bg-[var(--red-light)] border border-[#fca5a5] rounded-[9px]">
                                    {error}
                                </div>
                            )}

                            {/* Field: Name */}
                            <div className="flex flex-col gap-[6px]">
                                <label htmlFor="name" className="text-[13px] font-medium text-[var(--text)] block">
                                    Project Name <span className="text-[var(--red)] ml-[2px]">*</span>
                                </label>
                                <input
                                    id="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    placeholder="Project Alpha"
                                    className={inputClasses}
                                />
                            </div>

                            {/* Field: Description */}
                            <div className="flex flex-col gap-[6px]">
                                <label htmlFor="description" className="text-[13px] font-medium text-[var(--text)] block">
                                    Description
                                </label>
                                <textarea
                                    id="description"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Brief description of the project..."
                                    className={`${inputClasses} min-h-[90px] resize-y`}
                                />
                            </div>

                            {/* Field: Site Select */}
                            <div className="flex flex-col gap-[6px]">
                                <label htmlFor="siteId" className="text-[13px] font-medium text-[var(--text)] block">
                                    Site <span className="text-[var(--red)] ml-[2px]">*</span>
                                </label>
                                {loadingSites ? (
                                    <div className="flex items-center gap-2 text-[13px] text-[var(--text3)] h-[44px] px-[14px] rounded-[9px] border border-[var(--border)] bg-[var(--surface2)]">
                                        <Loader2 className="h-4 w-4 animate-spin" /> Loading sites...
                                    </div>
                                ) : sites.length === 0 ? (
                                    <div className="text-[13px] text-[var(--text2)] p-[10px_14px] rounded-[9px] border border-dashed border-[var(--border)] bg-[var(--surface2)]">
                                        No sites found. Create a Site first.
                                    </div>
                                ) : (
                                    <select
                                        id="siteId"
                                        value={selectedSiteId}
                                        onChange={(e) => setSelectedSiteId(e.target.value)}
                                        required
                                        className={`${inputClasses} appearance-none bg-no-repeat bg-[position:right_14px_center] pr-[36px] cursor-pointer`}
                                        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239e9b95' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")" }}
                                    >
                                        <option value="">Select a site...</option>
                                        {sites.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.name}{s.code ? ` (${s.code})` : ""}{s.city ? ` — ${s.city}` : ""}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            {/* Field: Managers */}
                            <div className="flex flex-col gap-[6px]">
                                <label className="text-[13px] font-medium text-[var(--text)] block">
                                    Managers
                                    {selectedManagerIds.length > 0 && (
                                        <span className="ml-[6px] text-[12px] text-[var(--text2)]">
                                            ({selectedManagerIds.length} selected)
                                        </span>
                                    )}
                                </label>
                                {managers.length === 0 ? (
                                    <div className="text-[13px] text-[var(--text2)] p-[10px_14px] rounded-[9px] border border-dashed border-[var(--border)] bg-[var(--surface2)]">
                                        No managers available.
                                    </div>
                                ) : (
                                    <div className="max-h-[160px] overflow-y-auto rounded-[9px] border border-[var(--border)] bg-[var(--surface2)]">
                                        {managers.map((m) => {
                                            const checked = selectedManagerIds.includes(m.id)
                                            return (
                                                <label
                                                    key={m.id}
                                                    className={`flex items-center gap-[10px] p-[9px_14px] border-b border-[var(--border)] last:border-0 cursor-pointer transition-colors ${checked ? "bg-[#f0fdf4]" : "hover:bg-white"}`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => toggleId(m.id, setSelectedManagerIds)}
                                                        className="accent-[var(--accent)] w-[15px] h-[15px]"
                                                    />
                                                    <span className="text-[13px] text-[var(--text)]">{m.name || "Unnamed"}</span>
                                                    {m.email && <span className="text-[12px] text-[var(--text3)]">({m.email})</span>}
                                                </label>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Field: Inspectors */}
                            <div className="flex flex-col gap-[6px]">
                                <label className="text-[13px] font-medium text-[var(--text)] block">
                                    Inspectors
                                    {selectedInspectorIds.length > 0 && (
                                        <span className="ml-[6px] text-[12px] text-[var(--text2)]">
                                            ({selectedInspectorIds.length} selected)
                                        </span>
                                    )}
                                </label>
                                {inspectors.length === 0 ? (
                                    <div className="text-[13px] text-[var(--text2)] p-[10px_14px] rounded-[9px] border border-dashed border-[var(--border)] bg-[var(--surface2)]">
                                        No inspectors available.
                                    </div>
                                ) : (
                                    <div className="max-h-[160px] overflow-y-auto rounded-[9px] border border-[var(--border)] bg-[var(--surface2)]">
                                        {inspectors.map((i) => {
                                            const checked = selectedInspectorIds.includes(i.id)
                                            return (
                                                <label
                                                    key={i.id}
                                                    className={`flex items-center gap-[10px] p-[9px_14px] border-b border-[var(--border)] last:border-0 cursor-pointer transition-colors ${checked ? "bg-[#f0fdf4]" : "hover:bg-white"}`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => toggleId(i.id, setSelectedInspectorIds)}
                                                        className="accent-[var(--accent)] w-[15px] h-[15px]"
                                                    />
                                                    <span className="text-[13px] text-[var(--text)]">{i.name || "Unnamed"}</span>
                                                    {i.email && <span className="text-[12px] text-[var(--text3)]">({i.email})</span>}
                                                </label>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Divider & Actions */}
                            <div className="border-t border-[var(--border)] mt-[8px] pt-[20px] flex justify-end gap-[10px]">
                                <Link
                                    href="/projects"
                                    className="inline-flex items-center justify-center bg-white border border-[var(--border)] text-[var(--text2)] px-[20px] py-[9px] rounded-[9px] text-[13px] font-medium cursor-pointer hover:bg-[var(--surface2)] hover:text-[var(--text)] transition-colors"
                                >
                                    Cancel
                                </Link>
                                <button
                                    type="submit"
                                    disabled={saving || !name.trim() || !selectedSiteId}
                                    className="inline-flex items-center justify-center bg-[var(--accent)] text-white border-0 px-[20px] py-[9px] rounded-[9px] text-[13px] font-medium cursor-pointer hover:bg-[#158a5e] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                                >
                                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
