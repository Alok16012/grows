"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import {
    ClipboardCheck, HardHat, CheckCircle2, Clock, Building2, Calendar, Loader2,
    UserCircle2, ClipboardList, Users, ThumbsUp, ThumbsDown, AlertTriangle,
    TrendingUp, BarChart2, CreditCard, ChevronRight
} from "lucide-react"
import Link from "next/link"
import { format, formatDistanceToNow, isValid } from "date-fns"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import BulkImportInspectors from "@/components/BulkImportInspectors"

// ─── Expense Team Summary Table ───────────────────────────────────────────────

const EXP_COLS = [
    { key: "TRAVEL",          label: "Travel",   color: "#3b82f6" },
    { key: "FUEL",            label: "Fuel",     color: "#ca8a04" },
    { key: "FOOD",            label: "Food",     color: "#f97316" },
    { key: "HOTEL",           label: "Hotel",    color: "#a855f7" },
    { key: "MATERIAL",        label: "Material", color: "#b45309" },
    { key: "MOBILE_RECHARGE", label: "Mobile",   color: "#0891b2" },
    { key: "OFFICE_SUPPLIES", label: "Office",   color: "#0d9488" },
    { key: "OTHER",           label: "Other",    color: "#6b7280" },
]

function fmt(n: number) {
    return n > 0 ? "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 }) : "—"
}

