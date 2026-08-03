"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import {
    Plus, Loader2, FolderOpen, Search, LayoutTemplate, Settings2,
    Pencil, Calendar, Building2, FolderKanban, MoreVertical,
    Users, ChevronLeft, ChevronRight, LayoutGrid, List, X, Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { can } from "@/lib/can"

type TeamMember = { id: string; name: string }

type Project = {
    id: string
    name: string
    description: string | null
    code?: string | null
    status?: string | null
    projectType?: string | null
    priority?: string | null
    createdAt: string
    company: { id: string; name: string }
    site: { id: string; name: string; code?: string | null; city?: string | null } | null
    team?: TeamMember[]
}

const STATUS_META: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
    ACTIVE: { label: "Active", bg: "#e8f7f1", fg: "#0d6b4a", dot: "#1a9e6e" },
    PLANNING: { label: "Planning", bg: "#eff6ff", fg: "#1d4ed8", dot: "#3b82f6" },
    ON_HOLD: { label: "On Hold", bg: "#fef2f2", fg: "#b91c1c", dot: "#ef4444" },
    COMPLETED: { label: "Completed", bg: "#f3f4f6", fg: "#374151", dot: "#6b7280" },
    ARCHIVED: { label: "Archived", bg: "#f3f4f6", fg: "#9ca3af", dot: "#9ca3af" },
}
const STATUS_FILTERS = ["ALL", "ACTIVE", "PLANNING", "ON_HOLD", "COMPLETED", "ARCHIVED"] as const

function StatusBadge({ status }: { status?: string | null }) {
    const meta = STATUS_META[status ?? "ACTIVE"] ?? STATUS_META.ACTIVE
    return (
        <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold" style={{ background: meta.bg, color: meta.fg }}>
            {meta.label}
        </span>
    )
}

const AVATAR_COLORS = ["#1a9e6e", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4"]

function TeamAvatars({ team }: { team?: TeamMember[] }) {
    const members = (team ?? []).filter(m => m.name)
    if (members.length === 0) return <span className="text-[11.5px] text-[var(--text3)]">—</span>
    const shown = members.slice(0, 3)
    return (
        <span className="flex items-center">
            {shown.map((m, i) => (
                <span
                    key={m.id}
                    title={m.name}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9.5px] font-bold border-2 border-white select-none"
                    style={{ background: AVATAR_COLORS[(m.name.charCodeAt(0) || 0) % AVATAR_COLORS.length], marginLeft: i > 0 ? -6 : 0 }}
                >
                    {m.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                </span>
            ))}
            {members.length > 3 && (
                <span className="text-[10.5px] font-semibold text-[var(--text2)] ml-1">+{members.length - 3}</span>
            )}
        </span>
    )
}

function ProjectMenu({ project, onDelete }: { project: Project; onDelete: () => void }) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener("mousedown", handler)
        return () => document.removeEventListener("mousedown", handler)
    }, [])
    return (
        <div className="relative" ref={ref}>
            <button onClick={() => setOpen(o => !o)}
                className="p-2 sm:p-1 rounded-[6px] hover:bg-[var(--surface2)] text-[var(--text3)] hover:text-[var(--text)] transition-colors">
                <MoreVertical size={15} />
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-[var(--border)] rounded-[10px] shadow-lg z-20 py-1 overflow-hidden">
                    <Link href={`/projects/${project.id}/edit`} className="flex items-center gap-2 px-3 py-2 text-[12.5px] text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)] transition-colors">
                        <Pencil size={13} /> Edit Project
                    </Link>
                    <Link href={`/projects/${project.id}/form-builder`} className="flex items-center gap-2 px-3 py-2 text-[12.5px] text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)] transition-colors">
                        <LayoutTemplate size={13} /> Form Builder
                    </Link>
                    <Link href={`/projects/${project.id}/report-config`} className="flex items-center gap-2 px-3 py-2 text-[12.5px] text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)] transition-colors">
                        <Settings2 size={13} /> Report Config
                    </Link>
                    <div className="my-1 border-t border-[var(--border)]" />
                    <button onClick={() => { setOpen(false); onDelete() }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] text-[var(--red)] hover:bg-red-50 transition-colors">
                        <Trash2 size={13} /> Delete Project
                    </button>
                </div>
            )}
        </div>
    )
}

