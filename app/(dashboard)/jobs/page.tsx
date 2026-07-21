"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { can } from "@/lib/can"
import {
    Plus, Search, Loader2, Briefcase, MapPin, IndianRupee, Users, Target,
    Pencil, Copy, Trash2, CalendarClock, Send, FileText, Lock, Eye,
    MoreHorizontal, LayoutGrid, List, ArrowUpRight, ArrowDownRight,
    ChevronLeft, ChevronRight, SlidersHorizontal, Download, FileStack,
} from "lucide-react"
import {
    JobPosting, STATUS_META, formatExperience, formatSalary, priorityStyle,
} from "@/components/jobs/constants"

const STATUS_FILTERS = ["ALL", "PUBLISHED", "DRAFT", "CLOSED"] as const

// Month-over-month delta for a subset of jobs (from createdAt).
function monthStats(list: JobPosting[], pred: (j: JobPosting) => boolean) {
    const now = new Date()
    const thisStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    let thisC = 0, lastC = 0
    for (const j of list) {
        if (!pred(j)) continue
        const d = new Date(j.createdAt)
        if (d >= thisStart) thisC++
        else if (d >= lastStart) lastC++
    }
    const delta = thisC - lastC
    const pct = lastC > 0 ? Math.round((delta / lastC) * 100) : (thisC > 0 ? 100 : 0)
    return { delta, pct }
}

