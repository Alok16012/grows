
"use client"

import { liveSearchParam } from "@/lib/utils"
import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import {
    CheckCircle2,
    XCircle,
    ChevronRight,
    Loader2,
    Search,
    ClipboardCheck,
    X
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { can, canAny } from "@/lib/can"
import { toast } from "sonner"
import Link from "next/link"

export default function ApprovalsPage({ searchParams }: { searchParams?: { date?: string } }) {
    const { data: session, status: authStatus } = useSession()
    const router = useRouter()
    // ?date=today (from the dashboard's "Inspections today") shows every report
    // submitted today, whatever its status, not just the pending queue.
    // Live URL first: the prerendered page gets an empty searchParams prop on Vercel.
    const dateParamToday = liveSearchParam("date", searchParams?.date) === "today"
    const [todayOnly, setTodayOnly] = useState(dateParamToday)

    const [inspections, setInspections] = useState<any[]>([])
    const [counts, setCounts] = useState<Record<string, number>>({
        pending: 0,
        approved: 0,
        rejected: 0,
        all: 0
    })
    const [loading, setLoading] = useState(true)
    // Approval target (Approvals → Settings), overdue filter and bulk approve.
    const [targetHours, setTargetHours] = useState(24)
    const [overdueOnly, setOverdueOnly] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("overdue") === "1")
    const [picked, setPicked] = useState<Set<string>>(new Set())
    const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null)
    const canDecide = canAny(session, ["approvals.manage"])
    const waited = (iso?: string | null) => {
        if (!iso) return null
        const h = (Date.now() - new Date(iso).getTime()) / 3_600_000
        return { h, label: h < 1 ? "< 1 h" : h < 48 ? `${Math.floor(h)} h` : `${Math.floor(h / 24)} d ${Math.floor(h % 24)} h`, overdue: h > targetHours }
    }
    const bulkApprove = async () => {
        const ids = Array.from(picked)
        if (!ids.length || !confirm(`Approve ${ids.length} inspection report${ids.length === 1 ? "" : "s"}?`)) return
        let ok = 0
        setBulk({ done: 0, total: ids.length })
        for (let i = 0; i < ids.length; i++) {
            try {
                const res = await fetch(`/api/approvals/${ids[i]}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve" }) })
                if (res.ok) ok++
            } catch { /* counted as not approved */ }
            setBulk({ done: i + 1, total: ids.length })
        }
        setBulk(null)
        toast.success(`${ok} of ${ids.length} approved`)
        fetchData(activeTab, page, debouncedQuery)
    }
    const [searchQuery, setSearchQuery] = useState("")
    // Submitted-date range (YYYY-MM-DD); either end may be left open.
    const [dateFrom, setDateFrom] = useState("")
    const [dateTo, setDateTo] = useState("")
    // Paging: the queue used to request a single page of 100 and show nothing
    // past it, so on a long queue the older reports could never be reached.
    const PAGE_SIZE = 50
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    // Search runs on the server (all pages); debounced so typing doesn't refetch per key.
    const [debouncedQuery, setDebouncedQuery] = useState("")
    useEffect(() => {
        const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 350)
        return () => clearTimeout(t)
    }, [searchQuery])
    const [activeTab, setActiveTab] = useState(dateParamToday ? "all" : "pending")
    useEffect(() => { setPage(1) }, [activeTab, debouncedQuery, todayOnly, dateFrom, dateTo])

    // Picking dates replaces the dashboard's "Submitted today" shortcut.
    const changeDate = (which: "from" | "to", value: string) => {
        if (todayOnly) {
            setTodayOnly(false)
            router.replace("/approvals")
        }
        if (which === "from") setDateFrom(value)
        else setDateTo(value)
    }
    const clearDates = () => { setDateFrom(""); setDateTo("") }
    // Who gave the verdict. One column whatever the tab — on All, the Status
    // badge says which verdict it was (two columns squeezed the table on laptops).
    const reviewerHeader = activeTab === "approved" ? "Approved By"
        : activeTab === "rejected" ? "Rejected By"
        : activeTab === "all" ? "Approved / Rejected By" : null

    // Client-side navigation to /approvals?date=today while already here.
    useEffect(() => {
        setTodayOnly(dateParamToday)
        if (dateParamToday) setActiveTab("all")
    }, [dateParamToday])

    const clearToday = () => {
        setTodayOnly(false)
        setActiveTab("pending")
        router.replace("/approvals")
    }

    useEffect(() => {
        if (authStatus === "unauthenticated") {
            router.push("/login")
        } else if (authStatus === "authenticated" && !can(session, "approvals.view")) {
            // Match the API, which gates this queue on `approvals.view`.
            // Blocking on "is an inspector" instead was too wide: a lead who
            // reviews submissions holds an inspection permission AND approvals.view,
            // and was bounced off a screen they are meant to run.
            router.push("/")
        }
    }, [authStatus, session, router])

    const fetchData = async (status: string, pageNo: number = page, q: string = debouncedQuery) => {
        setLoading(true)
        try {
            if (todayOnly) {
                // Today's list is small: fetch all statuses once and derive the tab counts from it.
                const res = await fetch("/api/approvals?date=today")
                const data = await res.json()
                const all: any[] = Array.isArray(data) ? data : []
                const rows = status === "all" ? all : all.filter(i => i.status === status)
                setInspections(rows)
                setTotal(rows.length)
                setCounts({
                    pending: all.filter(i => i.status === "pending").length,
                    approved: all.filter(i => i.status === "approved").length,
                    rejected: all.filter(i => i.status === "rejected").length,
                    all: all.length
                })
                return
            }
            const params = new URLSearchParams({ status, page: String(pageNo), limit: String(PAGE_SIZE), withCounts: "true" })
            if (status === "pending") params.set("oldest", "1")
            if (overdueOnly && status === "pending") params.set("overdue", "1")
            if (q) params.set("q", q)
            if (dateFrom) params.set("from", dateFrom)
            if (dateTo) params.set("to", dateTo)
            const res = await fetch(`/api/inspections/all?${params}`)
            const data = await res.json()

            const items = data?.inspections ?? (Array.isArray(data) ? data : [])
            setInspections(items)
            if (typeof data?.targetHours === "number") setTargetHours(data.targetHours)
            setPicked(new Set())
            setTotal(typeof data?.total === "number" ? data.total : items.length)

            if (data?.counts) {
                setCounts({
                    pending: data.counts.pending ?? 0,
                    overdue: data.counts.overdue ?? 0,
                    approved: data.counts.approved ?? 0,
                    rejected: data.counts.rejected ?? 0,
                    all: data.counts.all ?? 0
                })
            }
        } catch (error) {
            console.error("Failed to fetch approvals", error)
        } finally {
            setLoading(false)
        }
    }

    // Clicking anywhere on a report's row (or card, on a phone) opens it, not
    // only the small arrow. Approve / Reject / the arrow keep their own click,
    // selecting text to copy doesn't navigate, and Ctrl/⌘ or middle-click opens
    // a new tab like a link. The arrow stays as the keyboard way in.
    const openReport = (e: React.MouseEvent, id: string) => {
        if ((e.target as HTMLElement).closest("button, a, input, select, textarea, label")) return
        if (window.getSelection()?.toString()) return
        const href = `/approvals/${id}`
        if (e.ctrlKey || e.metaKey || e.button === 1) window.open(href, "_blank", "noopener")
        else if (e.button === 0) router.push(href)
    }

    // Quick approve/reject from the list. Goes through /api/approvals/[id]
    // (permission: approvals.manage) — NOT /api/inspections/[id], which only
    // the admin or the submitting inspector may PATCH.
    const quickAction = async (id: string, action: "approve" | "reject") => {
        let reviewerNotes = ""
        if (action === "reject") {
            const reason = prompt("Reason for rejection:")
            if (!reason || !reason.trim()) return
            reviewerNotes = reason.trim()
        } else if (!confirm("Approve this inspection?")) {
            return
        }
        try {
            const res = await fetch(`/api/approvals/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, reviewerNotes }),
            })
            if (res.ok) fetchData(activeTab, page, debouncedQuery)
            else {
                const err = await res.json().catch(() => null)
                alert(err?.error || "Action failed")
            }
        } catch { /* network error — leave list as is */ }
    }

    useEffect(() => {
        if (authStatus === "authenticated") {
            fetchData(activeTab, page, debouncedQuery)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authStatus, activeTab, todayOnly, page, debouncedQuery, dateFrom, dateTo, overdueOnly])

    // Today's list is fetched whole and filtered here; the full queue is
    // searched and paged by the server.
    const q = searchQuery.toLowerCase()
    const filteredInspections = todayOnly
        ? inspections.filter(i =>
            (i.assignment?.project?.name ?? "").toLowerCase().includes(q) ||
            (i.assignment?.project?.site?.name ?? "").toLowerCase().includes(q) ||
            (i.submitter?.name ?? "").toLowerCase().includes(q) ||
            (i.submittedAt ? new Date(i.submittedAt).toLocaleDateString('en-GB') : "").includes(q))
        : inspections
    const pageCount = todayOnly ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE))
    const showFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
    const showTo = todayOnly ? filteredInspections.length : Math.min(page * PAGE_SIZE, total)

    if (authStatus === "loading" || !session) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="p-4 lg:p-7">
            <div className="mb-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-[26px] font-bold tracking-[-0.5px] text-[var(--text)]">Approvals</h1>
                        <p className="text-[13.5px] text-[var(--text3)] mt-1">Review and approve submitted inspections to finalize reports. Target: within {targetHours} h.</p>
                    </div>
                    {canAny(session, ["approvals.manage", "projects.edit"]) && (
                        <Link href="/approvals/settings" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[9px] border border-[var(--border)] bg-white text-[12.5px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)]">
                            Settings
                        </Link>
                    )}
                </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <div className="flex items-center bg-white border border-[var(--border)] rounded-[10px] p-1 overflow-x-auto no-scrollbar">
                        <button
                            onClick={() => setActiveTab("pending")}
                            className={`shrink-0 whitespace-nowrap px-[18px] py-1.5 rounded-[7px] text-[13px] font-medium transition-all duration-150 ${
                                activeTab === "pending"
                                    ? "bg-[#fef3c7] text-[#d97706]"
                                    : "text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)]"
                            }`}
                        >
                            Pending {counts.pending > 0 && <span className="ml-1 text-[10px]">({counts.pending})</span>}
                        </button>
                        <button
                            onClick={() => setActiveTab("approved")}
                            className={`shrink-0 whitespace-nowrap px-[18px] py-1.5 rounded-[7px] text-[13px] font-medium transition-all duration-150 ${
                                activeTab === "approved"
                                    ? "bg-[var(--success-light)] text-[var(--success)]"
                                    : "text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)]"
                            }`}
                        >
                            Approved
                        </button>
                        <button
                            onClick={() => setActiveTab("rejected")}
                            className={`shrink-0 whitespace-nowrap px-[18px] py-1.5 rounded-[7px] text-[13px] font-medium transition-all duration-150 ${
                                activeTab === "rejected"
                                    ? "bg-[#fef2f2] text-[#dc2626]"
                                    : "text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)]"
                            }`}
                        >
                            Rejected
                        </button>
                        <button
                            onClick={() => setActiveTab("all")}
                            className={`shrink-0 whitespace-nowrap px-[18px] py-1.5 rounded-[7px] text-[13px] font-medium transition-all duration-150 ${
                                activeTab === "all"
                                    ? "bg-[#e3ecff] text-[#1f5fff]"
                                    : "text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)]"
                            }`}
                        >
                            All
                        </button>
                    </div>

                    {activeTab === "pending" && !todayOnly && (
                        <button onClick={() => { setOverdueOnly(o => !o); setPage(1) }}
                            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12.5px] font-medium border transition-colors ${overdueOnly ? "bg-[#fef2f2] border-[#fecaca] text-[#dc2626]" : "bg-white border-[var(--border)] text-[var(--text2)]"}`}>
                            Overdue{(counts.overdue ?? 0) > 0 ? ` (${counts.overdue})` : ""}
                        </button>
                    )}
                    {canDecide && activeTab === "pending" && picked.size > 0 && (
                        <button onClick={bulkApprove} disabled={!!bulk}
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[var(--accent)] text-white text-[12.5px] font-medium disabled:opacity-60">
                            {bulk ? `Approving ${bulk.done}/${bulk.total}…` : `Approve selected (${picked.size})`}
                        </button>
                    )}
                    {todayOnly && (
                        <span className="inline-flex items-center gap-1.5 h-8 pl-3 pr-1.5 rounded-full bg-[#e3ecff] text-[#1f5fff] text-[12.5px] font-medium">
                            Submitted today
                            <button onClick={clearToday} aria-label="Clear Submitted today filter" title="Clear filter"
                                className="h-5 w-5 rounded-full flex items-center justify-center hover:bg-[#1f5fff] hover:text-white transition-colors">
                                <X className="h-3 w-3" />
                            </button>
                        </span>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <div className="flex items-center gap-1.5 h-[38px] px-2.5 bg-white border border-[var(--border)] rounded-[9px] text-[12.5px] text-[var(--text2)]">
                    <label htmlFor="appr-from" className="text-[var(--text3)]">From</label>
                    <input id="appr-from" type="date" value={dateFrom} max={dateTo || undefined}
                        onChange={e => changeDate("from", e.target.value)}
                        className="bg-transparent text-[12.5px] text-[var(--text)] outline-none" />
                    <label htmlFor="appr-to" className="text-[var(--text3)] ml-1">To</label>
                    <input id="appr-to" type="date" value={dateTo} min={dateFrom || undefined}
                        onChange={e => changeDate("to", e.target.value)}
                        className="bg-transparent text-[12.5px] text-[var(--text)] outline-none" />
                    {(dateFrom || dateTo) && (
                        <button onClick={clearDates} aria-label="Clear dates" title="Clear dates"
                            className="h-5 w-5 rounded-full flex items-center justify-center text-[var(--text3)] hover:bg-[var(--surface2)] hover:text-[var(--text)]">
                            <X className="h-3 w-3" />
                        </button>
                    )}
                </div>
                <div className="relative w-full sm:w-[240px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-[var(--text3)]" />
                    <Input
                        placeholder="Name, site or dd/mm/yyyy"
                        title="Inspector, project or site name — or a date like 30/10/2026 for one day"
                        className="pl-9 pr-4 py-2 bg-white border border-[var(--border)] rounded-[9px] text-[13px] text-[var(--text)] placeholder:text-[var(--text3)] focus:border-[var(--accent)] focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)] focus:outline-none transition-shadow"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                </div>
            </div>

            <div>
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 space-y-4">
                        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-50" />
                        <p className="text-sm font-medium text-muted-foreground">Loading inspections...</p>
                    </div>
                ) : filteredInspections.length === 0 ? (
                    <div className="bg-white border border-[var(--border)] rounded-[14px] py-[60px] px-10 text-center">
                        <div className="w-[56px] h-[56px] bg-[var(--accent-light)] rounded-full flex items-center justify-center mx-auto mb-4">
                            <ClipboardCheck className="h-6 w-6 text-[var(--accent)]" />
                        </div>
                        <h3 className="text-[16px] font-semibold text-[var(--text)] mb-1.5">All caught up!</h3>
                        <p className="text-[13px] text-[var(--text2)] max-w-[250px] mx-auto leading-relaxed">
                            No {activeTab !== "all" ? activeTab : ""} inspections {todayOnly ? "submitted today" : (dateFrom || dateTo) ? "in the selected dates" : "found matching your criteria"}.
                        </p>
                    </div>
                ) : (
                    <div className="bg-white border border-[var(--border)] rounded-[14px] overflow-hidden">
                        {/* Mobile Card View */}
                        <div className="sm:hidden divide-y divide-[var(--border)]">
                            {filteredInspections.map((inspection) => (
                                <div key={inspection.id} onClick={e => openReport(e, inspection.id)} onAuxClick={e => openReport(e, inspection.id)}
                                    title="Open report" className="p-4 hover:bg-[var(--surface2)] transition-colors cursor-pointer">
                                    <div className="flex items-start justify-between gap-2 mb-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[13.5px] font-semibold text-[var(--text)] truncate">{inspection.submitter?.name}</p>
                                            <p className="text-[11.5px] text-[var(--text3)] truncate">{inspection.submitter?.email}</p>
                                            <p className="text-[12px] text-[var(--text2)] font-[500] truncate mt-1">{inspection.assignment?.project?.name}</p>
                                            <p className="text-[11px] text-[var(--text3)] truncate">{inspection.assignment?.project?.site?.name}</p>
                                        </div>
                                        <span className={`shrink-0 inline-block px-[10px] py-[4px] rounded-[20px] text-[11px] font-medium ${
                                            inspection.status === "pending" ? "bg-[#fef3c7] text-[#d97706]" :
                                            inspection.status === "approved" ? "bg-[var(--success-light)] text-[var(--success)]" :
                                            inspection.status === "rejected" ? "bg-[#fef2f2] text-[#dc2626]" :
                                            "bg-[var(--surface2)] text-[var(--text2)]"
                                        }`}>
                                            {inspection.status === "pending" ? "Pending" : inspection.status === "approved" ? "Approved" : inspection.status === "rejected" ? "Rejected" : inspection.status}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <p className="text-[12px] text-[var(--text3)]">
                                            {inspection.submittedAt ? new Date(inspection.submittedAt).toLocaleDateString('en-GB') : "—"}
                                            {inspection.status === "approved" && inspection.approvedByName && (
                                                <span className="block text-[11.5px] text-[var(--text2)]">Approved by {inspection.approvedByName}</span>
                                            )}
                                            {inspection.status === "rejected" && (
                                                <span className="block text-[11.5px] text-[var(--text2)]">{inspection.approvedByName ? `Rejected by ${inspection.approvedByName}` : "Rejected by: not recorded"}</span>
                                            )}
                                        </p>
                                        <div className="flex items-center gap-2">
                                            {inspection.status === "pending" && (
                                                <button
                                                    onClick={() => quickAction(inspection.id, "approve")}
                                                    className="h-8 w-8 rounded-[7px] bg-[var(--accent-light)] text-[var(--accent-text)] flex items-center justify-center hover:bg-[var(--accent)] hover:text-white transition-colors"
                                                    title="Approve"
                                                >
                                                    <CheckCircle2 className="h-4 w-4" />
                                                </button>
                                            )}
                                            {inspection.status === "pending" && (
                                                <button
                                                    onClick={() => quickAction(inspection.id, "reject")}
                                                    className="h-8 w-8 rounded-[7px] bg-[#fef2f2] text-[#dc2626] flex items-center justify-center hover:bg-[#dc2626] hover:text-white transition-colors"
                                                    title="Reject"
                                                >
                                                    <XCircle className="h-4 w-4" />
                                                </button>
                                            )}
                                            <Link
                                                href={`/approvals/${inspection.id}`}
                                                className="h-8 px-3 rounded-[7px] bg-[var(--surface2)] text-[var(--text2)] flex items-center justify-center hover:bg-[var(--text)] hover:text-white transition-colors text-[12px] font-[500]"
                                                title="View"
                                            >
                                                View →
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {/* Desktop Table View */}
                        <div className="hidden sm:block overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-[var(--surface2)] border-b border-[var(--border)]">
                                        {canDecide && activeTab === "pending" && (
                                            <th className="pl-[18px] py-2.5 w-8">
                                                <input type="checkbox" aria-label="Tick all" className="accent-[var(--accent)]"
                                                    checked={filteredInspections.length > 0 && filteredInspections.every((i: any) => picked.has(i.id))}
                                                    onChange={e => setPicked(e.target.checked ? new Set(filteredInspections.filter((i: any) => i.status === "pending").map((i: any) => i.id)) : new Set())} />
                                            </th>
                                        )}
                                        <th className="px-[18px] py-2.5 text-left text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide">Inspector</th>
                                        <th className="px-[18px] py-2.5 text-left text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide">Project</th>
                                        <th className="px-[18px] py-2.5 text-left text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide">Site</th>
                                        <th className="px-[18px] py-2.5 text-left text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide">Submitted</th>
                                        <th className="px-[18px] py-2.5 text-left text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide">Status</th>
                                        {reviewerHeader && (
                                            <th className="px-[18px] py-2.5 text-left text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide">{reviewerHeader}</th>
                                        )}
                                        <th className="px-[18px] py-2.5 text-left text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border)]">
                                    {filteredInspections.map((inspection) => (
                                        <tr key={inspection.id} onClick={e => openReport(e, inspection.id)} onAuxClick={e => openReport(e, inspection.id)}
                                            title="Open report" className="hover:bg-[var(--surface2)] transition-colors cursor-pointer">
                                            {canDecide && activeTab === "pending" && (
                                                <td className="pl-[18px] py-3.5" onClick={e => e.stopPropagation()}>
                                                    {inspection.status === "pending" && (
                                                        <input type="checkbox" aria-label="Tick" className="accent-[var(--accent)]" checked={picked.has(inspection.id)}
                                                            onChange={() => setPicked(p => { const n = new Set(p); if (n.has(inspection.id)) n.delete(inspection.id); else n.add(inspection.id); return n })} />
                                                    )}
                                                </td>
                                            )}
                                            <td className="px-[18px] py-3.5">
                                                <p className="text-[13px] font-medium text-[var(--text)]">{inspection.submitter?.name}</p>
                                                <p className="text-[11.5px] text-[var(--text3)] mt-0.5">{inspection.submitter?.email}</p>
                                            </td>
                                            <td className="px-[18px] py-3.5 text-[13px] text-[var(--text)]">
                                                {inspection.assignment?.project?.name}
                                            </td>
                                            <td className="px-[18px] py-3.5 text-[13px] text-[var(--text)]">
                                                {inspection.assignment?.project?.site?.name}
                                            </td>
                                            <td className="px-[18px] py-3.5 text-[13px] text-[var(--text2)] whitespace-nowrap">
                                                {inspection.submittedAt ? new Date(inspection.submittedAt).toLocaleDateString('en-GB') : "—"}
                                                {inspection.status === "pending" && (() => {
                                                    const w = waited(inspection.submittedAt)
                                                    return w && (
                                                        <p className={`text-[11px] mt-0.5 ${w.overdue ? "text-[#dc2626] font-semibold" : "text-[var(--text3)]"}`}>
                                                            waiting {w.label}{w.overdue ? " · overdue" : ""}
                                                        </p>
                                                    )
                                                })()}
                                            </td>
                                            <td className="px-[18px] py-3.5">
                                                <span className={`inline-block whitespace-nowrap px-3 py-1 rounded-[20px] text-[11.5px] font-medium ${
                                                    inspection.status === "pending" ? "bg-[#fef3c7] text-[#d97706]" :
                                                    inspection.status === "approved" ? "bg-[var(--success-light)] text-[var(--success)]" :
                                                    inspection.status === "rejected" ? "bg-[#fef2f2] text-[#dc2626]" :
                                                    "bg-[var(--surface2)] text-[var(--text2)]"
                                                }`}>
                                                    {inspection.status === "pending" ? "Pending" : inspection.status === "approved" ? "Approved" : inspection.status === "rejected" ? "Rejected" : inspection.status}
                                                </span>
                                            </td>
                                            {reviewerHeader && (
                                                <td className="px-[18px] py-3.5 text-[13px] text-[var(--text)]">
                                                    {(inspection.status === "approved" || inspection.status === "rejected") && inspection.approvedByName ? (
                                                        <>
                                                            <p>{inspection.approvedByName}</p>
                                                            {inspection.approvedAt && (
                                                                <p className="text-[11.5px] text-[var(--text3)] mt-0.5 whitespace-nowrap">{new Date(inspection.approvedAt).toLocaleDateString('en-GB')}</p>
                                                            )}
                                                        </>
                                                    ) : inspection.status === "rejected" ? (
                                                        // Rejected before the reviewer was recorded.
                                                        <span className="text-[var(--text3)] whitespace-nowrap" title="Rejected before the reviewer was recorded">Not recorded</span>
                                                    ) : <span className="text-[var(--text3)]">—</span>}
                                                </td>
                                            )}
                                            <td className="px-[18px] py-3.5">
                                                <div className="flex items-center gap-1.5">
                                                    {inspection.status === "pending" && (
                                                        <button
                                                            onClick={() => quickAction(inspection.id, "approve")}
                                                            className="h-7 w-7 rounded-[7px] bg-[var(--accent-light)] text-[var(--accent-text)] flex items-center justify-center hover:bg-[var(--accent)] hover:text-white transition-colors"
                                                            title="Approve"
                                                        >
                                                            <CheckCircle2 className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                    {inspection.status === "pending" && (
                                                        <button
                                                            onClick={() => quickAction(inspection.id, "reject")}
                                                            className="h-7 w-7 rounded-[7px] bg-[#fef2f2] text-[#dc2626] flex items-center justify-center hover:bg-[#dc2626] hover:text-white transition-colors"
                                                            title="Reject"
                                                        >
                                                            <XCircle className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                    <Link
                                                        href={`/approvals/${inspection.id}`}
                                                        className="h-7 w-7 rounded-[7px] bg-[var(--surface2)] text-[var(--text2)] flex items-center justify-center hover:bg-[var(--text)] hover:text-white transition-colors"
                                                        title="View"
                                                    >
                                                        <ChevronRight className="h-4 w-4" />
                                                    </Link>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {/* Paging — every report in the queue can be reached. */}
                        {!todayOnly && (
                            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-[var(--border)]">
                                <p className="text-[12.5px] text-[var(--text3)] tabular-nums">
                                    Showing {showFrom}–{showTo} of {total}
                                </p>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1 || loading}
                                        className="h-8 px-3 rounded-[8px] border border-[var(--border)] bg-white text-[12.5px] text-[var(--text2)] disabled:opacity-40">
                                        Previous
                                    </button>
                                    <span className="text-[12.5px] text-[var(--text2)] tabular-nums">Page {page} of {pageCount}</span>
                                    <button onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={page >= pageCount || loading}
                                        className="h-8 px-3 rounded-[8px] border border-[var(--border)] bg-white text-[12.5px] text-[var(--text2)] disabled:opacity-40">
                                        Next
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