export default function ProjectsPage() {
    const { data: session } = useSession()
    // Create / edit / delete needs the write permission, not just read access.
    const canManageProjects = can(session, "projects.manage")

    const [projects, setProjects] = useState<Project[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [siteFilter, setSiteFilter] = useState("all")
    const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("ALL")
    const [sortBy, setSortBy] = useState<"recent" | "oldest" | "name">("recent")
    const [view, setView] = useState<"grid" | "list">("grid")
    const [page, setPage] = useState(1)
    const [perPage, setPerPage] = useState(12)

    useEffect(() => { setPage(1) }, [search, siteFilter, statusFilter, perPage, sortBy])

    const fetchProjects = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch("/api/projects")
            const data = await res.json()
            setProjects(Array.isArray(data) ? data : [])
        } catch {
            setProjects([])
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchProjects() }, [fetchProjects])

    // Real sites only in the dropdown — never company names.
    const sites = useMemo(() => {
        const map = new Map<string, string>()
        projects.forEach(p => { if (p.site) map.set(p.site.id, p.site.name) })
        return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
    }, [projects])
    const hasNoSiteProjects = useMemo(() => projects.some(p => !p.site), [projects])

    // Status counts for the stats strip (over the full list, not filtered).
    const counts = useMemo(() => {
        const c: Record<string, number> = { total: projects.length, ACTIVE: 0, PLANNING: 0, ON_HOLD: 0, COMPLETED: 0, ARCHIVED: 0 }
        projects.forEach(p => { const s = p.status ?? "ACTIVE"; if (c[s] !== undefined) c[s]++ })
        return c
    }, [projects])

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        const list = projects.filter(p => {
            if (q && !(
                p.name.toLowerCase().includes(q) ||
                (p.description ?? "").toLowerCase().includes(q) ||
                (p.code ?? "").toLowerCase().includes(q) ||
                (p.site?.name ?? "").toLowerCase().includes(q)
            )) return false
            if (siteFilter === "no-site" && p.site) return false
            if (siteFilter !== "all" && siteFilter !== "no-site" && p.site?.id !== siteFilter) return false
            if (statusFilter !== "ALL" && (p.status ?? "ACTIVE") !== statusFilter) return false
            return true
        })
        list.sort((a, b) => {
            if (sortBy === "name") return a.name.localeCompare(b.name)
            const d = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            return sortBy === "oldest" ? d : -d
        })
        return list
    }, [projects, search, siteFilter, statusFilter, sortBy])

    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
    const safePage = Math.min(page, totalPages)
    const pageProjects = filtered.slice((safePage - 1) * perPage, safePage * perPage)
    const showFrom = filtered.length === 0 ? 0 : (safePage - 1) * perPage + 1
    const showTo = Math.min(safePage * perPage, filtered.length)

    const hasFilters = search !== "" || siteFilter !== "all" || statusFilter !== "ALL"
    const clearAll = () => { setSearch(""); setSiteFilter("all"); setStatusFilter("ALL") }

    const handleDelete = async (project: Project) => {
        if (!confirm(
            `Delete project "${project.name}"?\n\nThis permanently removes the project along with its assignments, inspections, form templates and reports. This cannot be undone.`
        )) return
        try {
            const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" })
            if (!res.ok) throw new Error(await res.text() || "Failed to delete")
            toast.success(`Project "${project.name}" deleted`)
            fetchProjects()
        } catch (e) {
            toast.error((e as Error).message || "Failed to delete project")
        }
    }

    const fmtDate = (s: string) =>
        new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
            </div>
        )
    }

    const actionBtn = "inline-flex items-center gap-1.5 px-2.5 h-8 rounded-[8px] border border-[var(--border)] bg-white text-[11.5px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)] transition-colors"

    const renderCard = (project: Project) => (
        <div key={project.id} className="bg-white border border-[var(--border)] rounded-[14px] p-4 hover:shadow-[0_4px_18px_rgba(0,0,0,0.06)] transition-all flex flex-col">
            <div className="flex items-start justify-between gap-2 mb-1.5">
                <h3 className="text-[14.5px] font-bold text-[var(--text)] uppercase tracking-[0.2px] leading-tight truncate">{project.name}</h3>
                <div className="flex items-center gap-1 shrink-0">
                    <StatusBadge status={project.status} />
                    {canManageProjects && <ProjectMenu project={project} onDelete={() => handleDelete(project)} />}
                </div>
            </div>
            <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--text2)] mb-2 truncate">
                <Building2 size={12} className="text-[var(--text3)] shrink-0" />
                {project.site ? `${project.site.name}${project.site.code ? ` (${project.site.code})` : ""}` : "No site linked"}
            </p>
            <p className="text-[12px] text-[var(--text3)] leading-snug line-clamp-2 mb-3 min-h-[32px]">
                {project.description || "No description provided."}
            </p>
            <div className="grid grid-cols-3 gap-2 mb-3">
                <div>
                    <p className="text-[10px] text-[var(--text3)] font-medium mb-0.5">Created</p>
                    <p className="text-[11.5px] text-[var(--text2)] font-medium flex items-center gap-1">
                        <Calendar size={11} className="text-[var(--text3)]" /> {fmtDate(project.createdAt)}
                    </p>
                </div>
                <div>
                    <p className="text-[10px] text-[var(--text3)] font-medium mb-0.5">Type</p>
                    <p className="text-[11.5px] text-[var(--text2)] font-medium truncate">{project.projectType || "—"}</p>
                </div>
                <div>
                    <p className="text-[10px] text-[var(--text3)] font-medium mb-0.5">Team</p>
                    <TeamAvatars team={project.team} />
                </div>
            </div>
            {canManageProjects && (
                <div className="flex flex-wrap items-center gap-1.5 mt-auto pt-1">
                    <Link href={`/projects/${project.id}/form-builder`} className={actionBtn}>
                        <LayoutTemplate size={12} /> Form Builder
                    </Link>
                    <Link href={`/projects/${project.id}/report-config`} className={actionBtn}>
                        <Settings2 size={12} /> Report Config
                    </Link>
                    <Link href={`/projects/${project.id}/edit`} className={actionBtn}>
                        <Users size={12} /> Assign Team
                    </Link>
                    <Link href={`/projects/${project.id}/edit`} className={actionBtn + " ml-auto px-2"} title="Edit project">
                        <Pencil size={12} />
                    </Link>
                </div>
            )}
        </div>
    )

    return (
        <div className="p-4 lg:p-0 space-y-4 pb-8">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-[24px] font-semibold tracking-[-0.4px] text-[var(--text)] flex items-center gap-2">
                        <FolderKanban className="h-6 w-6 text-[var(--accent)]" />
                        Projects
                    </h1>
                    <p className="text-[13px] text-[var(--text3)] mt-0.5">Manage inspection projects across client sites.</p>
                </div>
                {canManageProjects && (
                    <Link href="/projects/create"
                        className="inline-flex items-center gap-2 bg-[var(--accent)] text-white rounded-[10px] text-[13px] font-medium px-4 py-2 hover:opacity-90 transition-opacity">
                        <Plus size={16} /> New Project
                    </Link>
                )}
            </div>

            {/* Filters + stats strip */}
            <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-3 items-stretch">
                <div className="bg-white border border-[var(--border)] rounded-[12px] p-3 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                        <div className="relative flex-1 min-w-[180px]">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects..."
                                className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface2)]/30 pl-8 pr-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text3)]" />
                        </div>
                        <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)}
                            className="h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] cursor-pointer min-w-[140px]">
                            <option value="all">All Sites</option>
                            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            {hasNoSiteProjects && <option value="no-site">No Site</option>}
                        </select>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[12px] font-medium text-[var(--text2)]">Status:</span>
                        <div className="flex items-center gap-1 bg-[var(--surface2)] rounded-[8px] p-1 flex-wrap">
                            {STATUS_FILTERS.map(s => (
                                <button key={s} onClick={() => setStatusFilter(s)}
                                    className={`px-2.5 py-1 rounded-[6px] text-[12px] font-medium transition-colors ${
                                        statusFilter === s
                                            ? "bg-white text-[var(--text)] shadow-sm border border-[var(--border)]"
                                            : "text-[var(--text2)] hover:text-[var(--text)]"
                                    }`}>
                                    {s === "ALL" ? "All" : STATUS_META[s].label}
                                </button>
                            ))}
                        </div>
                        {hasFilters && (
                            <button onClick={clearAll} className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--accent)] hover:underline ml-1">
                                <X size={12} /> Clear all
                            </button>
                        )}
                    </div>
                </div>

                {/* Stats strip */}
                <div className="bg-white border border-[var(--border)] rounded-[12px] p-3 flex items-center justify-around gap-2 flex-wrap">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-[9px] bg-[var(--surface2)] flex items-center justify-center">
                            <FolderKanban size={16} className="text-[var(--text2)]" />
                        </div>
                        <div>
                            <p className="text-[20px] font-bold text-[var(--text)] leading-none tabular-nums">{counts.total}</p>
                            <p className="text-[10.5px] text-[var(--text3)] mt-0.5">Total Projects</p>
                        </div>
                    </div>
                    {(["ACTIVE", "PLANNING", "ON_HOLD", "COMPLETED"] as const).map(s => (
                        <div key={s}>
                            <p className="text-[18px] font-bold text-[var(--text)] leading-none tabular-nums flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full inline-block" style={{ background: STATUS_META[s].dot }} />
                                {counts[s]}
                            </p>
                            <p className="text-[10.5px] text-[var(--text3)] mt-0.5">{STATUS_META[s].label}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* List header: count + sort + view toggle */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-[15px] font-semibold text-[var(--text)]">All Projects ({filtered.length})</h2>
                <div className="flex items-center gap-2">
                    <label className="text-[12px] text-[var(--text3)]">Sort by:</label>
                    <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
                        className="h-8 rounded-[8px] border border-[var(--border)] bg-white px-2 text-[12.5px] text-[var(--text2)] outline-none cursor-pointer">
                        <option value="recent">Recently Created</option>
                        <option value="oldest">Oldest First</option>
                        <option value="name">Name A–Z</option>
                    </select>
                    <div className="flex items-center gap-0.5 bg-[var(--surface2)] rounded-[8px] p-0.5">
                        <button onClick={() => setView("grid")} title="Grid view"
                            className={`p-1.5 rounded-[6px] transition-colors ${view === "grid" ? "bg-[var(--accent)] text-white" : "text-[var(--text3)] hover:text-[var(--text)]"}`}>
                            <LayoutGrid size={14} />
                        </button>
                        <button onClick={() => setView("list")} title="List view"
                            className={`p-1.5 rounded-[6px] transition-colors ${view === "list" ? "bg-[var(--accent)] text-white" : "text-[var(--text3)] hover:text-[var(--text)]"}`}>
                            <List size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Content */}
            {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[36vh] gap-4 rounded-[14px] border-2 border-dashed border-[var(--border)] bg-white p-8 text-center">
                    <FolderOpen className="h-12 w-12 text-[var(--text3)] opacity-40" />
                    <div>
                        <p className="text-[15px] font-semibold text-[var(--text)]">No projects found</p>
                        <p className="text-[13px] text-[var(--text3)] mt-1">
                            {hasFilters ? "Try adjusting your filters." : "Create your first project to get started."}
                        </p>
                    </div>
                    {canManageProjects && !hasFilters && (
                        <Link href="/projects/create"
                            className="inline-flex items-center gap-2 bg-[var(--accent)] text-white rounded-[10px] text-[13px] font-medium px-4 py-2 hover:opacity-90 transition-opacity">
                            <Plus size={15} /> Create Project
                        </Link>
                    )}
                </div>
            ) : (
                <>
                    <div className={view === "grid" ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" : "grid grid-cols-1 gap-3"}>
                        {pageProjects.map(renderCard)}
                    </div>

                    {/* Pagination */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <p className="text-[12.5px] text-[var(--text3)]">
                            Showing {showFrom} to {showTo} of {filtered.length} project{filtered.length !== 1 ? "s" : ""}
                        </p>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
                                className="w-8 h-8 flex items-center justify-center rounded-[8px] border border-[var(--border)] bg-white text-[var(--text2)] hover:bg-[var(--surface2)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                                <ChevronLeft size={14} />
                            </button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter(p => totalPages <= 7 || Math.abs(p - safePage) <= 2 || p === 1 || p === totalPages)
                                .map((p, idx, arr) => (
                                    <span key={p} className="flex items-center gap-2">
                                        {idx > 0 && arr[idx - 1] !== p - 1 && <span className="text-[12px] text-[var(--text3)]">…</span>}
                                        <button onClick={() => setPage(p)}
                                            className={`min-w-8 h-8 px-2 rounded-[8px] text-[12.5px] font-medium border transition-colors ${
                                                p === safePage
                                                    ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                                                    : "bg-white border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)]"
                                            }`}>
                                            {p}
                                        </button>
                                    </span>
                                ))}
                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                                className="w-8 h-8 flex items-center justify-center rounded-[8px] border border-[var(--border)] bg-white text-[var(--text2)] hover:bg-[var(--surface2)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                                <ChevronRight size={14} />
                            </button>
                            <select value={perPage} onChange={e => setPerPage(Number(e.target.value))}
                                className="h-8 rounded-[8px] border border-[var(--border)] bg-white px-2 text-[12.5px] text-[var(--text2)] outline-none cursor-pointer">
                                {[12, 24, 48].map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
