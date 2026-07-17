"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import {
    Building2,
    Folder,
    ClipboardCheck,
    Users,
    XCircle,
    ChevronRight,
    ArrowUpRight,
    ArrowDownRight,
    ClipboardList,
    CreditCard,
    Loader2,
    CalendarCheck,
    FileCheck,
    AlertTriangle,
    UserPlus,
    Send,
    BarChart2,
    Clock,
    LogOut,
    Wallet,
    CheckCircle2,
} from "lucide-react"
import Link from "next/link"
import { format } from "date-fns"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

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

// ─── Small shared pieces for the dashboard ───────────────────────────────────

function TrendChip({ delta, suffix }: { delta: number | null; suffix: string }) {
    if (delta === null) return <span className="text-[11px] text-[var(--text3)] font-medium">—</span>
    const up = delta >= 0
    return (
        <span className={cn(
            "inline-flex items-center gap-0.5 h-6 px-2 rounded-full text-[11px] font-semibold",
            up ? "bg-[var(--accent-light)] text-[var(--accent-text)]" : "bg-[var(--red-light)] text-[var(--red)]"
        )}>
            {up ? <ArrowUpRight size={12} className="stroke-[3px]" /> : <ArrowDownRight size={12} className="stroke-[3px]" />}
            {up ? "+" : ""}{delta}% {suffix}
        </span>
    )
}

