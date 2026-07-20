
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
        } else if (authStatus === "authenticated" && session?.user?.role === "INSPECTION_BOY") {
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
                <h1 className="text-[22px] font-semibold tracking-tight text-[#1a1a18]">Inspection Approvals</h1>
                <p className="text-[13px] text-[#6b6860] mt-[3px]">Review and approve submitted inspections to finalize reports.</p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div className="flex items-center bg-white border border-[#e8e6e1] rounded-[10px] p-1 overflow-x-auto">
                    <button
                        onClick={() => setActiveTab("pending")}
                        className={`px-[18px] py-1.5 rounded-[7px] text-[13px] font-medium transition-all duration-150 ${
                            activeTab === "pending"
                                ? "bg-[#fef3c7] text-[#d97706]"
                                : "text-[#6b6860] hover:bg-[#f9f8f5] hover:text-[#1a1a18]"
                        }`}
                    >
                        Pending {counts.pending > 0 && <span className="ml-1 text-[10px]">({counts.pending})</span>}
                    </button>
                    <button
                        onClick={() => setActiveTab("approved")}
                        className={`px-[18px] py-1.5 rounded-[7px] text-[13px] font-medium transition-all duration-150 ${
                            activeTab === "approved"
                                ? "bg-[#e8f7f1] text-[#0d6b4a]"
                                : "text-[#6b6860] hover:bg-[#f9f8f5] hover:text-[#1a1a18]"
                        }`}
                    >
                        Approved
                    </button>
                    <button
                        onClick={() => setActiveTab("rejected")}
                        className={`px-[18px] py-1.5 rounded-[7px] text-[13px] font-medium transition-all duration-150 ${
                            activeTab === "rejected"
                                ? "bg-[#fef2f2] text-[#dc2626]"
                                : "text-[#6b6860] hover:bg-[#f9f8f5] hover:text-[#1a1a18]"
                        }`}
                    >
                        Rejected
                    </button>
                    <button
                        onClick={() => setActiveTab("all")}
                        className={`px-[18px] py-1.5 rounded-[7px] text-[13px] font-medium transition-all duration-150 ${
                            activeTab === "all"
                                ? "bg-[#1a1a18] text-white"
                                : "text-[#6b6860] hover:bg-[#f9f8f5] hover:text-[#1a1a18]"
                        }`}
                    >
                        All
                    </button>
                </div>

                <div className="relative w-full sm:w-[280px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-[#9e9b95]" />
                    <Input
                        placeholder="Search..."
                        className="pl-9 pr-4 py-2 bg-white border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#1a1a18] placeholder:text-[#9e9b95] focus:border-[#1a9e6e] focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)] focus:outline-none transition-shadow"
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
                    <div className="bg-white border border-[#e8e6e1] rounded-[14px] py-[60px] px-10 text-center">
                        <div className="w-[56px] h-[56px] bg-[#e8f7f1] rounded-full flex items-center justify-center mx-auto mb-4">
                            <ClipboardCheck className="h-6 w-6 text-[#1a9e6e]" />
                        </div>
                        <h3 className="text-[16px] font-semibold text-[#1a1a18] mb-1.5">All caught up!</h3>
                        <p className="text-[13px] text-[#6b6860] max-w-[250px] mx-auto leading-relaxed">
                            No {activeTab !== "all" ? activeTab : ""} inspections found matching your criteria.
                        </p>
                    </div>
                ) : (
                    <div className="bg-white border border-[#e8e6e1] rounded-[14px] overflow-hidden">
                        {/* Mobile Card View */}
                        <div className="sm:hidden divide-y divide-[#e8e6e1]">
                            {filteredInspections.map((inspection) => (
                                <div key={inspection.id} className="p-4 hover:bg-[#f9f8f5] transition-colors">
                                    <div className="flex items-start justify-between gap-2 mb-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[13.5px] font-semibold text-[#1a1a18] truncate">{inspection.submitter?.name}</p>
                                            <p className="text-[11.5px] text-[#9e9b95] truncate">{inspection.submitter?.email}</p>
                                            <p className="text-[12px] text-[#6b6860] font-[500] truncate mt-1">{inspection.assignment?.project?.name}</p>
                                            <p className="text-[11px] text-[#9e9b95] truncate">{inspection.assignment?.project?.site?.name}</p>
                                        </div>
                                        <span className={`shrink-0 inline-block px-[10px] py-[4px] rounded-[20px] text-[11px] font-medium ${
                                            inspection.status === "pending" ? "bg-[#fef3c7] text-[#d97706]" :
                                            inspection.status === "approved" ? "bg-[#e8f7f1] text-[#0d6b4a]" :
                                            inspection.status === "rejected" ? "bg-[#fef2f2] text-[#dc2626]" :
                                            "bg-[#f9f8f5] text-[#6b6860]"
                                        }`}>
                                            {inspection.status === "pending" ? "Pending" : inspection.status === "approved" ? "Approved" : inspection.status === "rejected" ? "Rejected" : inspection.status}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <p className="text-[12px] text-[#9e9b95]">
                                            {inspection.submittedAt ? new Date(inspection.submittedAt).toLocaleDateString('en-GB') : "—"}
                                        </p>
                                        <div className="flex items-center gap-2">
                                            {inspection.status === "pending" && (
                                                <button
                                                    onClick={() => quickAction(inspection.id, "approve")}
                                                    className="h-8 w-8 rounded-[7px] bg-[#e8f7f1] text-[#0d6b4a] flex items-center justify-center hover:bg-[#1a9e6e] hover:text-white transition-colors"
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
                                                className="h-8 px-3 rounded-[7px] bg-[#f9f8f5] text-[#6b6860] flex items-center justify-center hover:bg-[#1a1a18] hover:text-white transition-colors text-[12px] font-[500]"
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
                                    <tr className="bg-[#f9f8f5] border-b border-[#e8e6e1]">
                                        <th className="px-[18px] py-2.5 text-left text-[11px] font-medium text-[#9e9b95] uppercase tracking-wide">Inspector</th>
                                        <th className="px-[18px] py-2.5 text-left text-[11px] font-medium text-[#9e9b95] uppercase tracking-wide">Project</th>
                                        <th className="px-[18px] py-2.5 text-left text-[11px] font-medium text-[#9e9b95] uppercase tracking-wide">Company</th>
                                        <th className="px-[18px] py-2.5 text-left text-[11px] font-medium text-[#9e9b95] uppercase tracking-wide">Submitted</th>
                                        <th className="px-[18px] py-2.5 text-left text-[11px] font-medium text-[#9e9b95] uppercase tracking-wide">Status</th>
                                        <th className="px-[18px] py-2.5 text-left text-[11px] font-medium text-[#9e9b95] uppercase tracking-wide">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#e8e6e1]">
                                    {filteredInspections.map((inspection) => (
                                        <tr key={inspection.id} className="hover:bg-[#f9f8f5] transition-colors">
                                            <td className="px-[18px] py-3.5">
                                                <p className="text-[13px] font-medium text-[#1a1a18]">{inspection.submitter?.name}</p>
                                                <p className="text-[11.5px] text-[#9e9b95] mt-0.5">{inspection.submitter?.email}</p>
                                            </td>
                                            <td className="px-[18px] py-3.5 text-[13px] text-[#1a1a18]">
                                                {inspection.assignment?.project?.name}
                                            </td>
                                            <td className="px-[18px] py-3.5 text-[13px] text-[#1a1a18]">
                                                {inspection.assignment?.project?.site?.name}
                                            </td>
                                            <td className="px-[18px] py-3.5 text-[13px] text-[#6b6860]">
                                                {inspection.submittedAt ? new Date(inspection.submittedAt).toLocaleDateString('en-GB') : "—"}
                                            </td>
                                            <td className="px-[18px] py-3.5">
                                                <span className={`inline-block px-3 py-1 rounded-[20px] text-[11.5px] font-medium ${
                                                    inspection.status === "pending" ? "bg-[#fef3c7] text-[#d97706]" :
                                                    inspection.status === "approved" ? "bg-[#e8f7f1] text-[#0d6b4a]" :
                                                    inspection.status === "rejected" ? "bg-[#fef2f2] text-[#dc2626]" :
                                                    "bg-[#f9f8f5] text-[#6b6860]"
                                                }`}>
                                                    {inspection.status === "pending" ? "Pending" : inspection.status === "approved" ? "Approved" : inspection.status === "rejected" ? "Rejected" : inspection.status}
                                                </span>
                                            </td>
                                            <td className="px-[18px] py-3.5">
                                                <div className="flex items-center gap-1.5">
                                                    {inspection.status === "pending" && (
                                                        <button
                                                            onClick={() => quickAction(inspection.id, "approve")}
                                                            className="h-7 w-7 rounded-[7px] bg-[#e8f7f1] text-[#0d6b4a] flex items-center justify-center hover:bg-[#1a9e6e] hover:text-white transition-colors"
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
                                                        className="h-7 w-7 rounded-[7px] bg-[#f9f8f5] text-[#6b6860] flex items-center justify-center hover:bg-[#1a1a18] hover:text-white transition-colors"
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
