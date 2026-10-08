
"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import {
    CheckCircle2,
    XCircle,
    ChevronRight,
    Loader2,
    Search,
    ClipboardCheck
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { can } from "@/lib/can"
import Link from "next/link"

export default function ApprovalsPage() {
    const { data: session, status: authStatus } = useSession()
    const router = useRouter()

    const [inspections, setInspections] = useState<any[]>([])
    const [counts, setCounts] = useState<Record<string, number>>({
        pending: 0,
        approved: 0,
        rejected: 0,
        all: 0
    })
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [activeTab, setActiveTab] = useState("pending")

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

    const fetchData = async (status: string) => {
        setLoading(true)
        try {
            const url = `/api/inspections/all?status=${status}&limit=100&withCounts=true`
            const res = await fetch(url)
            const data = await res.json()

            const items = data?.inspections ?? (Array.isArray(data) ? data : [])
            setInspections(items)

            if (data?.counts) {
                setCounts({
                    pending: data.counts.pending ?? 0,
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
            if (res.ok) fetchData(activeTab)
            else {
                const err = await res.json().catch(() => null)
                alert(err?.error || "Action failed")
            }
        } catch { /* network error — leave list as is */ }
    }

    useEffect(() => {
        if (authStatus === "authenticated") {
            fetchData(activeTab)
        }
    }, [authStatus, activeTab])

    const filteredInspections = inspections.filter(i =>
        i.assignment?.project?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        i.assignment?.project?.site?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        i.submitter?.name.toLowerCase().includes(searchQuery.toLowerCase())
    )

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
                <h1 className="text-[26px] font-bold tracking-[-0.5px] text-[var(--text)]">Approvals</h1>
                <p className="text-[13.5px] text-[var(--text3)] mt-1">Review and approve submitted inspections to finalize reports.</p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div className="flex items-center bg-white border border-[var(--border)] rounded-[10px] p-1 overflow-x-auto">
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
                                ? "bg-[var(--text)] text-white"
                                : "text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)]"
                        }`}
                    >
                        All
                    </button>
                </div>

                <div className="relative w-full sm:w-[280px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-[var(--text3)]" />
                    <Input
                        placeholder="Search..."
                        className="pl-9 pr-4 py-2 bg-white border border-[var(--border)] rounded-[9px] text-[13px] text-[var(--text)] placeholder:text-[var(--text3)] focus:border-[var(--accent)] focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)] focus:outline-none transition-shadow"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
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
                            No {activeTab !== "all" ? activeTab : ""} inspections found matching your criteria.
                        </p>
                    </div>
                ) : (
                    <div className="bg-white border border-[var(--border)] rounded-[14px] overflow-hidden">
                        {/* Mobile Card View */}
                        <div className="sm:hidden divide-y divide-[var(--border)]">
                            {filteredInspections.map((inspection) => (
                                <div key={inspection.id} className="p-4 hover:bg-[var(--surface2)] transition-colors">
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
                                        <th className="px-[18px] py-2.5 text-left text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide">Inspector</th>
                                        <th className="px-[18px] py-2.5 text-left text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide">Project</th>
                                        <th className="px-[18px] py-2.5 text-left text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide">Company</th>
                                        <th className="px-[18px] py-2.5 text-left text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide">Submitted</th>
                                        <th className="px-[18px] py-2.5 text-left text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide">Status</th>
                                        <th className="px-[18px] py-2.5 text-left text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border)]">
                                    {filteredInspections.map((inspection) => (
                                        <tr key={inspection.id} className="hover:bg-[var(--surface2)] transition-colors">
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
                                            <td className="px-[18px] py-3.5 text-[13px] text-[var(--text2)]">
                                                {inspection.submittedAt ? new Date(inspection.submittedAt).toLocaleDateString('en-GB') : "—"}
                                            </td>
                                            <td className="px-[18px] py-3.5">
                                                <span className={`inline-block px-3 py-1 rounded-[20px] text-[11.5px] font-medium ${
                                                    inspection.status === "pending" ? "bg-[#fef3c7] text-[#d97706]" :
                                                    inspection.status === "approved" ? "bg-[var(--success-light)] text-[var(--success)]" :
                                                    inspection.status === "rejected" ? "bg-[#fef2f2] text-[#dc2626]" :
                                                    "bg-[var(--surface2)] text-[var(--text2)]"
                                                }`}>
                                                    {inspection.status === "pending" ? "Pending" : inspection.status === "approved" ? "Approved" : inspection.status === "rejected" ? "Rejected" : inspection.status}
                                                </span>
                                            </td>
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
                    </div>
                )}
            </div>
        </div>
    )
}