function MiniBar({ pct, danger }: { pct: number; danger?: boolean }) {
    return (
        <div className="h-[6px] rounded-full bg-[var(--surface2)] overflow-hidden w-full">
            <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, pct)}%`, backgroundColor: danger ? "var(--red)" : "var(--accent)" }}
            />
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

    const att = stats.attendanceToday || { present: 0, absent: 0, onLeave: 0, pct: 0 }
    const approvals = stats.approvals || { total: 0, leaves: 0, expenses: 0, documents: 0, inspections: 0 }
    const trend = stats.inspectionTrend || { days: [], completed30d: 0, deltaPct: null }
    const onboarding = stats.onboarding || { inProgress: 0, notStarted: 0, onHold: 0 }
    const exits = stats.exits || { pending: 0, clearancePending: 0 }
    const payroll = stats.payroll || { total: 0, processed: 0, pending: 0, pct: 0 }
    const alerts = stats.alerts || { contractsExpiring: 0, docExpiries: 0, lowAttendanceSites: 0 }
    const topSites: { name: string; present: number; absent: number; pct: number }[] = stats.topSites || []

    const inspToday = stats.inspectionsToday ?? 0
    const inspYesterday = stats.inspectionsYesterday ?? 0
    const inspDelta = inspYesterday > 0 ? Math.round(((inspToday - inspYesterday) / inspYesterday) * 100) : null

    const days: { day: string; count: number }[] = trend.days || []
    const maxCount = Math.max(1, ...days.map((d: { count: number }) => d.count))
    const fmtK = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "K" : String(n))

    const alertItems = [
        alerts.contractsExpiring > 0 ? { tone: "amber" as const, title: "Contracts expiring soon", text: `${alerts.contractsExpiring} contract(s) will expire in the next 30 days.`, href: "/contracts", link: "View contracts" } : null,
        alerts.docExpiries > 0 ? { tone: "amber" as const, title: "Document expiries", text: `${alerts.docExpiries} labour card(s) will expire in the next 30 days.`, href: "/employees/master", link: "Review now" } : null,
        alerts.lowAttendanceSites > 0 ? { tone: "red" as const, title: "Low attendance sites", text: `${alerts.lowAttendanceSites} site(s) are below 80% attendance today.`, href: "/attendance", link: "View sites" } : null,
    ].filter((a): a is NonNullable<typeof a> => a !== null)

    const kpiCard = "bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-[18px] hover:shadow-sm transition-all group block"

    const QUICK_ACTIONS = [
        { href: "/approvals", icon: ClipboardCheck, label: "Approve Requests", sub: "Pending approvals", color: "#d97706", bg: "#fef3c7" },
        { href: "/attendance", icon: Clock, label: "Mark Attendance", sub: "Take attendance", color: "#1a9e6e", bg: "#e8f7f1" },
        { href: "/employees", icon: UserPlus, label: "Add Employee", sub: "Onboard new hire", color: "#3b82f6", bg: "#eff6ff" },
        { href: "/projects/create", icon: Folder, label: "Create Project", sub: "Start new project", color: "#7c3aed", bg: "#f5f3ff" },
        { href: "/assignments", icon: ClipboardList, label: "Manage Assignments", sub: "Assign inspections", color: "#0891b2", bg: "#ecfeff" },
        { href: "/documents/send", icon: Send, label: "Send Document", sub: "Issue letters", color: "#b45309", bg: "#fef3c7" },
        { href: "/reports", icon: BarChart2, label: "View Reports", sub: "Analytics & reports", color: "#0d9488", bg: "#f0fdfa" },
        { href: "/admin/users", icon: Users, label: "System Users", sub: "Access & roles", color: "#dc2626", bg: "#fef2f2" },
    ]

    return (
        <div className="p-4 lg:p-6 space-y-4 bg-[var(--bg)] min-h-screen">
            {/* Mobile Welcome Banner */}
            <div className="md:hidden bg-gradient-to-br from-[#1a9e6e] to-[#0d6b4a] rounded-[16px] p-4 text-white shadow-sm">
                <p className="text-[11px] font-medium opacity-70 mb-0.5 uppercase tracking-wider">Welcome back 👋</p>
                <p className="text-[20px] font-bold tracking-tight">Admin Dashboard</p>
                <div className="flex items-center gap-2 mt-3">
                    <div className="flex-1 bg-white/10 rounded-[10px] p-2.5 text-center">
                        <p className="text-[20px] font-bold tabular-nums">{stats.activeEmployees ?? 0}</p>
                        <p className="text-[10px] opacity-70 mt-0.5">Employees</p>
                    </div>
                    <div className="flex-1 bg-white/10 rounded-[10px] p-2.5 text-center">
                        <p className="text-[20px] font-bold tabular-nums">{att.pct}%</p>
                        <p className="text-[10px] opacity-70 mt-0.5">Attendance</p>
                    </div>
                    <div className="flex-1 bg-white/10 rounded-[10px] p-2.5 text-center">
                        <p className="text-[20px] font-bold tabular-nums">{approvals.total}</p>
                        <p className="text-[10px] opacity-70 mt-0.5">Approvals</p>
                    </div>
                    <div className="flex-1 bg-white/10 rounded-[10px] p-2.5 text-center">
                        <p className="text-[20px] font-bold tabular-nums">{inspToday}</p>
                        <p className="text-[10px] opacity-70 mt-0.5">Inspections</p>
                    </div>
                </div>
            </div>

            {/* Page Header — Desktop only */}
            <div className="hidden md:flex items-end justify-between">
                <div>
                    <h1 className="text-[22px] font-semibold text-[var(--text)] tracking-tight">
                        {greeting}, {firstName} <span className="align-middle">👋</span>
                    </h1>
                    <p className="text-[13px] text-[var(--text2)] mt-1">{format(new Date(), "EEEE, d MMMM yyyy")}</p>
                </div>
            </div>

            {/* ── KPI ROW ── */}
            <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-[14px]">
                {/* Active Employees */}
                <Link href="/employees" className={kpiCard}>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                            <div className="h-9 w-9 rounded-[10px] bg-[#e8f7f1] flex items-center justify-center"><Users size={17} className="text-[#0d6b4a]" /></div>
                            <span className="text-[12.5px] font-medium text-[var(--text2)]">Active Employees</span>
                        </div>
                        <ChevronRight size={15} className="text-[var(--text3)] group-hover:text-[var(--text)] transition-colors" />
                    </div>
                    <div className="text-[28px] font-semibold text-[var(--text)] leading-none tabular-nums mb-3">{(stats.activeEmployees ?? 0).toLocaleString("en-IN")}</div>
                    {(stats.newEmployees30d ?? 0) > 0 ? (
                        <span className="inline-flex items-center gap-0.5 h-6 px-2 rounded-full bg-[var(--accent-light)] text-[var(--accent-text)] text-[11px] font-semibold">
                            <ArrowUpRight size={12} className="stroke-[3px]" />+{stats.newEmployees30d} last 30 days
                        </span>
                    ) : (
                        <span className="text-[11px] text-[var(--text3)]">No new joiners in 30 days</span>
                    )}
                </Link>

                {/* Today's Attendance */}
                <Link href="/attendance" className={kpiCard}>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                            <div className="h-9 w-9 rounded-[10px] bg-[#e8f7f1] flex items-center justify-center"><CalendarCheck size={17} className="text-[#0d6b4a]" /></div>
                            <span className="text-[12.5px] font-medium text-[var(--text2)]">Today&apos;s Attendance</span>
                        </div>
                        <ChevronRight size={15} className="text-[var(--text3)] group-hover:text-[var(--text)] transition-colors" />
                    </div>
                    <div className="text-[28px] font-semibold text-[var(--text)] leading-none tabular-nums mb-3">{att.pct}%</div>
                    <div className="flex items-center gap-4 text-[11px]">
                        <span className="text-[var(--text3)]">Present <span className="font-semibold text-[var(--accent-text)] tabular-nums">{att.present.toLocaleString("en-IN")}</span></span>
                        <span className="text-[var(--text3)]">Absent <span className="font-semibold text-[var(--red)] tabular-nums">{att.absent.toLocaleString("en-IN")}</span></span>
                        <span className="text-[var(--text3)]">On Leave <span className="font-semibold text-[var(--amber)] tabular-nums">{att.onLeave.toLocaleString("en-IN")}</span></span>
                    </div>
                </Link>

                {/* Pending Approvals */}
                <Link href="/approvals" className={kpiCard}>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                            <div className="h-9 w-9 rounded-[10px] bg-[#fef3c7] flex items-center justify-center"><ClipboardCheck size={17} className="text-[#d97706]" /></div>
                            <span className="text-[12.5px] font-medium text-[var(--text2)]">Pending Approvals</span>
                        </div>
                        <ChevronRight size={15} className="text-[var(--text3)] group-hover:text-[var(--text)] transition-colors" />
                    </div>
                    <div className="text-[28px] font-semibold text-[var(--text)] leading-none tabular-nums mb-3">{approvals.total}</div>
                    <span className="text-[11px] text-[var(--text3)]">
                        {approvals.leaves} leaves · {approvals.expenses} expenses · {approvals.inspections} inspections
                    </span>
                </Link>

                {/* Inspections Today */}
                <Link href="/sites" className={kpiCard}>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                            <div className="h-9 w-9 rounded-[10px] bg-[#e8f7f1] flex items-center justify-center"><FileCheck size={17} className="text-[#0d6b4a]" /></div>
                            <span className="text-[12.5px] font-medium text-[var(--text2)]">Inspections Today</span>
                        </div>
                        <ChevronRight size={15} className="text-[var(--text3)] group-hover:text-[var(--text)] transition-colors" />
                    </div>
                    <div className="text-[28px] font-semibold text-[var(--text)] leading-none tabular-nums mb-3">{inspToday}</div>
                    <TrendChip delta={inspDelta} suffix="vs yesterday" />
                </Link>
            </div>

            {/* ── ROW: Completion chart · Attendance breakdown ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-[14px] items-start">
                {/* Inspection Completion */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-[18px]">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[13.5px] font-semibold text-[var(--text)] leading-none">Inspection Completion <span className="font-normal text-[var(--text3)]">(Last 30 days)</span></h3>
                        <Link href="/reports" className="text-[11.5px] font-medium text-[var(--accent-text)] hover:underline">View report</Link>
                    </div>
                    <div className="flex items-baseline gap-3 mb-5">
                        <div className="text-[30px] font-semibold text-[var(--text)] tabular-nums leading-none">{(trend.completed30d ?? 0).toLocaleString("en-IN")}</div>
                        <TrendChip delta={trend.deltaPct} suffix="vs previous period" />
                    </div>
                    <div className="flex gap-2">
                        <div className="flex flex-col justify-between text-[10px] text-[var(--text3)] tabular-nums h-24 py-0.5 shrink-0 text-right w-7">
                            <span>{fmtK(maxCount)}</span>
                            <span>{fmtK(Math.round(maxCount / 2))}</span>
                            <span>0</span>
                        </div>
                        <div className="flex-1 flex items-end gap-[2px] h-24 border-l border-b border-[var(--border)] pl-1.5">
                            {days.map((d: { day: string; count: number }, i: number) => (
                                <div
                                    key={d.day}
                                    style={{ height: `${Math.max(3, (d.count / maxCount) * 100)}%` }}
                                    title={`${format(new Date(d.day), "d MMM")}: ${d.count}`}
                                    className={cn(
                                        "flex-1 rounded-t-[2px] transition-all",
                                        i === days.length - 1 ? "bg-[var(--accent)]" : "bg-[color-mix(in_srgb,var(--accent)_28%,transparent)]"
                                    )}
                                />
                            ))}
                        </div>
                    </div>
                    {days.length > 0 && (
                        <div className="flex items-center justify-between text-[10px] text-[var(--text3)] font-medium mt-1.5 pl-9">
                            <span>{format(new Date(days[0].day), "MMM d")}</span>
                            <span>{format(new Date(days[Math.floor(days.length / 2)].day), "MMM d")}</span>
                            <span>{format(new Date(days[days.length - 1].day), "MMM d")}</span>
                        </div>
                    )}
                </div>

                {/* Today's Attendance Breakdown */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-[18px]">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[13.5px] font-semibold text-[var(--text)] leading-none">Today&apos;s Attendance Breakdown</h3>
                        <Link href="/attendance" className="text-[11.5px] font-medium text-[var(--accent-text)] hover:underline">View all sites</Link>
                    </div>
                    <div className="flex items-center gap-3 mb-5">
                        <div className="flex-1"><MiniBar pct={att.pct} /></div>
                        <span className="text-[16px] font-semibold text-[var(--text)] tabular-nums">{att.pct}%</span>
                    </div>
                    {topSites.length === 0 ? (
                        <p className="text-[12.5px] text-[var(--text3)] text-center py-8">No attendance marked yet today.</p>
                    ) : (
                        <div>
                            <div className="grid grid-cols-[1.6fr_0.7fr_0.7fr_1.2fr] gap-2 text-[11px] font-medium text-[var(--text3)] pb-2 border-b border-[var(--border)]">
                                <span>Top Sites</span>
                                <span className="text-right">Present</span>
                                <span className="text-right">Absent</span>
                                <span className="text-right">Attendance</span>
                            </div>
                            {topSites.map((s: { name: string; present: number; absent: number; pct: number }) => (
                                <div key={s.name} className="grid grid-cols-[1.6fr_0.7fr_0.7fr_1.2fr] gap-2 items-center py-2.5 border-b border-[var(--border)] last:border-0">
                                    <span className="text-[12.5px] font-medium text-[var(--text)] truncate">{s.name}</span>
                                    <span className="text-right text-[12px] font-semibold text-[var(--accent-text)] tabular-nums">{s.present}</span>
                                    <span className={cn("text-right text-[12px] tabular-nums", s.absent > 0 ? "font-semibold text-[var(--red)]" : "text-[var(--text3)]")}>{s.absent}</span>
                                    <span className="flex items-center gap-2 justify-end">
                                        <span className="w-14"><MiniBar pct={s.pct} danger={s.pct < 80} /></span>
                                        <span className="text-[11.5px] font-semibold text-[var(--text2)] tabular-nums w-8 text-right">{s.pct}%</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── ROW: Recruitment · Pipelines · Alerts ── */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-[14px] items-start">
                <div className="xl:col-span-5">
                    <AdminRecruitmentTable />
                </div>

                {/* Pipelines */}
                <div className="xl:col-span-4 grid grid-cols-1 sm:grid-cols-3 gap-[14px]">
                    {/* Onboarding */}
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-[16px] flex flex-col">
                        <div className="h-8 w-8 rounded-[9px] bg-[#e8f7f1] flex items-center justify-center mb-3"><UserPlus size={15} className="text-[#0d6b4a]" /></div>
                        <p className="text-[12px] font-semibold text-[var(--text)] leading-tight mb-2">Onboarding Pipeline</p>
                        <div className="text-[24px] font-semibold text-[var(--text)] leading-none tabular-nums">{onboarding.inProgress}</div>
                        <p className="text-[10.5px] text-[var(--text3)] mt-0.5 mb-3">In progress</p>
                        <div className="space-y-1.5 text-[11px] text-[var(--text2)] mb-3">
                            <div className="flex justify-between"><span>Yet to start</span><span className="font-semibold tabular-nums">{onboarding.notStarted}</span></div>
                            <div className="flex justify-between"><span>On hold</span><span className="font-semibold tabular-nums">{onboarding.onHold}</span></div>
                        </div>
                        <Link href="/onboarding" className="text-[11px] font-medium text-[var(--accent-text)] hover:underline mt-auto">View pipeline →</Link>
                    </div>

                    {/* Exits */}
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-[16px] flex flex-col">
                        <div className="h-8 w-8 rounded-[9px] bg-[#fef3c7] flex items-center justify-center mb-3"><LogOut size={15} className="text-[#d97706]" /></div>
                        <p className="text-[12px] font-semibold text-[var(--text)] leading-tight mb-2">Exits Pending</p>
                        <div className="text-[24px] font-semibold text-[var(--text)] leading-none tabular-nums">{exits.pending}</div>
                        <p className="text-[10.5px] text-[var(--text3)] mt-0.5 mb-3">Open requests</p>
                        <div className="space-y-1.5 text-[11px] text-[var(--text2)] mb-3">
                            <div className="flex justify-between"><span>Clearances pending</span><span className="font-semibold tabular-nums">{exits.clearancePending}</span></div>
                        </div>
                        <Link href="/exit" className="text-[11px] font-medium text-[var(--accent-text)] hover:underline mt-auto">View details →</Link>
                    </div>

                    {/* Payroll */}
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-[16px] flex flex-col">
                        <div className="h-8 w-8 rounded-[9px] bg-[#eff6ff] flex items-center justify-center mb-3"><Wallet size={15} className="text-[#3b82f6]" /></div>
                        <p className="text-[12px] font-semibold text-[var(--text)] leading-tight mb-2">Payroll Status</p>
                        <div className="text-[24px] font-semibold text-[var(--text)] leading-none tabular-nums">{payroll.pct}%</div>
                        <p className="text-[10.5px] text-[var(--text3)] mt-0.5 mb-3">Processed · {format(new Date(), "MMM yyyy")}</p>
                        <div className="space-y-1.5 text-[11px] text-[var(--text2)] mb-3">
                            <div className="flex justify-between"><span>Processed</span><span className="font-semibold tabular-nums">{payroll.processed.toLocaleString("en-IN")}</span></div>
                            <div className="flex justify-between"><span>Pending</span><span className="font-semibold tabular-nums">{payroll.pending.toLocaleString("en-IN")}</span></div>
                        </div>
                        <Link href="/payroll" className="text-[11px] font-medium text-[var(--accent-text)] hover:underline mt-auto">View payroll →</Link>
                    </div>
                </div>

                {/* Alerts */}
                <div className="xl:col-span-3 bg-[var(--surface)] border border-[var(--border)] rounded-[14px] overflow-hidden">
                    <div className="px-4 py-3.5 border-b border-[var(--border)] flex items-center justify-between">
                        <h3 className="text-[13.5px] font-semibold text-[var(--text)] leading-none">Alerts &amp; Important</h3>
                    </div>
                    <div className="p-4 space-y-3">
                        {alertItems.length === 0 ? (
                            <div className="flex flex-col items-center py-6 text-center">
                                <CheckCircle2 size={26} className="text-[var(--accent)] mb-2" />
                                <p className="text-[12.5px] font-medium text-[var(--text)]">All clear</p>
                                <p className="text-[11.5px] text-[var(--text3)] mt-0.5">No expiries or low-attendance alerts.</p>
                            </div>
                        ) : (
                            alertItems.map((a) => (
                                <div
                                    key={a.title}
                                    className={cn(
                                        "rounded-[10px] border-l-[3px] p-3",
                                        a.tone === "red" ? "border-l-[var(--red)] bg-[var(--red-light)]" : "border-l-[var(--amber)] bg-[var(--amber-light)]"
                                    )}
                                >
                                    <div className="flex items-start gap-2">
                                        <AlertTriangle size={14} className={cn("mt-0.5 shrink-0", a.tone === "red" ? "text-[var(--red)]" : "text-[var(--amber)]")} />
                                        <div className="min-w-0">
                                            <p className="text-[12.5px] font-semibold text-[var(--text)] leading-tight">{a.title}</p>
                                            <p className="text-[11.5px] text-[var(--text2)] mt-0.5 leading-snug">{a.text}</p>
                                            <Link href={a.href} className="inline-block text-[11px] font-semibold text-[var(--accent-text)] hover:underline mt-1.5">{a.link} →</Link>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* ── ROW: Recent Submissions · Quick Actions ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-[14px] items-start">
                {/* Recent Submissions */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] overflow-hidden">
                    <div className="px-4 py-3.5 border-b border-[var(--border)] flex items-center justify-between">
                        <h3 className="text-[14px] font-semibold text-[var(--text)] leading-none">Recent Submissions</h3>
                        <Link href="/approvals" className="text-[12px] font-medium text-[var(--accent-text)] hover:underline">View all</Link>
                    </div>
                    {(stats.recentInspections || []).length === 0 ? (
                        <p className="text-center text-[13px] text-[var(--text3)] py-10">No submissions yet</p>
                    ) : (
                        <div>
                            <div className="grid grid-cols-[1.4fr_1fr_0.8fr_0.8fr] gap-2 px-4 py-2 text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide bg-[var(--surface2)]">
                                <span>Project</span><span>Inspector</span><span>Status</span><span className="text-right">Date</span>
                            </div>
                            <div className="divide-y divide-[var(--border)]">
                                {(stats.recentInspections || []).map((i: any) => (
                                    <Link key={i.id} href={`/approvals/${i.id}`} className="grid grid-cols-[1.4fr_1fr_0.8fr_0.8fr] gap-2 items-center px-4 py-3 hover:bg-[var(--surface2)] transition-colors">
                                        <span className="text-[12.5px] font-medium text-[var(--text)] truncate">{i.projectName}</span>
                                        <span className="text-[12px] text-[var(--text2)] truncate">{i.inspectorName}</span>
                                        <span>
                                            <span className={cn(
                                                "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                                                i.status === "pending" ? "bg-[var(--amber-light)] text-[var(--amber)]" :
                                                    i.status === "approved" ? "bg-[var(--accent-light)] text-[var(--accent-text)]" :
                                                        "bg-[var(--red-light)] text-[var(--red)]"
                                            )}>{i.status}</span>
                                        </span>
                                        <span className="text-right text-[11px] text-[var(--text3)] tabular-nums">{i.submittedAt ? format(new Date(i.submittedAt), "MMM d, HH:mm") : "—"}</span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Quick Actions */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] overflow-hidden">
                    <div className="px-4 py-3.5 border-b border-[var(--border)]">
                        <h3 className="text-[14px] font-semibold text-[var(--text)] leading-none">Quick Actions</h3>
                    </div>
                    <div className="p-4 grid grid-cols-2 gap-3">
                        {QUICK_ACTIONS.map(({ href, icon: Icon, label, sub, color, bg }) => (
                            <Link key={label} href={href} className="flex items-center gap-3 p-3 border border-[var(--border)] rounded-[12px] hover:shadow-sm hover:border-[var(--accent)] transition-all">
                                <div className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0" style={{ backgroundColor: bg }}>
                                    <Icon size={16} style={{ color }} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[12.5px] font-semibold text-[var(--text)] leading-tight truncate">{label}</p>
                                    <p className="text-[11px] text-[var(--text3)] mt-0.5 truncate">{sub}</p>
                                </div>
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

