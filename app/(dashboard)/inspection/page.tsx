"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import {
    ClipboardList,
    CheckCircle2,
    AlertCircle,
    ArrowRight,
    Building2,
    Calendar,
    User as UserIcon,
    History,
    FileEdit,
    Clock,
    LayoutDashboard,
    BarChart3,
    Send,
    Edit3,
    Grid,
    Activity
} from "lucide-react"
import Link from "next/link"
import { format, formatDistanceToNow, isValid } from "date-fns"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

function safeFormat(val: any, fmt: string): string {
    try {
        if (!val) return "—"
        const d = new Date(val)
        if (!isValid(d)) return "—"
        return format(d, fmt)
    } catch { return "—" }
}

function safeDistance(val: any): string {
    try {
        if (!val) return "—"
        const d = new Date(val)
        if (!isValid(d)) return "—"
        return formatDistanceToNow(d)
    } catch { return "—" }
}

export default function InspectionDashboard() {
    const { data: session } = useSession()
    const [assignments, setAssignments] = useState<any[]>([])
    const [recentSubmissions, setRecentSubmissions] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [reportData, setReportData] = useState<any>(null)
    const [reportLoading, setReportLoading] = useState(true)

    useEffect(() => {
        if (!session?.user?.id) return
        const fetchMain = async () => {
            try {
                const [asgnRes, subRes] = await Promise.all([
                    fetch("/api/assignments?status=all"),
                    fetch("/api/inspections?recent=20"),
                ])
                const [asgnData, subData] = await Promise.all([
                    asgnRes.json(),
                    subRes.json(),
                ])
                setAssignments(Array.isArray(asgnData) ? asgnData : [])
                setRecentSubmissions(Array.isArray(subData) ? subData : [])
            } catch (error) {
                console.error("Failed to fetch inspection data", error)
            } finally {
                setLoading(false)
            }
        }
        fetchMain()
    }, [session?.user?.id])

    useEffect(() => {
        if (!session?.user?.id) return
        const fetchReports = async () => {
            try {
                const now = new Date()
                const month = now.getMonth() + 1
                const year = now.getFullYear()
                const res = await fetch(`/api/reports?month=${month}&year=${year}&inspectorId=${session.user.id}`)
                const data = await res.json()
                setReportData(data)
            } catch (error) {
                console.error("Failed to fetch report data", error)
            } finally {
                setReportLoading(false)
            }
        }
        fetchReports()
    }, [session?.user?.id])

    if (loading) {
        return (
            <div className="min-h-screen bg-[#f5f4f0] p-4 md:p-6 lg:p-7">
                <div className="space-y-5 animate-pulse">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[1, 2, 3, 4].map((i) => (
                            <Skeleton key={i} className="h-[100px] rounded-[12px]" />
                        ))}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Skeleton className="h-[300px] rounded-[12px]" />
                        <Skeleton className="h-[300px] rounded-[12px]" />
                    </div>
                </div>
            </div>
        )
    }

    const submittedAssignmentIds = new Set(recentSubmissions.map((s: any) => s.assignmentId))
    // Active: no inspection yet, or inspection is still a draft
    const activeAssignments = assignments.filter(a =>
        a.status === "active" && (!a.inspection || a.inspection.status === "draft")
    )
    // Completed: assignment marked completed in DB, OR has a submitted (non-draft) inspection
    const completedAssignments = assignments.filter(a =>
        a.status === "completed" ||
        (a.status === "active" && a.inspection && a.inspection.status !== "draft")
    )
    const activeCount = activeAssignments.length
    const draftCount = recentSubmissions.filter(s => s.status === "draft").length
    const pendingCount = recentSubmissions.filter(s => s.status === "pending").length
    const approvedInspections = recentSubmissions.filter(s => s.status === "approved")
    const approvedCount = approvedInspections.length
    const rejectedCount = recentSubmissions.filter(s => s.status === "rejected").length

    return (
        <div className="min-h-screen bg-[#f5f4f0] p-4 md:p-6 lg:p-7">
            {/* Mobile Welcome Banner */}
            <div className="md:hidden bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8] rounded-[16px] p-4 text-white shadow-sm mb-4">
                <p className="text-[11px] font-medium opacity-70 mb-0.5 uppercase tracking-wider">Welcome back 👋</p>
                <p className="text-[20px] font-bold tracking-tight">Inspector Workspace</p>
                <p className="text-[12px] opacity-70 mt-1">Track assignments and submit inspection reports</p>
                <div className="flex items-center gap-2 mt-3">
                    <div className="flex-1 bg-white/10 rounded-[10px] p-2.5 text-center">
                        <p className="text-[20px] font-bold tabular-nums">{activeCount}</p>
                        <p className="text-[10px] opacity-70 mt-0.5">Active</p>
                    </div>
                    <div className="flex-1 bg-white/10 rounded-[10px] p-2.5 text-center">
                        <p className="text-[20px] font-bold tabular-nums">{draftCount}</p>
                        <p className="text-[10px] opacity-70 mt-0.5">Drafts</p>
                    </div>
                    <div className="flex-1 bg-white/10 rounded-[10px] p-2.5 text-center">
                        <p className="text-[20px] font-bold tabular-nums">{pendingCount}</p>
                        <p className="text-[10px] opacity-70 mt-0.5">Pending</p>
                    </div>
                    <div className="flex-1 bg-white/10 rounded-[10px] p-2.5 text-center">
                        <p className="text-[20px] font-bold tabular-nums">{approvedCount}</p>
                        <p className="text-[10px] opacity-70 mt-0.5">Approved</p>
                    </div>
                </div>
            </div>

            {/* Desktop Header */}
            <div className="hidden md:block mb-5">
                <h1 className="text-[22px] font-semibold text-[#1a1a18] tracking-[-0.4px]">Inspector Workspace</h1>
                <p className="text-[13px] text-[#6b6860] mt-[3px]">Track assignments and submit inspection reports</p>
            </div>

            {/* SECTION 1: STATUS CARDS — hidden on mobile (shown in welcome banner) */}
            <div className="hidden md:grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className="bg-white border border-[#e8e6e1] rounded-[12px] p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
                    <div className="w-[38px] h-[38px] rounded-full bg-[#eff6ff] flex items-center justify-center">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="7" height="7" />
                            <rect x="14" y="3" width="7" height="7" />
                            <rect x="14" y="14" width="7" height="7" />
                            <rect x="3" y="14" width="7" height="7" />
                        </svg>
                    </div>
                    <div>
                        <p className="text-[11px] font-semibold text-[#9e9b95] uppercase tracking-[0.6px] mb-1">Active</p>
                        <p className="text-[26px] font-bold text-[#1a1a18] tracking-[-0.5px] tabular-nums">{activeCount}</p>
                    </div>
                </div>
                <div className="bg-white border border-[#e8e6e1] rounded-[12px] p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
                    <div className="w-[38px] h-[38px] rounded-full bg-[#fef3c7] flex items-center justify-center">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                    </div>
                    <div>
                        <p className="text-[11px] font-semibold text-[#9e9b95] uppercase tracking-[0.6px] mb-1">Drafts</p>
                        <p className="text-[26px] font-bold text-[#1a1a18] tracking-[-0.5px] tabular-nums">{draftCount}</p>
                    </div>
                </div>
                <div className="bg-white border border-[#e8e6e1] rounded-[12px] p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
                    <div className="w-[38px] h-[38px] rounded-full bg-[#f5f3ff] flex items-center justify-center">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                    </div>
                    <div>
                        <p className="text-[11px] font-semibold text-[#9e9b95] uppercase tracking-[0.6px] mb-1">Pending</p>
                        <p className="text-[26px] font-bold text-[#1a1a18] tracking-[-0.5px] tabular-nums">{pendingCount}</p>
                    </div>
                </div>
                <div className="bg-white border border-[#e8e6e1] rounded-[12px] p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
                    <div className="w-[38px] h-[38px] rounded-full bg-[#e8f7f1] flex items-center justify-center">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a9e6e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                    </div>
                    <div>
                        <p className="text-[11px] font-semibold text-[#0d6b4a] uppercase tracking-[0.6px] mb-1">Approved</p>
                        <p className="text-[26px] font-bold text-[#1a9e6e] tracking-[-0.5px] tabular-nums">{approvedCount}</p>
                    </div>
                </div>
            </div>

            {/* SECTION 2: COMPANY WISE REPORTS */}
            <div className="mb-5">
                <div className="flex items-center gap-2 mb-4">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b6860" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="20" x2="18" y2="10" />
                        <line x1="12" y1="20" x2="12" y2="4" />
                        <line x1="6" y1="20" x2="6" y2="14" />
                    </svg>
                    <h2 className="text-[15px] font-semibold text-[#1a1a18]">Company Wise Reports (Current Month)</h2>
                </div>

                {reportLoading ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[80px] rounded-[10px]" />)}
                    </div>
                ) : reportData?.summary ? (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                            <div className="bg-white border border-[#e8e6e1] rounded-[10px] p-4 flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-[#eff6ff] flex items-center justify-center shrink-0">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                                        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-[11px] font-semibold text-[#9e9b95] uppercase tracking-[0.5px] mb-[3px]">Total Inspected</p>
                                    <p className="text-[22px] font-bold text-[#1a1a18] tabular-nums">{reportData.summary.totalInspected.toLocaleString()}</p>
                                </div>
                            </div>
                            <div className="bg-white border border-[#e8e6e1] rounded-[10px] p-4 flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-[#e8f7f1] flex items-center justify-center shrink-0">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1a9e6e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                        <polyline points="22 4 12 14.01 9 11.01" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-[11px] font-semibold text-[#9e9b95] uppercase tracking-[0.5px] mb-[3px]">Accepted</p>
                                    <p className="text-[22px] font-bold text-[#1a1a18] tabular-nums">{reportData.summary.totalAccepted.toLocaleString()}</p>
                                </div>
                            </div>
                            <div className="bg-white border border-[#e8e6e1] rounded-[10px] p-4 flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-[#fef3c7] flex items-center justify-center shrink-0">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 20h9" />
                                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-[11px] font-semibold text-[#9e9b95] uppercase tracking-[0.5px] mb-[3px]">Rework</p>
                                    <p className="text-[22px] font-bold text-[#1a1a18] tabular-nums">{reportData.summary.totalRework.toLocaleString()}</p>
                                </div>
                            </div>
                            <div className="bg-white border border-[#e8e6e1] rounded-[10px] p-4 flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-[#fef2f2] flex items-center justify-center shrink-0">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10" />
                                        <line x1="15" y1="9" x2="9" y2="15" />
                                        <line x1="9" y1="9" x2="15" y2="15" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-[11px] font-semibold text-[#9e9b95] uppercase tracking-[0.5px] mb-[3px]">Rejected</p>
                                    <p className="text-[22px] font-bold text-[#1a1a18] tabular-nums">{reportData.summary.totalRejected.toLocaleString()}</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="bg-white border border-[#e8e6e1] rounded-[10px] p-4">
                                <p className="text-[11px] font-semibold text-[#9e9b95] uppercase tracking-[0.5px] mb-1.5">Quality Rate</p>
                                <p className="text-[22px] font-bold text-[#1a9e6e] tabular-nums">{reportData.summary.acceptanceRate}%</p>
                            </div>
                            <div className="bg-white border border-[#e8e6e1] rounded-[10px] p-4">
                                <p className="text-[11px] font-semibold text-[#9e9b95] uppercase tracking-[0.5px] mb-1.5">Rework Rate</p>
                                <p className="text-[22px] font-bold text-[#d97706] tabular-nums">{reportData.summary.reworkRate}%</p>
                            </div>
                            <div className="bg-white border border-[#e8e6e1] rounded-[10px] p-4">
                                <p className="text-[11px] font-semibold text-[#9e9b95] uppercase tracking-[0.5px] mb-1.5">Rejection Rate</p>
                                <p className="text-[22px] font-bold text-[#dc2626] tabular-nums">{reportData.summary.rejectionRate}%</p>
                            </div>
                            <div className="bg-white border border-[#e8e6e1] rounded-[10px] p-4">
                                <p className="text-[11px] font-semibold text-[#9e9b95] uppercase tracking-[0.5px] mb-1.5">Total Inspections</p>
                                <p className="text-[22px] font-bold text-[#1a1a18] tabular-nums">{reportData.summary.totalInspected || 0}</p>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="bg-white border border-dashed border-[#e8e6e1] rounded-[10px] p-8 text-center">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d4d1ca" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2">
                            <line x1="18" y1="20" x2="18" y2="10" />
                            <line x1="12" y1="20" x2="12" y2="4" />
                            <line x1="6" y1="20" x2="6" y2="14" />
                        </svg>
                        <p className="text-[13px] text-[#9e9b95]">No inspection data for this month</p>
                    </div>
                )}
            </div>

            {/* SECTION 3: BOTTOM TWO COLUMNS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* LEFT — ACTIVE + COMPLETED ASSIGNMENTS */}
                <div>
                    <div className="flex items-center gap-2 mb-4">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b6860" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                        </svg>
                        <h2 className="text-[15px] font-semibold text-[#1a1a18]">Active Assignments</h2>
                    </div>

                    {activeAssignments.length === 0 ? (
                        <div className="bg-white border border-dashed border-[#e8e6e1] rounded-[12px] p-8 text-center">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d4d1ca" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3">
                                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                            </svg>
                            <p className="text-[13px] text-[#9e9b95]">No active assignments</p>
                        </div>
                    ) : (
                        activeAssignments.map((a) => (
                            <div key={a.id} className="bg-white border border-[#e8e6e1] rounded-[12px] p-5 mb-3 hover:shadow-md transition-shadow">
                                <p className="text-[10.5px] font-semibold text-[#9e9b95] uppercase tracking-[0.6px] mb-1 flex items-center gap-1">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
                                        <rect x="9" y="9" width="6" height="6" />
                                        <line x1="9" y1="1" x2="9" y2="4" />
                                        <line x1="15" y1="1" x2="15" y2="4" />
                                        <line x1="9" y1="20" x2="9" y2="23" />
                                        <line x1="15" y1="20" x2="15" y2="23" />
                                        <line x1="20" y1="9" x2="23" y2="9" />
                                        <line x1="20" y1="14" x2="23" y2="14" />
                                        <line x1="1" y1="9" x2="4" y2="9" />
                                        <line x1="1" y1="14" x2="4" y2="14" />
                                    </svg>
                                    {a.project.company.name}
                                </p>
                                <p className="text-[15px] font-semibold text-[#1a1a18] mb-3">{a.project.name}</p>
                                <div className="flex flex-col gap-1.5 mb-3">
                                    <div className="flex items-center gap-2 text-[12.5px] text-[#6b6860]">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9e9b95" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                            <circle cx="12" cy="7" r="4" />
                                        </svg>
                                        Assigned by: {a.assigner.name}
                                    </div>
                                    <div className="flex items-center gap-2 text-[12.5px] text-[#6b6860]">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9e9b95" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                            <line x1="16" y1="2" x2="16" y2="6" />
                                            <line x1="8" y1="2" x2="8" y2="6" />
                                            <line x1="3" y1="10" x2="21" y2="10" />
                                        </svg>
                                        {safeFormat(a.createdAt, "MMM d, yyyy")}
                                    </div>
                                </div>
                                <Link
                                    href={`/inspection/${a.id}/form`}
                                    className="flex items-center justify-center gap-2 w-full bg-[#1a9e6e] text-white rounded-[9px] py-2.5 text-[13px] font-medium hover:bg-[#158a5e] transition-colors"
                                >
                                    {a.inspection?.status === "draft" ? "Complete Inspection" : "Start Inspection"}
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="5" y1="12" x2="19" y2="12" />
                                        <polyline points="12 5 19 12 12 19" />
                                    </svg>
                                </Link>
                            </div>
                        ))
                    )}

                    {/* COMPLETED ASSIGNMENTS */}
                    <div className="mt-5">
                        <div className="flex items-center gap-2 mb-3">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1a9e6e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                <polyline points="22 4 12 14.01 9 11.01" />
                            </svg>
                            <h3 className="text-[13.5px] font-semibold text-[#1a1a18]">Completed Assignments</h3>
                            <span className="bg-[#e8f7f1] text-[#0d6b4a] text-[11px] font-[500] px-[8px] py-[2px] rounded-[20px]">{completedAssignments.length}</span>
                        </div>
                        {completedAssignments.length === 0 ? (
                            <div className="bg-white border border-dashed border-[#e8e6e1] rounded-[10px] p-6 text-center">
                                <p className="text-[13px] text-[#9e9b95]">No completed assignments yet</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {completedAssignments.slice(0, 10).map((a) => {
                                    const badge = a.status === "completed"
                                        ? { label: "Approved", cls: "bg-[#e8f7f1] text-[#0d6b4a]" }
                                        : a.inspection?.status === "approved"
                                            ? { label: "Approved", cls: "bg-[#e8f7f1] text-[#0d6b4a]" }
                                            : a.inspection?.status === "rejected"
                                                ? { label: "Rejected", cls: "bg-[#fef2f2] text-[#dc2626]" }
                                                : { label: "Pending Review", cls: "bg-[#fef3c7] text-[#d97706]" }
                                    return (
                                        <div key={a.id} className="bg-white border border-[#e8e6e1] rounded-[10px] p-[12px_14px] flex items-center justify-between">
                                            <div>
                                                <p className="text-[10.5px] font-semibold text-[#9e9b95] uppercase tracking-[0.6px] mb-[2px]">{a.project?.company?.name}</p>
                                                <p className="text-[13.5px] font-semibold text-[#1a1a18]">{a.project?.name}</p>
                                                <p className="text-[11.5px] text-[#9e9b95] mt-[2px]">{safeFormat(a.createdAt, "MMM d, yyyy")}</p>
                                            </div>
                                            <div className="flex items-center gap-[8px]">
                                                {a.recurrenceType && a.recurrenceType !== "none" && (
                                                    <span className="bg-[#eff6ff] text-[#1d4ed8] text-[10.5px] font-[500] px-[7px] py-[2px] rounded-[20px]">
                                                        {a.recurrenceType === "daily" ? "📅 Daily" : "🗓️ Weekly"}
                                                    </span>
                                                )}
                                                <span className={`text-[11px] font-[500] px-[10px] py-[3px] rounded-[20px] ${badge.cls}`}>{badge.label}</span>
                                                <Link
                                                    href={`/inspection/${a.id}/form`}
                                                    className="text-[12px] font-[500] text-[#6b6860] hover:text-[#1a9e6e] hover:underline"
                                                >
                                                    View →
                                                </Link>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT — ACTIVITY FEED */}
                <div>
                    <div className="flex items-center gap-2 mb-4">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b6860" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                        </svg>
                        <h2 className="text-[15px] font-semibold text-[#1a1a18]">Activity Feed</h2>
                    </div>

                    <div className="bg-white border border-[#e8e6e1] rounded-[12px] overflow-hidden">
                        {recentSubmissions.slice(0, 10).map((s) => (
                            <div key={s.id} className="p-4 border-b border-[#e8e6e1] last:border-b-0 flex items-center justify-between hover:bg-[#f9f8f5] transition-colors">
                                <div>
                                    <p className="text-[13px] font-medium text-[#1a1a18] mb-1">{s.assignment.project.name}</p>
                                    <div className="flex items-center gap-1.5 text-[12px] text-[#9e9b95]">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="12" r="10" />
                                            <polyline points="12 6 12 12 16 14" />
                                        </svg>
                                        {safeDistance(s.submittedAt || s.createdAt)} ago
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {s.status === "draft" && (
                                        <span className="bg-[#fef3c7] text-[#d97706] rounded-[20px] px-3 py-1 text-[11.5px] font-medium">Draft</span>
                                    )}
                                    {s.status === "pending" && (
                                        <span className="bg-[#e8f7f1] text-[#0d6b4a] rounded-[20px] px-3 py-1 text-[11.5px] font-medium">Submitted</span>
                                    )}
                                    {s.status === "approved" && (
                                        <span className="bg-[#eff6ff] text-[#3b82f6] rounded-[20px] px-3 py-1 text-[11.5px] font-medium">Approved</span>
                                    )}
                                    {s.status === "rejected" && (
                                        <span className="bg-[#fef2f2] text-[#dc2626] rounded-[20px] px-3 py-1 text-[11.5px] font-medium">Rejected</span>
                                    )}
                                    <Link href={`/inspection/${s.assignmentId}/form`} className="text-[12.5px] font-medium text-[#1a9e6e] hover:underline">
                                        {s.status === "draft" ? "Complete Inspection" : "Resume"} →
                                    </Link>
                                </div>
                            </div>
                        ))}
                        {recentSubmissions.length === 0 && (
                            <div className="p-8 text-center">
                                <p className="text-[13px] text-[#9e9b95]">No recent submissions</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