export default function JobsPage() {
    const router = useRouter()
    const { data: session } = useSession()
    const canView = can(session, "jobs.view")
    const canManage = can(session, "jobs.manage")

    const [jobs, setJobs] = useState<JobPosting[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("ALL")
    const [deptFilter, setDeptFilter] = useState("ALL")
    const [locFilter, setLocFilter] = useState("ALL")
    const [prioFilter, setPrioFilter] = useState("ALL")
    const [view, setView] = useState<"grid" | "list">("grid")
    const [page, setPage] = useState(1)
    const [perPage, setPerPage] = useState(9)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    // Fetch every job once, then filter/paginate on the client so the KPI cards
    // and filters always reflect the full data set.
    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch("/api/jobs")
            if (!res.ok) throw new Error()
            setJobs(await res.json())
        } catch {
            toast.error("Failed to load jobs")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { if (canView) load() }, [load, canView])
    useEffect(() => { setPage(1) }, [status, search, deptFilter, locFilter, prioFilter, perPage])

    const goTo = (e: React.MouseEvent, href: string) => { e.preventDefault(); e.stopPropagation(); router.push(href) }
    const removeJob = async (e: React.MouseEvent, id: string, title: string) => {
        e.preventDefault(); e.stopPropagation()
        if (!confirm(`Delete "${title}"? This cannot be undone.`)) return
        setDeletingId(id)
        try {
            const res = await fetch(`/api/jobs/${id}`, { method: "DELETE" })
            if (!res.ok) throw new Error()
            toast.success("Job deleted")
            setJobs(prev => prev.filter(j => j.id !== id))
        } catch {
            toast.error("Delete failed")
        } finally {
            setDeletingId(null)
        }
    }

    // KPI counts + trends (over the full set).
    const kpis = useMemo(() => {
        const total = jobs.length
        const published = jobs.filter(j => j.status === "PUBLISHED").length
        const draft = jobs.filter(j => j.status === "DRAFT").length
        const closed = jobs.filter(j => j.status === "CLOSED").length
        return [
            { label: "Total Jobs", value: total,     icon: Briefcase, color: "#1a9e6e", bg: "#e8f7f1", ...monthStats(jobs, () => true) },
            { label: "Published",  value: published, icon: Send,      color: "#1a9e6e", bg: "#e8f7f1", ...monthStats(jobs, j => j.status === "PUBLISHED") },
            { label: "Draft",      value: draft,     icon: FileText,  color: "#d97706", bg: "#fef3c7", ...monthStats(jobs, j => j.status === "DRAFT") },
            { label: "Closed",     value: closed,    icon: Lock,      color: "#7c3aed", bg: "#f3e8ff", ...monthStats(jobs, j => j.status === "CLOSED") },
        ]
    }, [jobs])

    const departments = useMemo(() => Array.from(new Set(jobs.map(j => j.department).filter(Boolean) as string[])).sort(), [jobs])
    const locations = useMemo(() => Array.from(new Set(jobs.map(j => j.jobLocation).filter(Boolean) as string[])).sort(), [jobs])

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        return jobs.filter(j => {
            if (status !== "ALL" && j.status !== status) return false
            if (deptFilter !== "ALL" && j.department !== deptFilter) return false
            if (locFilter !== "ALL" && j.jobLocation !== locFilter) return false
            if (prioFilter !== "ALL" && (j.priority || "MEDIUM").toUpperCase() !== prioFilter) return false
            if (q && !`${j.title} ${j.jobRole || ""} ${j.department || ""} ${j.jobLocation || ""} ${j.siteName || ""}`.toLowerCase().includes(q)) return false
            return true
        })
    }, [jobs, status, deptFilter, locFilter, prioFilter, search])

    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
    const safePage = Math.min(page, totalPages)
    const pageJobs = filtered.slice((safePage - 1) * perPage, safePage * perPage)

    const exportCsv = () => {
        const rows = [["Title", "Department", "Location", "Site", "Priority", "Status", "Openings", "Closes"]]
        for (const j of filtered) rows.push([
            j.title, j.department || "", j.jobLocation || "", j.siteName || "",
            (j.priority || "MEDIUM"), j.status, String(j.openings),
            j.deadline ? new Date(j.deadline).toLocaleDateString("en-IN") : "",
        ])
        const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
        const a = document.createElement("a")
        a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
        a.download = `jobs_${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        toast.success(`Exported ${filtered.length} jobs`)
    }

    if (!canView) {
        return <div className="p-8 text-center text-[var(--text2)]">You don&apos;t have access to job postings.</div>
    }

    const selCls = "h-9 px-3 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] text-[12.5px] text-[var(--text2)] outline-none cursor-pointer"

    return (
        <div className="p-4 lg:p-0 flex flex-col gap-5">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-[26px] font-bold text-[var(--text)] tracking-[-0.5px]">Jobs</h1>
                    <p className="text-[13.5px] text-[var(--text3)] mt-1">Manage internal job postings across departments and sites.</p>
                </div>
                <div className="flex items-center gap-2.5">
                    <button onClick={exportCsv}
                        className="inline-flex items-center gap-2 h-[42px] px-4 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] text-[13px] font-semibold text-[var(--text2)] hover:bg-[var(--surface2)]">
                        <Download size={16} /> Export
                    </button>
                    {canManage && (
                        <button onClick={() => toast.info("Manage Templates coming soon")}
                            className="inline-flex items-center gap-2 h-[42px] px-4 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] text-[13px] font-semibold text-[var(--text2)] hover:bg-[var(--surface2)]">
                            <FileStack size={16} /> Manage Templates
                        </button>
                    )}
                    {canManage && (
                        <Link href="/jobs/new"
                            className="inline-flex items-center gap-2 h-[42px] px-5 rounded-[10px] bg-[var(--accent)] text-white text-[13px] font-semibold hover:opacity-90"
                            style={{ boxShadow: "0 1px 3px rgba(26,158,110,0.35)" }}>
                            <Plus size={16} /> Post a Job
                        </Link>
                    )}
                </div>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                {kpis.map(s => (
                    <div key={s.label} className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-[18px] flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-[13px] flex items-center justify-center shrink-0" style={{ background: s.bg }}>
                            <s.icon size={22} style={{ color: s.color }} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[12.5px] text-[var(--text3)]">{s.label}</p>
                            <div className="flex items-baseline gap-2">
                                <span className="text-[26px] font-bold text-[var(--text)] leading-none tabular-nums">{s.value}</span>
                                {s.pct !== 0 && (
                                    <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold" style={{ color: s.pct >= 0 ? "#15803d" : "#dc2626" }}>
                                        {s.pct >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(s.pct)}%
                                    </span>
                                )}
                            </div>
                            <p className="text-[11px] text-[var(--text3)] mt-0.5">{s.delta >= 0 ? "+" : ""}{s.delta} vs last month</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative flex-1 min-w-[220px] max-w-[340px]">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search by title, role, department or location..."
                        className="w-full h-9 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] pl-9 pr-3 text-[13px] outline-none focus:border-[var(--accent)]" />
                </div>
                <div className="flex items-center gap-1.5">
                    {STATUS_FILTERS.map(s => (
                        <button key={s} onClick={() => setStatus(s)}
                            className={`px-3.5 h-9 rounded-[9px] text-[12.5px] font-semibold transition-colors ${status === s ? "bg-[var(--accent)] text-white" : "text-[var(--text2)] hover:bg-[var(--surface2)]"}`}>
                            {s === "ALL" ? "All" : STATUS_META[s].label}
                        </button>
                    ))}
                </div>
                <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className={selCls}>
                    <option value="ALL">All Departments</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <select value={locFilter} onChange={e => setLocFilter(e.target.value)} className={selCls}>
                    <option value="ALL">All Locations</option>
                    {locations.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <select value={prioFilter} onChange={e => setPrioFilter(e.target.value)} className={selCls}>
                    <option value="ALL">All Priorities</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                </select>
                <button className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] text-[12.5px] font-semibold text-[var(--text2)] hover:bg-[var(--surface2)]">
                    <SlidersHorizontal size={14} /> Filters
                </button>
                <div className="flex items-center gap-1 border border-[var(--border)] rounded-[9px] p-0.5 bg-[var(--surface)]">
                    <button onClick={() => setView("grid")} title="Grid"
                        className="w-8 h-8 rounded-[7px] flex items-center justify-center" style={{ background: view === "grid" ? "var(--accent-light,#e8f7f1)" : "transparent", color: view === "grid" ? "var(--accent)" : "var(--text3)" }}>
                        <LayoutGrid size={16} />
                    </button>
                    <button onClick={() => setView("list")} title="List"
                        className="w-8 h-8 rounded-[7px] flex items-center justify-center" style={{ background: view === "list" ? "var(--accent-light,#e8f7f1)" : "transparent", color: view === "list" ? "var(--accent)" : "var(--text3)" }}>
                        <List size={16} />
                    </button>
                </div>
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center py-20 text-[var(--text3)]"><Loader2 className="animate-spin" /></div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="h-14 w-14 rounded-full bg-[var(--surface2)] flex items-center justify-center mb-3">
                        <Target className="text-[var(--text3)]" />
                    </div>
                    <p className="text-[var(--text)] font-medium">No jobs found</p>
                    <p className="text-[13px] text-[var(--text3)] mt-1">{canManage ? "Post your first internal opening to get started." : "Check back later for openings."}</p>
                    {canManage && (
                        <Link href="/jobs/new" className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-[13px] font-medium">
                            <Plus size={16} /> Post a Job
                        </Link>
                    )}
                </div>
            ) : (
                <div className={view === "grid" ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" : "flex flex-col gap-3"}>
                    {pageJobs.map(job => {
                        const meta = STATUS_META[job.status]
                        const p = priorityStyle(job.priority)
                        const closes = job.deadline ? new Date(job.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null
                        return (
                            <div key={job.id}
                                className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-5 hover:shadow-md hover:border-[var(--accent)]/40 transition-all cursor-pointer"
                                onClick={() => router.push(`/jobs/${job.id}`)}>
                                {/* Title + badges */}
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-[15.5px] text-[var(--text)] truncate">{job.title}</h3>
                                        {job.department && <p className="text-[12.5px] text-[var(--text3)] mt-0.5 truncate">{job.department}</p>}
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: p.bg, color: p.text }}>
                                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.dot }} /> {p.label}
                                        </span>
                                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span>
                                    </div>
                                </div>

                                {/* Exp + salary */}
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3.5 text-[12.5px] text-[var(--text2)]">
                                    <span className="inline-flex items-center gap-1.5"><Briefcase size={13} className="text-[var(--text3)]" />{formatExperience(job.workExpMin, job.workExpMax, job.freshersAllowed)}</span>
                                    <span className="inline-flex items-center gap-1.5"><IndianRupee size={13} className="text-[var(--text3)]" />{formatSalary(job.salaryMin, job.salaryMax, job.salaryPeriod)}</span>
                                </div>

                                {/* Location + site */}
                                {(job.jobLocation || job.siteName) && (
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-[12.5px] text-[var(--text2)]">
                                        {job.jobLocation && <span className="inline-flex items-center gap-1.5"><MapPin size={13} className="text-[var(--text3)]" />{job.jobLocation}</span>}
                                        {job.siteName && <span className="inline-flex items-center gap-1.5"><Briefcase size={13} className="text-[var(--text3)]" />{job.siteName}</span>}
                                    </div>
                                )}

                                {/* Closes + openings */}
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-[12.5px]">
                                    {closes && <span className="inline-flex items-center gap-1.5 font-semibold text-[#dc2626]"><CalendarClock size={13} />Closes {closes}</span>}
                                    <span className="inline-flex items-center gap-1.5 text-[var(--text2)]"><Users size={13} className="text-[var(--text3)]" />{job.openings} opening{job.openings === 1 ? "" : "s"}</span>
                                </div>

                                {/* Skills */}
                                {job.skills?.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-3">
                                        {job.skills.slice(0, 3).map(s => (
                                            <span key={s} className="px-2.5 py-1 rounded-[7px] bg-[var(--surface2)] text-[11px] font-medium text-[var(--text2)]">{s}</span>
                                        ))}
                                        {job.skills.length > 3 && <span className="px-2.5 py-1 rounded-[7px] bg-[var(--surface2)] text-[11px] font-medium text-[var(--text3)]">+{job.skills.length - 3}</span>}
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[var(--border)]">
                                    <button onClick={e => goTo(e, `/jobs/${job.id}`)}
                                        className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-[9px] border border-[var(--border)] text-[12.5px] font-semibold text-[var(--text2)] hover:bg-[var(--surface2)]">
                                        <Eye size={14} /> View
                                    </button>
                                    {canManage && <>
                                        <button onClick={e => goTo(e, `/jobs/new?id=${job.id}`)}
                                            className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-[9px] border border-[var(--border)] text-[12.5px] font-semibold text-[var(--text2)] hover:bg-[var(--surface2)]">
                                            <Pencil size={14} /> Edit
                                        </button>
                                        <button onClick={e => goTo(e, `/jobs/new?duplicate=${job.id}`)}
                                            className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-[9px] border border-[var(--border)] text-[12.5px] font-semibold text-[var(--text2)] hover:bg-[var(--surface2)]">
                                            <Copy size={14} /> Duplicate
                                        </button>
                                        <button onClick={e => removeJob(e, job.id, job.title)} disabled={deletingId === job.id} title="Delete"
                                            className="inline-flex items-center justify-center w-9 h-9 rounded-[9px] border border-[var(--border)] text-[var(--text3)] hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                                            {deletingId === job.id ? <Loader2 size={14} className="animate-spin" /> : <MoreHorizontal size={16} />}
                                        </button>
                                    </>}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Pagination */}
            {!loading && filtered.length > 0 && (
                <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
                    <span className="text-[12.5px] text-[var(--text3)]">
                        Showing {(safePage - 1) * perPage + 1} to {(safePage - 1) * perPage + pageJobs.length} of {filtered.length} jobs
                    </span>
                    <div className="flex items-center gap-3">
                        {totalPages > 1 && (
                            <div className="flex items-center gap-1.5">
                                <button disabled={safePage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                                    className="w-9 h-9 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] flex items-center justify-center text-[var(--text2)] disabled:opacity-40">
                                    <ChevronLeft size={16} />
                                </button>
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                    const start = Math.max(1, Math.min(totalPages - 4, safePage - 2))
                                    const pnum = start + i
                                    if (pnum > totalPages) return null
                                    return (
                                        <button key={pnum} onClick={() => setPage(pnum)}
                                            className="min-w-[36px] h-9 rounded-[9px] text-[13px] font-semibold"
                                            style={{
                                                border: pnum === safePage ? "1px solid var(--accent)" : "1px solid var(--border)",
                                                background: pnum === safePage ? "var(--accent)" : "var(--surface)",
                                                color: pnum === safePage ? "#fff" : "var(--text2)",
                                            }}>{pnum}</button>
                                    )
                                })}
                                {totalPages > 5 && safePage < totalPages - 2 && <>
                                    <span className="text-[var(--text3)] px-1">…</span>
                                    <button onClick={() => setPage(totalPages)} className="min-w-[36px] h-9 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] text-[13px] font-semibold text-[var(--text2)]">{totalPages}</button>
                                </>}
                                <button disabled={safePage === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    className="w-9 h-9 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] flex items-center justify-center text-[var(--text2)] disabled:opacity-40">
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        )}
                        <select value={perPage} onChange={e => setPerPage(Number(e.target.value))} className={selCls}>
                            {[9, 18, 36].map(n => <option key={n} value={n}>{n} per page</option>)}
                        </select>
                    </div>
                </div>
            )}
        </div>
    )
}
