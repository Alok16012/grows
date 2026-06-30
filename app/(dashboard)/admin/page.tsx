"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import {
    Building2,
    Folder,
    ClipboardCheck,
    Users,
    ArrowRight,
    TrendingUp,
    TrendingDown,
    XCircle,
    MoreHorizontal,
    ChevronDown,
    Filter,
    ArrowUpRight,
    Search,
    Plus,
    ClipboardList,
    CreditCard,
    Loader2,
} from "lucide-react"
import Link from "next/link"
import { format } from "date-fns"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

// ─── Expense Team Summary (reused on admin dashboard) ────────────────────────

const EXP_COLS_ADMIN = [
    { key: "TRAVEL",          label: "Travel",   color: "#3b82f6" },
    { key: "FUEL",            label: "Fuel",     color: "#ca8a04" },
    { key: "FOOD",            label: "Food",     color: "#f97316" },
    { key: "HOTEL",           label: "Hotel",    color: "#a855f7" },
    { key: "MATERIAL",        label: "Material", color: "#b45309" },
    { key: "MOBILE_RECHARGE", label: "Mobile",   color: "#0891b2" },
    { key: "OFFICE_SUPPLIES", label: "Office",   color: "#0d9488" },
    { key: "OTHER",           label: "Other",    color: "#6b7280" },
]

function fmtAdmin(n: number) {
    return n > 0 ? "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 }) : "—"
}