function ExpenseTeamTable() {
    const now = new Date()
    const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`)
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        setLoading(true)
        fetch(`/api/expenses/team-summary?month=${month}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { setData(d); setLoading(false) })
            .catch(() => setLoading(false))
    }, [month])

    // Build month options: last 6 months
    const monthOptions = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        return { val, label: d.toLocaleString("en-IN", { month: "short", year: "numeric" }) }
    })

    return (
        <div className="bg-white border border-[#e8e6e1] rounded-[14px] overflow-hidden mt-4">
            {/* Header */}
            <div className="p-4 border-b border-[#e8e6e1] flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-1">
                    <CreditCard className="h-4 w-4 text-[#1a9e6e]" />
                    <span className="text-[13.5px] font-semibold text-[#1a1a18]">Employee Expense Summary</span>
                    {data && (
                        <span className="text-[11px] bg-[#e8f7f1] text-[#0d6b4a] px-2 py-0.5 rounded-full font-medium">
                            {data.monthLabel}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={month}
                        onChange={e => setMonth(e.target.value)}
                        className="h-8 rounded-[7px] border border-[#e8e6e1] bg-white px-2 text-[12px] text-[#1a1a18] outline-none focus:border-[#1a9e6e]"
                    >
                        {monthOptions.map(o => (
                            <option key={o.val} value={o.val}>{o.label}</option>
                        ))}
                    </select>
                    <Link href="/expenses" className="text-[12.5px] font-medium text-[#1a9e6e] hover:underline whitespace-nowrap">
                        View All →
                    </Link>
                </div>
            </div>

            {/* Table */}
            {loading ? (
                <div className="p-6 flex justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-[#9e9b95]" />
                </div>
            ) : !data || data.rows.length === 0 ? (
                <div className="p-8 text-center">
                    <CreditCard className="h-8 w-8 text-[#d4d1ca] mx-auto mb-3" />
                    <p className="text-[13px] text-[#9e9b95]">No expenses submitted for this month.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full" style={{ fontSize: 12 }}>
                        <thead>
                            <tr style={{ borderBottom: "1px solid #e8e6e1", background: "#f9f8f5" }}>
                                <th style={{ textAlign: "left", padding: "8px 16px", fontWeight: 600, color: "#6b6860", whiteSpace: "nowrap" }}>Employee</th>
                                <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, color: "#6b6860", whiteSpace: "nowrap" }}>Department</th>
                                {EXP_COLS.map(c => (
                                    <th key={c.key} style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: c.color, whiteSpace: "nowrap" }}>
                                        {c.label}
                                    </th>
                                ))}
                                <th style={{ textAlign: "right", padding: "8px 16px", fontWeight: 700, color: "#1a1a18", whiteSpace: "nowrap" }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.rows.map((row: any) => (
                                <tr key={row.id} style={{ borderBottom: "1px solid #f0eeea" }}
                                    className="hover:bg-[#f9f8f5] transition-colors">
                                    <td style={{ padding: "9px 16px", whiteSpace: "nowrap" }}>
                                        <p style={{ fontWeight: 600, color: "#1a1a18", fontSize: 12.5 }}>{row.name}</p>
                                        <p style={{ color: "#9e9b95", fontSize: 11 }}>{row.employeeId} · {row.designation}</p>
                                    </td>
                                    <td style={{ padding: "9px 10px", color: "#6b6860", whiteSpace: "nowrap" }}>{row.department}</td>
                                    {EXP_COLS.map(c => (
                                        <td key={c.key} style={{ textAlign: "right", padding: "9px 10px", color: row[c.key] > 0 ? c.color : "#d4d1ca", fontWeight: row[c.key] > 0 ? 600 : 400 }}>
                                            {fmt(row[c.key])}
                                        </td>
                                    ))}
                                    <td style={{ textAlign: "right", padding: "9px 16px", fontWeight: 700, color: "#1a1a18", whiteSpace: "nowrap" }}>
                                        {fmt(row.total)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr style={{ borderTop: "2px solid #e8e6e1", background: "#f9f8f5" }}>
                                <td style={{ padding: "9px 16px", fontWeight: 700, color: "#1a1a18" }} colSpan={2}>Total</td>
                                {EXP_COLS.map(c => (
                                    <td key={c.key} style={{ textAlign: "right", padding: "9px 10px", fontWeight: 700, color: data.totals[c.key] > 0 ? c.color : "#d4d1ca" }}>
                                        {fmt(data.totals[c.key])}
                                    </td>
                                ))}
                                <td style={{ textAlign: "right", padding: "9px 16px", fontWeight: 800, color: "#1a1a18", fontSize: 13 }}>
                                    {fmt(data.totals.total)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </div>
    )
}

function safeFormat(val: any, fmt: string): string {
    try { if (!val) return "—"; const d = new Date(val); if (!isValid(d)) return "—"; return format(d, fmt) } catch { return "—" }
}
function safeDistance(val: any): string {
    try { if (!val) return "—"; const d = new Date(val); if (!isValid(d)) return "—"; return formatDistanceToNow(d) } catch { return "—" }
}

export default function ManagerDashboard() {
    const { data: session } = useSession()
    const [stats, setStats] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetch("/api/manager/stats")
            .then(r => r.json())
            .then(d => setStats(d))
            .catch(e => console.error(e))
            .finally(() => setLoading(false))
    }, [])

    if (loading) {
        return (
            <div className="min-h-screen bg-[#f5f4f0] p-4 lg:p-7 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[120px] rounded-[14px]" />)}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Skeleton className="h-[400px] rounded-[14px]" />
                    <Skeleton className="h-[400px] rounded-[14px]" />
                </div>
            </div>
        )
    }

    if (!stats || stats.error) {
        return (
            <div className="min-h-screen bg-[#f5f4f0] p-7 flex items-center justify-center">
                <div className="flex min-h-[400px] flex-col items-center justify-center rounded-lg border border-dashed shadow-sm bg-white max-w-md">
                    <div className="flex flex-col items-center gap-2 text-center p-8">
                        <div className="h-10 w-10 text-[#dc2626] bg-[#fef2f2] rounded-full flex items-center justify-center mb-2">
                            <ClipboardList className="h-6 w-6" />
                        </div>
                        <h3 className="text-xl font-bold tracking-tight text-[#1a1a18]">Failed to load dashboard data</h3>
                        <p className="text-[13px] text-[#6b6860]">{stats?.error || "An unexpected error occurred."}</p>
                        <Button onClick={() => window.location.reload()} className="mt-4 bg-[#1a9e6e] hover:bg-[#158a5e]">Try Again</Button>
                    </div>
                </div>
            </div>
        )
    }

    const kpiCards = [
        { title: "Pending Approvals", value: stats.pendingApprovals, icon: ClipboardCheck, color: "#d97706", bg: "#fef3c7", link: "/approvals" },
        { title: "Active Assignments", value: stats.activeAssignments, icon: Users, color: "#1a9e6e", bg: "#e8f7f1", link: "/assignments" },
        { title: "Completed This Month", value: stats.completedThisMonth, icon: CheckCircle2, color: "#3b82f6", bg: "#eff6ff", link: "/approvals" },
        { title: "Overdue (>7 days)", value: stats.overdueInspections || 0, icon: AlertTriangle, color: "#dc2626", bg: "#fef2f2", link: "/approvals" },
    ]

    return (
        <div className="min-h-screen bg-[#f5f4f0] p-4 lg:p-7">
            {/* Mobile Welcome Banner */}
            <div className="md:hidden bg-gradient-to-br from-[#1a9e6e] to-[#0d6b4a] rounded-[16px] p-4 text-white shadow-sm mb-4">
                <p className="text-[11px] font-medium opacity-70 mb-0.5 uppercase tracking-wider">Welcome back 👋</p>
                <p className="text-[20px] font-bold tracking-tight">Manager Dashboard</p>
                <p className="text-[12px] opacity-70 mt-1">Monitor operations and review pending inspections</p>
            </div>

            {/* Desktop Header */}
            <div className="hidden md:flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-[22px] font-semibold text-[#1a1a18] tracking-[-0.4px]">Manager Dashboard</h1>
                    <p className="text-[13px] text-[#6b6860] mt-[3px]">Monitor operations and review pending inspections</p>
                </div>
                <div className="flex items-center gap-3">
                    <Link href="/manager/analytics" className="flex items-center gap-2 bg-white border border-[#e8e6e1] rounded-[10px] px-3 py-2 text-[13px] font-medium text-[#1a1a18] hover:bg-[#f9f8f5] transition-colors">
                        <BarChart2 className="h-4 w-4 text-[#1a9e6e]" /> Analytics
                    </Link>
                    <BulkImportInspectors />
                </div>
            </div>

            <div className="md:hidden mb-4">
                <div className="flex gap-2 mb-3">
                    <Link href="/manager/analytics" className="flex items-center gap-2 bg-white border border-[#e8e6e1] rounded-[10px] px-3 py-2 text-[13px] font-medium text-[#1a1a18]">
                        <BarChart2 className="h-4 w-4 text-[#1a9e6e]" /> Analytics
                    </Link>
                </div>
                <BulkImportInspectors />
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 md:mb-5">
                {kpiCards.map((card) => (
                    <Link key={card.title} href={card.link}>
                        <div className="bg-white border border-[#e8e6e1] rounded-[14px] p-4 sm:p-5 hover:shadow-md transition-shadow">
                            <div className="w-9 h-9 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: card.bg }}>
                                <card.icon className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: card.color }} />
                            </div>
                            <p className="text-[12px] sm:text-[13px] text-[#6b6860] mb-1">{card.title}</p>
                            <p className="text-[26px] sm:text-[32px] font-bold text-[#1a1a18] tracking-[-1px] tabular-nums">{card.value}</p>
                        </div>
                    </Link>
                ))}
            </div>

            {/* Risk Alerts */}
            {stats.riskAlerts && stats.riskAlerts.length > 0 && (
                <div className="bg-white border border-[#fbbf24] rounded-[14px] overflow-hidden mb-4">
                    <div className="p-4 border-b border-[#fef3c7] bg-[#fffbeb] flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-[#d97706]" />
                        <span className="text-[13.5px] font-semibold text-[#92400e]">⚠️ Risk Alerts — High Defect Projects</span>
                        <span className="ml-auto text-[11px] text-[#d97706]">{stats.riskAlerts.length} project{stats.riskAlerts.length !== 1 ? "s" : ""} at risk</span>
                    </div>
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {stats.riskAlerts.map((alert: any) => (
                            <div key={alert.projectId} className="bg-[#fef3c7] border border-[#fbbf24] rounded-[10px] p-3">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                    <p className="text-[13px] font-semibold text-[#92400e] truncate">{alert.projectName}</p>
                                    <span className="text-[11px] font-bold text-[#dc2626] shrink-0">{alert.rejectionRate}% rej.</span>
                                </div>
                                <p className="text-[11px] text-[#a16207]">{alert.companyName}</p>
                                <div className="flex items-center gap-3 mt-2 text-[11px] text-[#92400e]">
                                    <span>{alert.total} total inspections</span>
                                    {alert.avgSentBack > 0 && <span>• {alert.avgSentBack}x avg sent back</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Pending Approvals */}
                <div className="bg-white border border-[#e8e6e1] rounded-[14px] overflow-hidden">
                    <div className="p-4 border-b border-[#e8e6e1] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-[#d97706]" />
                            <span className="text-[13.5px] font-semibold text-[#1a1a18]">Pending Approvals</span>
                        </div>
                        <Link href="/approvals" className="text-[12.5px] font-medium text-[#1a9e6e] hover:underline">View All →</Link>
                    </div>
                    <div className="p-5">
                        {stats.recentPending.length === 0 ? (
                            <div className="text-center py-10 px-5">
                                <CheckCircle2 className="h-8 w-8 text-[#d4d1ca] mx-auto mb-3" />
                                <p className="text-[13px] text-[#9e9b95]">All caught up! No pending approvals.</p>
                            </div>
                        ) : (
                            stats.recentPending.map((i: any) => (
                                <Link key={i.id} href={`/approvals/${i.id}`} className="block">
                                    <div className="flex items-center justify-between py-3 border-b border-[#e8e6e1] last:border-b-0 hover:bg-[#f9f8f5] -mx-2 px-2 rounded-[8px] transition-colors">
                                        <div className="min-w-0 pr-4">
                                            <p className="text-[13px] font-medium text-[#1a1a18] truncate">{i.projectName}</p>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="flex items-center gap-1 text-[12px] text-[#6b6860]">
                                                    <UserCircle2 className="h-3 w-3 text-[#9e9b95]" />{i.inspectorName}
                                                </span>
                                                <span className="flex items-center gap-1 text-[12px] text-[#9e9b95]">
                                                    <Calendar className="h-3 w-3" />{safeDistance(i.submittedAt)} ago
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-[11px] bg-[#fef3c7] text-[#d97706] px-2 py-0.5 rounded-full font-medium">Pending</span>
                                        </div>
                                    </div>
                                </Link>
                            ))
                        )}
                    </div>
                </div>

                {/* Recent Assignments */}
                <div className="bg-white border border-[#e8e6e1] rounded-[14px] overflow-hidden">
                    <div className="p-4 border-b border-[#e8e6e1] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <ClipboardList className="h-4 w-4 text-[#6b6860]" />
                            <span className="text-[13.5px] font-semibold text-[#1a1a18]">Recent Assignments</span>
                        </div>
                        <Link href="/assignments" className="text-[12.5px] font-medium text-[#1a9e6e] hover:underline">View All →</Link>
                    </div>
                    <div>
                        {stats.recentAssignments.length === 0 ? (
                            <div className="text-center py-10 px-5">
                                <ClipboardList className="h-8 w-8 text-[#d4d1ca] mx-auto mb-3" />
                                <p className="text-[13px] text-[#9e9b95]">No recent assignments.</p>
                            </div>
                        ) : (
                            stats.recentAssignments.map((a: any) => (
                                <div key={a.id} className="p-5 border-b border-[#e8e6e1] last:border-b-0 hover:bg-[#f9f8f5] transition-colors">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-[13.5px] font-semibold text-[#1a1a18] mb-1.5">{a.projectName}</p>
                                            <div className="flex items-center gap-3">
                                                <span className="flex items-center gap-1 text-[12.5px] text-[#6b6860]">
                                                    <Users className="h-3 w-3 text-[#9e9b95]" />{a.inspectorName}
                                                </span>
                                                <span className="flex items-center gap-1 text-[12.5px] text-[#9e9b95]">
                                                    <Calendar className="h-3 w-3" />{safeFormat(a.createdAt, "MMM d, yyyy")}
                                                </span>
                                            </div>
                                        </div>
                                        <span className={cn(
                                            "rounded-[20px] px-3 py-1 text-[11.5px] font-medium",
                                            a.status === "active" ? "bg-[#e8f7f1] text-[#0d6b4a]" :
                                            a.status === "pending" ? "bg-[#fef3c7] text-[#d97706]" :
                                            a.status === "completed" ? "bg-[#eff6ff] text-[#1d4ed8]" : "bg-[#f9f8f5] text-[#6b6860]"
                                        )}>
                                            {a.status}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Employee Expense Summary */}
            <ExpenseTeamTable />

            {/* Quick Links */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: "Performance Analytics", href: "/manager/analytics", icon: TrendingUp, color: "#1a9e6e" },
                    { label: "All Reports", href: "/reports", icon: BarChart2, color: "#3b82f6" },
                    { label: "All Approvals", href: "/approvals", icon: ClipboardCheck, color: "#d97706" },
                    { label: "Assignments", href: "/assignments", icon: HardHat, color: "#6b6860" },
                ].map(q => (
                    <Link key={q.href} href={q.href} className="bg-white border border-[#e8e6e1] rounded-[12px] p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
                        <q.icon className="h-5 w-5 shrink-0" style={{ color: q.color }} />
                        <span className="text-[12.5px] font-medium text-[#1a1a18]">{q.label}</span>
                    </Link>
                ))}
            </div>
        </div>
    )
}
