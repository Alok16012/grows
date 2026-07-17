"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import {
    Building2,
    Folder,
    ClipboardCheck,
    Users,
    XCircle,
    ChevronDown,
    ArrowUpRight,
    ShieldCheck,
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

// Sample completion trend — no historical completion API yet, so these are
// placeholder values for the chart shape. Swap for a real per-day query later.
const COMPLETION_TOTAL = 12482
const COMPLETION_BARS = [40, 60, 45, 80, 55, 70, 90, 65, 50, 85, 45, 75, 95, 60, 40]

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
                    <span className="text-[13.5px] font-semibold text-[var(--text)]">Recruitment Overview by HR</span>
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

    const hour = new Date().getHours()
    const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening"
    const firstName = (session?.user?.name || "Admin").split(" ")[0]

    const nm = stats.newThisMonth || {}
    const statRow = [
        { label: "Companies", value: stats.totalCompanies ?? 0, sub: "Across all regions", icon: Building2, color: "#1a9e6e", bg: "#e8f7f1", delta: nm.companies ?? 0 },
        { label: "Projects", value: stats.totalProjects ?? 0, sub: "Active management", icon: Folder, color: "#3b82f6", bg: "#eff6ff", delta: nm.projects ?? 0 },
        { label: "Pending Actions", value: stats.pendingApprovals ?? 0, sub: "Action required", icon: ClipboardCheck, color: "#d97706", bg: "#fef3c7", delta: null as number | null },
        { label: "Total Users", value: stats.totalUsers ?? 0, sub: "System access", icon: Users, color: "#7c3aed", bg: "#f5f3ff", delta: nm.users ?? 0 },
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
            <div className="hidden md:block">
                <h1 className="text-[22px] font-semibold text-[var(--text)] tracking-tight">
                    {greeting}, {firstName}! <span className="align-middle">👋</span>
                </h1>
                <p className="text-[13px] text-[var(--text2)] mt-1">
                    Here&apos;s what&apos;s happening with your inspection operations today.
                </p>
            </div>

            {/* STAT ROW — Desktop only (mobile uses welcome banner above) */}
            <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-[14px]">
                {statRow.map((stat) => (
                    <div key={stat.label} className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-[18px] flex flex-col justify-between hover:shadow-sm transition-all">
                        <div className="flex items-start justify-between mb-4">
                            <span className="text-[12px] font-medium text-[var(--text2)]">{stat.label}</span>
                            <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: stat.bg }}>
                                <stat.icon size={17} style={{ color: stat.color }} />
                            </div>
                        </div>
                        <div className="flex items-end justify-between gap-2">
                            <div className="min-w-0">
                                <div className="text-[26px] font-semibold text-[var(--text)] leading-tight tabular-nums">
                                    {(stat.value as number).toLocaleString("en-IN")}
                                </div>
                                <div className="text-[11.5px] text-[var(--text3)] mt-0.5">{stat.sub}</div>
                            </div>
                            {stat.delta != null && stat.delta > 0 ? (
                                <span
                                    title="New this month"
                                    className="flex items-center gap-0.5 h-6 px-2 rounded-full bg-[var(--accent-light)] text-[var(--accent-text)] text-[11px] font-semibold shrink-0"
                                >
                                    <ArrowUpRight size={12} className="stroke-[3px]" /> +{stat.delta}
                                </span>
                            ) : (
                                <span className="text-[13px] text-[var(--text3)] font-medium shrink-0">—</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Row: Recruitment (left) · Completion + Safety/Approvals (right) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-[14px] items-start">
                {/* Left: Recruitment scoreboard */}
                <AdminRecruitmentTable />

                {/* Right: Inspection Completion + Safety/Approvals */}
                <div className="flex flex-col gap-[14px]">
                    {/* Inspection Completion */}
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-[18px] flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-[13.5px] font-semibold text-[var(--text)] leading-none">Inspection Completion</h3>
                            <div className="h-6 flex items-center gap-1 px-2.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface2)] text-[11px] text-[var(--text2)] font-medium">
                                Last 30 days
                                <ChevronDown size={12} />
                            </div>
                        </div>

                        <p className="text-[11.5px] text-[var(--text3)] mb-1">Total Completed</p>
                        <div className="flex items-baseline gap-3 mb-5">
                            <div className="text-[30px] font-semibold text-[var(--text)] tabular-nums leading-none">{COMPLETION_TOTAL.toLocaleString("en-IN")}</div>
                            <div className="h-6 flex items-center gap-1 px-2.5 rounded-full bg-[var(--accent-light)] text-[var(--accent-text)] text-[11px] font-semibold">
                                <ArrowUpRight size={12} className="stroke-[3px]" /> +12% vs prev.
                            </div>
                        </div>

                        {/* Chart with y-axis + x-axis */}
                        <div className="flex gap-2">
                            <div className="flex flex-col justify-between text-[10px] text-[var(--text3)] tabular-nums h-24 py-0.5 shrink-0">
                                {["16K", "12K", "8K", "4K", "0"].map(l => <span key={l}>{l}</span>)}
                            </div>
                            <div className="flex-1 flex items-end gap-[3px] h-24 border-l border-b border-[var(--border)] pl-1.5">
                                {COMPLETION_BARS.map((h, i) => (
                                    <div
                                        key={i}
                                        style={{ height: `${h}%` }}
                                        title="Sample data"
                                        className={cn(
                                            "flex-1 rounded-t-[2px] transition-all",
                                            i === 12 ? "bg-[var(--accent)]" : "bg-[color-mix(in_srgb,var(--accent)_28%,transparent)]"
                                        )}
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-[var(--text3)] font-medium mt-1.5 pl-8">
                            <span>Feb 1</span><span>Feb 8</span><span>Feb 15</span><span>Feb 22</span><span>Mar 1</span>
                        </div>
                    </div>

                    {/* Safety Score + Approvals */}
                    <div className="grid grid-cols-2 gap-[14px]">
                        {/* Safety Score */}
                        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-[16px] flex flex-col">
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <h3 className="text-[12.5px] font-semibold text-[var(--text)] leading-none mb-1">Safety Score</h3>
                                    <p className="text-[11px] text-[var(--text3)]">Compliance rate</p>
                                </div>
                                <div className="h-8 w-8 rounded-full bg-[var(--accent-light)] flex items-center justify-center text-[var(--accent-text)]">
                                    <ShieldCheck size={16} />
                                </div>
                            </div>
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-[24px] font-semibold text-[var(--text)] leading-none">98%</span>
                                <span className="flex items-center gap-0.5 text-[11px] font-semibold text-[var(--accent-text)]"><ArrowUpRight size={11} className="stroke-[3px]" />2.4%</span>
                            </div>
                            <svg viewBox="0 0 120 26" preserveAspectRatio="none" className="w-full h-8 mt-2">
                                <polyline points="0,20 15,18 30,19 45,13 60,15 75,9 90,11 105,5 120,7" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>

                        {/* Approvals */}
                        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-[16px] flex flex-col">
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <h3 className="text-[12.5px] font-semibold text-[var(--text)] leading-none mb-1">Approvals</h3>
                                    <p className="text-[11px] text-[var(--text3)]">Action required</p>
                                </div>
                                <div className="h-8 w-8 rounded-full bg-[var(--amber-light)] flex items-center justify-center text-[var(--amber)]">
                                    <ClipboardCheck size={16} />
                                </div>
                            </div>
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-[24px] font-semibold text-[var(--text)] leading-none tabular-nums">{stats.pendingApprovals ?? 0}</span>
                                <span className="text-[11px] text-[var(--text2)]">Reports</span>
                            </div>
                            <svg viewBox="0 0 120 26" preserveAspectRatio="none" className="w-full h-8 mt-2">
                                <polyline points="0,15 15,17 30,14 45,16 60,13 75,15 90,12 105,14 120,11" fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <Link href="/approvals" className="text-[11px] font-medium text-[var(--accent-text)] hover:underline mt-1">View All →</Link>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Row: Recent Submissions (left) · Quick Actions (right) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-[14px] items-start">
                {/* Recent Submissions */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] overflow-hidden">
                    <div className="px-4 py-3.5 border-b border-[var(--border)] flex items-center justify-between">
                        <h3 className="text-[14px] font-semibold text-[var(--text)] leading-none">Recent Submissions</h3>
                        <Link href="/approvals" className="text-[12px] font-medium text-[var(--accent-text)] hover:underline">View All</Link>
                    </div>

                    {(stats.recentInspections || []).length === 0 ? (
                        <p className="text-center text-[13px] text-[var(--text3)] py-10">No submissions yet</p>
                    ) : (
                        <div className="divide-y divide-[var(--border)]">
                            {(stats.recentInspections || []).map((i: any) => {
                                const initials = (i.inspectorName || "?").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
                                return (
                                    <Link key={i.id} href={`/approvals/${i.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface2)] transition-colors">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[13px] font-medium text-[var(--text)] truncate">{i.projectName}</p>
                                            <div className="flex items-center gap-1.5 mt-1">
                                                <span className="h-[18px] w-[18px] rounded-full bg-[var(--accent-light)] text-[var(--accent-text)] text-[9px] font-bold flex items-center justify-center shrink-0">{initials}</span>
                                                <span className="text-[11.5px] text-[var(--text3)] truncate">{i.inspectorName}</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1 shrink-0">
                                            <span className={cn(
                                                "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                                                i.status === "pending" ? "bg-[var(--amber-light)] text-[var(--amber)]" :
                                                    i.status === "approved" ? "bg-[var(--accent-light)] text-[var(--accent-text)]" :
                                                        "bg-[var(--red-light)] text-[var(--red)]"
                                            )}>{i.status}</span>
                                            <span className="text-[10.5px] text-[var(--text3)] tabular-nums">{i.submittedAt ? format(new Date(i.submittedAt), "MMM d, HH:mm") : "—"}</span>
                                        </div>
                                    </Link>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Quick Actions — 2x2 tiles */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] overflow-hidden">
                    <div className="px-4 py-3.5 border-b border-[var(--border)]">
                        <h3 className="text-[14px] font-semibold text-[var(--text)] leading-none">Quick Actions</h3>
                    </div>
                    <div className="p-4 grid grid-cols-2 gap-3">
                        {[
                            { href: "/companies/create", icon: Building2, label: "Add New Company", color: "#1a9e6e", bg: "#e8f7f1" },
                            { href: "/projects/create", icon: Folder, label: "Create Project", color: "#3b82f6", bg: "#eff6ff" },
                            { href: "/assignments", icon: ClipboardList, label: "Manage Assignments", color: "#d97706", bg: "#fef3c7" },
                            { href: "/admin/users", icon: Users, label: "System Users", color: "#7c3aed", bg: "#f5f3ff" },
                        ].map(({ href, icon: Icon, label, color, bg }) => (
                            <Link key={href} href={href} className="flex flex-col gap-3 p-4 border border-[var(--border)] rounded-[12px] hover:shadow-sm hover:border-[var(--accent)] transition-all group">
                                <div className="w-10 h-10 rounded-[10px] flex items-center justify-center" style={{ backgroundColor: bg }}>
                                    <Icon size={18} style={{ color }} />
                                </div>
                                <span className="text-[12.5px] font-medium text-[var(--text)] leading-tight">{label}</span>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>

            {/* Employee Expense Summary */}
            <AdminExpenseTable />
        </div>
    )
}