function AdminExpenseTable() {
    const now = new Date()
    const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`)
    const [data, setData] = useState<any>(null)
    const [loadingExp, setLoadingExp] = useState(true)

    useEffect(() => {
        setLoadingExp(true)
        fetch(`/api/expenses/team-summary?month=${month}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { setData(d); setLoadingExp(false) })
            .catch(() => setLoadingExp(false))
    }, [month])

    const monthOptions = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        return { val, label: d.toLocaleString("en-IN", { month: "short", year: "numeric" }) }
    })

    return (
        <div className="bg-white border border-[var(--border)] rounded-[14px] overflow-hidden mt-4">
            <div className="p-4 border-b border-[var(--border)] flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-1">
                    <CreditCard className="h-4 w-4 text-[var(--accent)]" />
                    <span className="text-[13.5px] font-semibold text-[var(--text)]">Employee Expense Summary</span>
                    {data && <span className="text-[11px] bg-[#e8f7f1] text-[#0d6b4a] px-2 py-0.5 rounded-full font-medium">{data.monthLabel}</span>}
                </div>
                <div className="flex items-center gap-2">
                    <select value={month} onChange={e => setMonth(e.target.value)}
                        className="h-8 rounded-[7px] border border-[var(--border)] bg-white px-2 text-[12px] text-[var(--text)] outline-none">
                        {monthOptions.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
                    </select>
                    <Link href="/expenses" className="text-[12.5px] font-medium text-[var(--accent)] hover:underline whitespace-nowrap">View All →</Link>
                </div>
            </div>
            {loadingExp ? (
                <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-[var(--text3)]" /></div>
            ) : !data || data.rows.length === 0 ? (
                <div className="p-8 text-center">
                    <CreditCard className="h-8 w-8 text-[var(--text3)] mx-auto mb-3" />
                    <p className="text-[13px] text-[var(--text3)]">No expenses submitted for this month.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full" style={{ fontSize: 12 }}>
                        <thead>
                            <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface2)" }}>
                                <th style={{ textAlign: "left", padding: "8px 16px", fontWeight: 600, color: "var(--text2)", whiteSpace: "nowrap" }}>Employee</th>
                                <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, color: "var(--text2)", whiteSpace: "nowrap" }}>Department</th>
                                {EXP_COLS_ADMIN.map(c => (
                                    <th key={c.key} style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: c.color, whiteSpace: "nowrap" }}>{c.label}</th>
                                ))}
                                <th style={{ textAlign: "right", padding: "8px 16px", fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap" }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.rows.map((row: any) => (
                                <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }} className="hover:bg-[var(--surface2)] transition-colors">
                                    <td style={{ padding: "9px 16px", whiteSpace: "nowrap" }}>
                                        <p style={{ fontWeight: 600, color: "var(--text)", fontSize: 12.5 }}>{row.name}</p>
                                        <p style={{ color: "var(--text3)", fontSize: 11 }}>{row.employeeId} · {row.designation}</p>
                                    </td>
                                    <td style={{ padding: "9px 10px", color: "var(--text2)", whiteSpace: "nowrap" }}>{row.department}</td>
                                    {EXP_COLS_ADMIN.map(c => (
                                        <td key={c.key} style={{ textAlign: "right", padding: "9px 10px", color: row[c.key] > 0 ? c.color : "var(--text3)", fontWeight: row[c.key] > 0 ? 600 : 400 }}>
                                            {fmtAdmin(row[c.key])}
                                        </td>
                                    ))}
                                    <td style={{ textAlign: "right", padding: "9px 16px", fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap" }}>{fmtAdmin(row.total)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr style={{ borderTop: "2px solid var(--border)", background: "var(--surface2)" }}>
                                <td style={{ padding: "9px 16px", fontWeight: 700, color: "var(--text)" }} colSpan={2}>Total</td>
                                {EXP_COLS_ADMIN.map(c => (
                                    <td key={c.key} style={{ textAlign: "right", padding: "9px 10px", fontWeight: 700, color: data.totals[c.key] > 0 ? c.color : "var(--text3)" }}>
                                        {fmtAdmin(data.totals[c.key])}
                                    </td>
                                ))}
                                <td style={{ textAlign: "right", padding: "9px 16px", fontWeight: 800, color: "var(--text)", fontSize: 13 }}>{fmtAdmin(data.totals.total)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </div>
    )
}

// ─── Recruitment scoreboard (per-HR) ─────────────────────────────────────────
function AdminRecruitmentTable() {
    const now = new Date()
    const [month, setMonth] = useState("ALL")
    const [data, setData] = useState<any>(null)
    const [loadingRec, setLoadingRec] = useState(true)

    useEffect(() => {
        setLoadingRec(true)
        const qs = month === "ALL" ? "" : `?month=${month}`
        fetch(`/api/admin/recruitment-summary${qs}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { setData(d); setLoadingRec(false) })
            .catch(() => setLoadingRec(false))
    }, [month])

    const monthOptions = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        return { val, label: d.toLocaleString("en-IN", { month: "short", year: "numeric" }) }
    })

    const REC_COLS = [
        { key: "recruited", label: "Recruited", color: "#3b82f6" },
        { key: "interviewed", label: "Interviewed", color: "#f59e0b" },
        { key: "selected", label: "Selected", color: "#8b5cf6" },
        { key: "onboarded", label: "Onboarded", color: "#047857" },
    ]

    return (
        <div className="bg-white border border-[var(--border)] rounded-[14px] overflow-hidden">
            <div className="p-4 border-b border-[var(--border)] flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-1">
                    <Users className="h-4 w-4 text-[var(--accent)]" />
                    <span className="text-[13.5px] font-semibold text-[var(--text)]">Recruitment by HR</span>
                    <span className="text-[11px] text-[var(--text3)]">Who recruited & onboarded how many</span>
                </div>
                <div className="flex items-center gap-2">
                    <select value={month} onChange={e => setMonth(e.target.value)}
                        className="h-8 rounded-[7px] border border-[var(--border)] bg-white px-2 text-[12px] text-[var(--text)] outline-none">
                        <option value="ALL">All time</option>
                        {monthOptions.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
                    </select>
                    <Link href="/recruitment" className="text-[12.5px] font-medium text-[var(--accent)] hover:underline whitespace-nowrap">View All →</Link>
                </div>
            </div>
            {loadingRec ? (
                <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-[var(--text3)]" /></div>
            ) : !data || !data.rows || data.rows.length === 0 ? (
                <div className="p-8 text-center">
                    <Users className="h-8 w-8 text-[var(--text3)] mx-auto mb-3" />
                    <p className="text-[13px] text-[var(--text3)]">No recruitment activity for this period.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full" style={{ fontSize: 12 }}>
                        <thead>
                            <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface2)" }}>
                                <th style={{ textAlign: "left", padding: "8px 16px", fontWeight: 600, color: "var(--text2)", whiteSpace: "nowrap" }}>HR / Recruiter</th>
                                {REC_COLS.map(c => (
                                    <th key={c.key} style={{ textAlign: "right", padding: "8px 12px", fontWeight: 600, color: c.color, whiteSpace: "nowrap" }}>{c.label}</th>
                                ))}
                                <th style={{ textAlign: "right", padding: "8px 16px", fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap" }}>Conv.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.rows.map((row: any) => (
                                <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }} className="hover:bg-[var(--surface2)] transition-colors">
                                    <td style={{ padding: "9px 16px", fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap" }}>{row.name}</td>
                                    {REC_COLS.map(c => (
                                        <td key={c.key} style={{ textAlign: "right", padding: "9px 12px", color: row[c.key] > 0 ? c.color : "var(--text3)", fontWeight: row[c.key] > 0 ? 600 : 400 }}>
                                            {row[c.key] || "—"}
                                        </td>
                                    ))}
                                    <td style={{ textAlign: "right", padding: "9px 16px" }}>
                                        <span className={cn(
                                            "px-2 py-0.5 rounded-full text-[11px] font-semibold",
                                            row.conversion >= 50 ? "bg-green-100 text-green-700" : row.conversion >= 20 ? "bg-amber-100 text-amber-700" : "bg-[var(--surface2)] text-[var(--text3)]"
                                        )}>{row.conversion}%</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr style={{ borderTop: "2px solid var(--border)", background: "var(--surface2)" }}>
                                <td style={{ padding: "9px 16px", fontWeight: 700, color: "var(--text)" }}>Total</td>
                                {REC_COLS.map(c => (
                                    <td key={c.key} style={{ textAlign: "right", padding: "9px 12px", fontWeight: 700, color: data.totals[c.key] > 0 ? c.color : "var(--text3)" }}>
                                        {data.totals[c.key] || "—"}
                                    </td>
                                ))}
                                <td style={{ textAlign: "right", padding: "9px 16px", fontWeight: 800, color: "var(--text)" }}>
                                    {data.totals.recruited > 0 ? Math.round((data.totals.onboarded / data.totals.recruited) * 100) : 0}%
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </div>
    )
}

export default function AdminDashboard() {
    const { data: session } = useSession()
    const [stats, setStats] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch("/api/admin/stats")
                const data = await res.json()
                setStats(data)
            } catch (error) {
                console.error("Failed to fetch admin stats", error)
            } finally {
                setLoading(false)
            }
        }
        fetchStats()
    }, [])

    if (loading) {
        return (
            <div className="space-y-6 animate-pulse p-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-[14px]">
                    {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-28 w-full rounded-[14px]" />
                    ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-[14px]">
                    <Skeleton className="h-48 col-span-1 rounded-[14px]" />
                    <Skeleton className="h-48 col-span-1 rounded-[14px]" />
                    <Skeleton className="h-48 col-span-2 rounded-[14px]" />
                </div>
            </div>
        )
    }

    if (!stats || stats.error) {
        return (
            <div className="flex h-[400px] flex-col items-center justify-center m-4 rounded-[14px] border border-dashed border-[var(--border)] bg-white">
                <XCircle size={40} className="text-[var(--red)] mb-4" />
                <h3 className="text-[18px] font-bold text-[var(--text)] mb-2">Failed to load data</h3>
                <p className="text-[13px] text-[var(--text2)] mb-6">{stats?.error || "Connection error"}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="px-6 py-2 bg-[var(--accent)] text-white text-[13px] font-semibold rounded-[8px] hover:opacity-90 transition-all"
                >
                    Retry
                </button>
            </div>
        )
    }

    const statRow = [
        { label: "Companies", value: stats.totalCompanies ?? 0, sub: "Across all regions", icon: Building2 },
        { label: "Projects", value: stats.totalProjects ?? 0, sub: "Active management", icon: Folder },
        { label: "Pending", value: stats.pendingApprovals ?? 0, sub: "Action required", icon: ClipboardCheck },
        { label: "Users", value: stats.totalUsers ?? 0, sub: "System access", icon: Users },
    ]

    return (
        <div className="p-4 lg:p-6 space-y-4 bg-[var(--bg)] min-h-screen">
            {/* Mobile Welcome Banner */}
            <div className="md:hidden bg-gradient-to-br from-[#1a9e6e] to-[#0d6b4a] rounded-[16px] p-4 text-white shadow-sm">
                <p className="text-[11px] font-medium opacity-70 mb-0.5 uppercase tracking-wider">Welcome back 👋</p>
                <p className="text-[20px] font-bold tracking-tight">Admin Dashboard</p>
                <div className="flex items-center gap-2 mt-3">
                    <div className="flex-1 bg-white/10 rounded-[10px] p-2.5 text-center">
                        <p className="text-[20px] font-bold tabular-nums">{stats.totalCompanies ?? 0}</p>
                        <p className="text-[10px] opacity-70 mt-0.5">Companies</p>
                    </div>
                    <div className="flex-1 bg-white/10 rounded-[10px] p-2.5 text-center">
                        <p className="text-[20px] font-bold tabular-nums">{stats.totalProjects ?? 0}</p>
                        <p className="text-[10px] opacity-70 mt-0.5">Projects</p>
                    </div>
                    <div className="flex-1 bg-white/10 rounded-[10px] p-2.5 text-center">
                        <p className="text-[20px] font-bold tabular-nums">{stats.pendingApprovals ?? 0}</p>
                        <p className="text-[10px] opacity-70 mt-0.5">Pending</p>
                    </div>
                    <div className="flex-1 bg-white/10 rounded-[10px] p-2.5 text-center">
                        <p className="text-[20px] font-bold tabular-nums">{stats.totalUsers ?? 0}</p>
                        <p className="text-[10px] opacity-70 mt-0.5">Users</p>
                    </div>
                </div>
            </div>

            {/* Page Header — Desktop only */}
            <div className="hidden md:flex items-center justify-between">
                <h1 className="text-[20px] font-semibold text-[var(--text)] tracking-tight">Admin Dashboard</h1>
                <div className="flex items-center gap-2">
                    <button className="h-9 px-4 flex items-center gap-2 bg-white border border-[var(--border)] rounded-[8px] text-[13px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] transition-all">
                        <Filter size={16} />
                        Filter
                    </button>
                    <button className="h-9 px-4 flex items-center gap-2 bg-[var(--accent)] text-white rounded-[8px] text-[13px] font-semibold hover:opacity-90 transition-all shadow-sm">
                        Export Data
                    </button>
                </div>
            </div>

            {/* STAT ROW — Desktop only (mobile uses welcome banner above) */}
            <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-[14px]">
                {statRow.map((stat) => (
                    <div key={stat.label} className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-4 flex flex-col justify-between hover:shadow-sm transition-all group">
                        <div className="flex items-center justify-between mb-3 text-[11.5px] font-medium text-[var(--text2)]">
                            {stat.label}
                            <stat.icon size={16} className="text-[var(--text3)] group-hover:text-[var(--accent)] transition-colors" />
                        </div>
                        <div>
                            <div className="text-[24px] font-semibold text-[var(--text)] leading-tight mb-0.5">{stat.value}</div>
                            <div className="text-[11px] text-[var(--text3)]">{stat.sub}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Recruitment scoreboard (per-HR) — placed up top per request */}
            <AdminRecruitmentTable />

            {/* ALERT CARDS — Mobile quick-action row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-[14px]">
                {/* Card 1: Safety Compliance */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-[18px] flex flex-col justify-between hover:shadow-sm transition-all">
                    <div className="flex items-start justify-between">
                        <div>
                            <h3 className="text-[13px] font-medium text-[var(--text)] leading-none mb-1">Safety Score</h3>
                            <p className="text-[11.5px] text-[var(--text2)]">Compliance rate</p>
                        </div>
                        <div className="h-8 w-8 rounded-full border border-[var(--border)] bg-[var(--surface2)] flex items-center justify-center text-[var(--text2)]">
                            <TrendingUp size={16} />
                        </div>
                    </div>
                    <div className="mt-6 mb-6">
                        <div className="flex items-baseline gap-2">
                            <span className="text-[28px] font-semibold text-[var(--text)]">98%</span>
                            <span className="text-[12px] text-[var(--text2)]">Items</span>
                        </div>
                        <div className="mt-2 flex items-center gap-1.5 w-fit h-6 px-2.5 rounded-full bg-[var(--accent-light)] text-[var(--accent-text)] text-[11px] font-semibold">
                            <ArrowUpRight size={12} className="stroke-[3px]" />
                            +2.4%
                        </div>
                    </div>
                    <div className="pt-4 border-t border-[var(--border)] flex items-center justify-between group cursor-pointer text-[12.5px] font-medium text-[var(--text)]">
                        Central District
                        <ArrowRight size={14} className="text-[var(--text3)] group-hover:translate-x-1 transition-transform" />
                    </div>
                </div>

                {/* Card 2: Pending Approvals */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-[18px] flex flex-col justify-between hover:shadow-sm transition-all">
                    <div className="flex items-start justify-between">
                        <div>
                            <h3 className="text-[13px] font-medium text-[var(--text)] leading-none mb-1">Approvals</h3>
                            <p className="text-[11.5px] text-[var(--text2)]">Action required</p>
                        </div>
                        <div className="h-8 w-8 rounded-full border border-[var(--border)] bg-[var(--surface2)] flex items-center justify-center text-[var(--text2)]">
                            <ClipboardCheck size={16} />
                        </div>
                    </div>
                    <div className="mt-6 mb-6">
                        <div className="flex items-baseline gap-2">
                            <span className="text-[28px] font-semibold text-[var(--text)]">{stats.pendingApprovals ?? 0}</span>
                            <span className="text-[12px] text-[var(--text2)]">Reports</span>
                        </div>
                        <div className={cn(
                            "mt-2 flex items-center gap-1.5 w-fit h-6 px-2.5 rounded-full text-[11px] font-semibold",
                            (stats.pendingApprovals ?? 0) > 0
                                ? "bg-[var(--amber-light)] text-[var(--amber)]"
                                : "bg-[var(--accent-light)] text-[var(--accent-text)]"
                        )}>
                            {(stats.pendingApprovals ?? 0) > 0 ? (
                                <><TrendingUp size={12} className="stroke-[3px]" /> Urgent</>
                            ) : (
                                <><ArrowUpRight size={12} className="stroke-[3px]" /> Clear</>
                            )}
                        </div>
                    </div>
                    <Link href="/approvals" className="pt-4 border-t border-[var(--border)] flex items-center justify-between group text-[12.5px] font-medium text-[var(--text)]">
                        Process All
                        <ArrowRight size={14} className="text-[var(--text3)] group-hover:translate-x-1 transition-transform" />
                    </Link>
                </div>

                {/* Card 3: Completion Chart placeholder */}
                <div className="md:col-span-2 bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-[18px] flex flex-col hover:shadow-sm transition-all">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <h3 className="text-[13px] font-medium text-[var(--text)] leading-none">Completion rate</h3>
                            <div className="h-6 flex items-center gap-1 px-2.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface2)] text-[11px] text-[var(--text2)] font-medium cursor-pointer hover:bg-white transition-all">
                                Last 30 days
                                <ChevronDown size={12} />
                            </div>
                        </div>
                        <button className="h-8 w-8 rounded-full hover:bg-[var(--surface2)] flex items-center justify-center text-[var(--text3)] transition-all">
                            <MoreHorizontal size={18} />
                        </button>
                    </div>

                    <div className="flex-1 flex flex-col justify-center">
                        <div className="flex items-baseline gap-4 mb-4">
                            <div className="text-[32px] font-semibold text-[var(--text)] tabular-nums">12,482</div>
                            <div className="h-6 flex items-center gap-1 px-2.5 rounded-full bg-[var(--accent-light)] text-[var(--accent-text)] text-[11px] font-semibold">
                                +12% vs previous period
                            </div>
                        </div>

                        {/* Dummy mini-chart bars */}
                        <div className="flex items-end gap-1.5 h-20 w-full mt-2">
                            {[40, 60, 45, 80, 55, 70, 90, 65, 50, 85, 45, 75, 95, 60, 40].map((h, i) => (
                                <div
                                    key={i}
                                    style={{ height: `${h}%` }}
                                    className={cn(
                                        "flex-1 rounded-t-[3px] transition-all duration-500",
                                        i === 12 ? "bg-[var(--accent)]" : "bg-[var(--accent-light)] group-hover:bg-[var(--accent)]/30"
                                    )}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="mt-6 flex items-center justify-between text-[11px] text-[var(--text3)] font-medium uppercase tracking-wider">
                        <span>Feb 1</span>
                        <span>Feb 15</span>
                        <span>Mar 1</span>
                    </div>
                </div>
            </div>

            {/* Recent Submissions & Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-[14px]">
                {/* Recent Submissions */}
                <div className="lg:col-span-2 bg-[var(--surface)] border border-[var(--border)] rounded-[14px] overflow-hidden">
                    <div className="px-4 py-3.5 border-b border-[var(--border)] flex items-center justify-between">
                        <h3 className="text-[14px] font-semibold text-[var(--text)] leading-none">Recent Submissions</h3>
                        <Link href="/approvals" className="text-[12px] font-medium text-[var(--accent-text)] hover:underline">View All</Link>
                    </div>

                    {/* Mobile card list */}
                    <div className="sm:hidden divide-y divide-[var(--border)]">
                        {(stats.recentInspections || []).length === 0 ? (
                            <p className="text-center text-[13px] text-[var(--text3)] py-8">No submissions yet</p>
                        ) : (stats.recentInspections || []).map((i: any) => (
                            <Link key={i.id} href={`/approvals/${i.id}`} className="flex items-center justify-between px-4 py-3.5 hover:bg-[var(--surface2)] transition-colors active:bg-[var(--surface2)]">
                                <div className="min-w-0 mr-3">
                                    <p className="text-[13px] font-medium text-[var(--text)] truncate">{i.projectName}</p>
                                    <p className="text-[11.5px] text-[var(--text3)] mt-0.5">{i.inspectorName} · {i.submittedAt ? format(new Date(i.submittedAt), "MMM d, HH:mm") : "—"}</p>
                                </div>
                                <span className={cn(
                                    "shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase",
                                    i.status === "pending" ? "bg-[var(--amber-light)] text-[var(--amber)]" :
                                        i.status === "approved" ? "bg-[var(--accent-light)] text-[var(--accent-text)]" :
                                            "bg-[var(--red-light)] text-[var(--red)]"
                                )}>
                                    {i.status}
                                </span>
                            </Link>
                        ))}
                    </div>

                    {/* Desktop table */}
                    <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-[var(--surface2)]/50 border-b border-[var(--border)]">
                                <tr>
                                    <th className="px-5 py-3 text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider">Project</th>
                                    <th className="px-5 py-3 text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider">Inspector</th>
                                    <th className="px-5 py-3 text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider">Status</th>
                                    <th className="px-5 py-3 text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]">
                                {(stats.recentInspections || []).map((i: any) => (
                                    <tr key={i.id} className="hover:bg-[var(--surface2)] transition-colors group">
                                        <td className="px-5 py-3.5">
                                            <Link href={`/approvals/${i.id}`} className="text-[13px] font-medium text-[var(--text)] group-hover:text-[var(--accent-text)] transition-colors">
                                                {i.projectName}
                                            </Link>
                                        </td>
                                        <td className="px-5 py-3.5 text-[13px] text-[var(--text2)]">{i.inspectorName}</td>
                                        <td className="px-5 py-3.5">
                                            <span className={cn(
                                                "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                                                i.status === "pending" ? "bg-[var(--amber-light)] text-[var(--amber)]" :
                                                    i.status === "approved" ? "bg-[var(--accent-light)] text-[var(--accent-text)]" :
                                                        "bg-[var(--red-light)] text-[var(--red)]"
                                            )}>
                                                {i.status}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5 text-[12px] text-[var(--text3)]">
                                            {i.submittedAt ? format(new Date(i.submittedAt), "MMM d, HH:mm") : "-"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] overflow-hidden h-fit">
                    <div className="px-4 py-3.5 border-b border-[var(--border)]">
                        <h3 className="text-[14px] font-semibold text-[var(--text)] leading-none">Quick Actions</h3>
                    </div>
                    {/* Mobile: 2x2 icon grid */}
                    <div className="sm:hidden p-3 grid grid-cols-2 gap-2">
                        {[
                            { href: "/companies/create", icon: Plus, label: "Add Company", color: "#1a9e6e", bg: "#e8f7f1" },
                            { href: "/projects/create", icon: Folder, label: "New Project", color: "#3b82f6", bg: "#eff6ff" },
                            { href: "/assignments", icon: ClipboardList, label: "Assignments", color: "#d97706", bg: "#fef3c7" },
                            { href: "/admin/users", icon: Users, label: "Users", color: "#7c3aed", bg: "#f5f3ff" },
                        ].map(({ href, icon: Icon, label, color, bg }) => (
                            <Link key={href} href={href} className="flex flex-col items-center justify-center gap-2 p-4 bg-[var(--surface2)] rounded-[12px] hover:opacity-80 active:scale-95 transition-all">
                                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: bg }}>
                                    <Icon size={18} style={{ color }} />
                                </div>
                                <span className="text-[12px] font-medium text-[var(--text)] text-center">{label}</span>
                            </Link>
                        ))}
                    </div>
                    {/* Desktop: list */}
                    <div className="hidden sm:block p-4 grid grid-cols-1 gap-2">
                        <Link href="/companies/create" className="h-10 px-4 flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-[8px] text-[13px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)] transition-all">
                            <Plus size={16} /> Add New Company
                        </Link>
                        <Link href="/projects/create" className="h-10 px-4 flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-[8px] text-[13px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)] transition-all">
                            <Folder size={16} /> Create Project
                        </Link>
                        <Link href="/assignments" className="h-10 px-4 flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-[8px] text-[13px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)] transition-all">
                            <ClipboardList size={16} /> Manage Assignments
                        </Link>
                        <Link href="/admin/users" className="h-10 px-4 flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-[8px] text-[13px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)] transition-all">
                            <Users size={16} /> System Users
                        </Link>
                    </div>
                </div>
            </div>

            {/* Employee Expense Summary */}
            <AdminExpenseTable />
        </div>
    )
}
