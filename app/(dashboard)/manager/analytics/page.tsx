"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    LineChart, Line, Legend
} from "recharts"
import {
    Trophy, Medal, TrendingUp, Users, CheckCircle2, XCircle,
    Clock, CornerUpLeft, Activity, Building2, MapPin, Ticket,
    UserPlus, LogOut, IndianRupee, FileText, AlertCircle,
    CheckCircle, Loader2
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type InspectorData = {
    id: string
    name: string
    email: string
    total: number
    approved: number
    rejected: number
    pending: number
    draft: number
    acceptanceRate: number
    avgSentBack: number
    avgTurnaroundHours: number
    recentInspections: { status: string; project: string; company: string; date: string }[]
}

type AnalyticsData = {
    hr: {
        totalEmployees: number
        activeEmployees: number
        onLeave: number
        newJoiningThisMonth: number
        exitedThisMonth: number
    }
    attendance: {
        avgAttendancePercent: number
        presentToday: number
        absentToday: number
        lateToday: number
        monthlyTrend: { date: string; present: number; absent: number }[]
    }
    leave: {
        pendingRequests: number
        approvedThisMonth: number
        byType: { type: string; count: number }[]
    }
    payroll: {
        totalGross: number
        totalNet: number
        totalPFLiability: number
        processedCount: number
        pendingCount: number
    }
    billing: {
        invoicedThisMonth: number
        collectedThisMonth: number
        outstanding: number
        overdueCount: number
    }
    expenses: {
        pendingApprovals: number
        approvedThisMonth: number
    }
    recruitment: {
        totalLeads: number
        activeLeads: number
        selectedThisMonth: number
        rejectedThisMonth: number
        byStatus: { status: string; count: number }[]
    }
    onboarding: {
        inProgress: number
        completedThisMonth: number
        notStarted: number
    }
    exit: {
        activeExits: number
        fnfPending: number
        completedThisMonth: number
    }
    sites: {
        totalSites: number
        activeSites: number
        understaffed: number
        totalDeployed: number
    }
    helpdesk: {
        openTickets: number
        resolvedThisMonth: number
        urgentOpen: number
    }
    inspectors: InspectorData[]
    monthlyTrend: { month: string; submitted: number; approved: number; rate: number }[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function inr(n: number) {
    return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 })
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Pulse({ className }: { className?: string }) {
    return <div className={cn("animate-pulse bg-[var(--border)] rounded-[8px]", className)} />
}

function KPICardSkeleton() {
    return (
        <div className="bg-white border border-[var(--border)] rounded-[12px] p-4 space-y-3">
            <Pulse className="h-4 w-24" />
            <Pulse className="h-8 w-16" />
            <Pulse className="h-3 w-32" />
        </div>
    )
}

function SectionSkeleton({ rows = 2, height = "h-[180px]" }: { rows?: number; height?: string }) {
    return (
        <div className="space-y-3">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className={cn("bg-white border border-[var(--border)] rounded-[12px]", height)}>
                    <Pulse className="h-full w-full rounded-[12px]" />
                </div>
            ))}
        </div>
    )
}

// ─── Section Heading ──────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
    return (
        <div className="pb-2 border-b border-[var(--border)] mb-4">
            <span className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.8px]">
                {children}
            </span>
        </div>
    )
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KPICard({
    icon: Icon,
    label,
    value,
    sub,
    accent = false,
    warn = false,
}: {
    icon: React.ElementType
    label: string
    value: string | number
    sub?: string
    accent?: boolean
    warn?: boolean
}) {
    return (
        <div className="bg-white border border-[var(--border)] rounded-[12px] p-4 flex flex-col gap-1.5">
            <div className={cn(
                "inline-flex items-center justify-center w-8 h-8 rounded-[8px]",
                accent ? "bg-[var(--accent-light)] text-[var(--accent)]" :
                warn ? "bg-[#fef3c7] text-[#d97706]" :
                "bg-[var(--surface2)] text-[var(--text2)]"
            )}>
                <Icon className="h-4 w-4" />
            </div>
            <div className="text-[24px] font-bold text-[var(--text)] leading-none mt-1">{value}</div>
            <div className="text-[12px] font-medium text-[var(--text2)]">{label}</div>
            {sub && <div className="text-[11px] text-[var(--text3)]">{sub}</div>}
        </div>
    )
}

// ─── Finance Card ─────────────────────────────────────────────────────────────

function FinanceCard({ title, rows, badge }: {
    title: string
    rows: { label: string; value: string; accent?: boolean; red?: boolean }[]
    badge?: { label: string; count: number }
}) {
    return (
        <div className="bg-white border border-[var(--border)] rounded-[12px] p-4">
            <div className="flex items-center justify-between mb-3">
                <span className="text-[13px] font-semibold text-[var(--text)]">{title}</span>
                {badge && badge.count > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#fef2f2] text-[var(--red)]">
                        {badge.count} {badge.label}
                    </span>
                )}
            </div>
            <div className="space-y-2.5">
                {rows.map((r, i) => (
                    <div key={i} className="flex items-center justify-between">
                        <span className="text-[12px] text-[var(--text3)]">{r.label}</span>
                        <span className={cn(
                            "text-[13px] font-semibold",
                            r.accent ? "text-[var(--accent)]" : r.red ? "text-[var(--red)]" : "text-[var(--text)]"
                        )}>
                            {r.value}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ─── People Ops Card ──────────────────────────────────────────────────────────

function PeopleCard({ title, icon: Icon, items }: {
    title: string
    icon: React.ElementType
    items: { label: string; value: number; color?: string }[]
}) {
    return (
        <div className="bg-white border border-[var(--border)] rounded-[12px] p-4">
            <div className="flex items-center gap-2 mb-3">
                <Icon className="h-4 w-4 text-[var(--accent)]" />
                <span className="text-[13px] font-semibold text-[var(--text)]">{title}</span>
            </div>
            <div className="space-y-2">
                {items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between">
                        <span className="text-[12px] text-[var(--text3)]">{item.label}</span>
                        <span className={cn(
                            "text-[15px] font-bold",
                            item.color || "text-[var(--text)]"
                        )}>
                            {item.value}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ─── Recruitment Pipeline ─────────────────────────────────────────────────────

const PIPELINE_STAGES = [
    { key: "APPLIED", label: "Applied", color: "#6366f1" },
    { key: "SCREENING", label: "Screening", color: "#8b5cf6" },
    { key: "INTERVIEW_SCHEDULED", label: "Interview", color: "#f59e0b" },
    { key: "INTERVIEW_DONE", label: "Done", color: "#3b82f6" },
    { key: "SELECTED", label: "Selected", color: "#1a9e6e" },
    { key: "ONBOARDED", label: "Onboarded", color: "#059669" },
]

function RecruitmentPipeline({ byStatus }: { byStatus: { status: string; count: number }[] }) {
    const countMap = Object.fromEntries(byStatus.map(b => [b.status, b.count]))
    return (
        <div className="flex flex-wrap gap-2 items-center">
            {PIPELINE_STAGES.map((stage, i) => (
                <div key={stage.key} className="flex items-center gap-1.5">
                    <div
                        className="flex flex-col items-center justify-center px-3 py-2 rounded-[10px] min-w-[72px]"
                        style={{ backgroundColor: stage.color + "18", border: `1px solid ${stage.color}40` }}
                    >
                        <span className="text-[18px] font-bold" style={{ color: stage.color }}>
                            {countMap[stage.key] || 0}
                        </span>
                        <span className="text-[10px] font-medium" style={{ color: stage.color }}>
                            {stage.label}
                        </span>
                    </div>
                    {i < PIPELINE_STAGES.length - 1 && (
                        <span className="text-[var(--text3)] text-[14px]">→</span>
                    )}
                </div>
            ))}
        </div>
    )
}

// ─── Rank Icon ────────────────────────────────────────────────────────────────

function RankIcon({ idx }: { idx: number }) {
    if (idx === 0) return <Trophy className="h-5 w-5 text-yellow-500" />
    if (idx === 1) return <Medal className="h-5 w-5 text-gray-400" />
    if (idx === 2) return <Medal className="h-5 w-5 text-amber-600" />
    return <span className="text-[13px] font-bold text-[var(--text3)] w-5 text-center">#{idx + 1}</span>
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const [data, setData] = useState<AnalyticsData | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (status === "unauthenticated") router.push("/login")
        if (status === "authenticated" && session?.user?.role === "INSPECTION_BOY") router.push("/")
    }, [status, session, router])

    useEffect(() => {
        fetch("/api/manager/analytics")
            .then(r => r.json())
            .then(d => setData(d))
            .finally(() => setLoading(false))
    }, [])

    const hr = data?.hr
    const attendance = data?.attendance
    const leave = data?.leave
    const payroll = data?.payroll
    const billing = data?.billing
    const expenses = data?.expenses
    const recruitment = data?.recruitment
    const onboarding = data?.onboarding
    const exit = data?.exit
    const sites = data?.sites
    const helpdesk = data?.helpdesk
    const inspectors: InspectorData[] = data?.inspectors || []
    const monthlyTrend = data?.monthlyTrend || []

    return (
        <div className="min-h-screen bg-[#f5f4f0] p-4 lg:p-7 space-y-8">

            {/* ── Header ─────────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-[22px] font-semibold text-[var(--text)] tracking-[-0.4px]">HRMS Analytics</h1>
                    <p className="text-[13px] text-[var(--text2)] mt-0.5">
                        Comprehensive workforce, finance and operations overview
                    </p>
                </div>
                {loading && (
                    <div className="flex items-center gap-2 bg-white border border-[var(--border)] rounded-[10px] px-3 py-2">
                        <Loader2 className="h-4 w-4 text-[var(--accent)] animate-spin" />
                        <span className="text-[12px] text-[var(--text2)]">Loading…</span>
                    </div>
                )}
                {!loading && (
                    <div className="flex items-center gap-2 bg-white border border-[var(--border)] rounded-[10px] px-3 py-2">
                        <Activity className="h-4 w-4 text-[var(--accent)]" />
                        <span className="text-[13px] font-medium text-[var(--text)]">Live Data</span>
                    </div>
                )}
            </div>

            {/* ═══════════════════════════════════════════════
                SECTION 1 — OVERVIEW KPI CARDS
            ═══════════════════════════════════════════════ */}
            <section>
                <SectionHeading>Overview</SectionHeading>
                {loading ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Array.from({ length: 8 }).map((_, i) => <KPICardSkeleton key={i} />)}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {/* Row 1 */}
                        <KPICard
                            icon={Users}
                            label="Total Employees"
                            value={hr?.totalEmployees ?? 0}
                            sub="All registered employees"
                            accent
                        />
                        <KPICard
                            icon={CheckCircle}
                            label="Active"
                            value={hr?.activeEmployees ?? 0}
                            sub={`${hr && hr.totalEmployees > 0 ? Math.round((hr.activeEmployees / hr.totalEmployees) * 100) : 0}% of workforce`}
                            accent
                        />
                        <KPICard
                            icon={Clock}
                            label="On Leave"
                            value={hr?.onLeave ?? 0}
                            sub="Currently on approved leave"
                            warn
                        />
                        <KPICard
                            icon={UserPlus}
                            label="New This Month"
                            value={hr?.newJoiningThisMonth ?? 0}
                            sub={`${hr?.exitedThisMonth ?? 0} exited this month`}
                        />
                        {/* Row 2 */}
                        <KPICard
                            icon={Building2}
                            label="Total Sites"
                            value={sites?.totalSites ?? 0}
                            sub={`${sites?.activeSites ?? 0} active`}
                            accent
                        />
                        <KPICard
                            icon={MapPin}
                            label="Deployed"
                            value={sites?.totalDeployed ?? 0}
                            sub="Currently deployed staff"
                            accent
                        />
                        <KPICard
                            icon={AlertCircle}
                            label="Understaffed Sites"
                            value={sites?.understaffed ?? 0}
                            sub="Below required headcount"
                            warn={!!sites?.understaffed && sites.understaffed > 0}
                        />
                        <KPICard
                            icon={Ticket}
                            label="Open Tickets"
                            value={helpdesk?.openTickets ?? 0}
                            sub={`${helpdesk?.urgentOpen ?? 0} urgent`}
                            warn={!!helpdesk?.urgentOpen && helpdesk.urgentOpen > 0}
                        />
                    </div>
                )}
            </section>

            {/* ═══════════════════════════════════════════════
                SECTION 2 — WORKFORCE
            ═══════════════════════════════════════════════ */}
            <section>
                <SectionHeading>Workforce</SectionHeading>
                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <SectionSkeleton rows={1} height="h-[260px]" />
                        <SectionSkeleton rows={1} height="h-[260px]" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Attendance */}
                        <div className="bg-white border border-[var(--border)] rounded-[12px] p-4">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[13px] font-semibold text-[var(--text)]">Attendance — This Month</span>
                                <div className="text-[22px] font-bold text-[var(--accent)]">
                                    {attendance?.avgAttendancePercent ?? 0}%
                                    <span className="text-[11px] font-normal text-[var(--text3)] ml-1">avg</span>
                                </div>
                            </div>
                            {/* Today summary */}
                            <div className="grid grid-cols-3 gap-2 mb-3">
                                <div className="bg-[var(--surface2)] rounded-[8px] p-2 text-center">
                                    <div className="text-[16px] font-bold text-[var(--accent)]">{attendance?.presentToday ?? 0}</div>
                                    <div className="text-[10px] text-[var(--text3)]">Present</div>
                                </div>
                                <div className="bg-[#fef2f2] rounded-[8px] p-2 text-center">
                                    <div className="text-[16px] font-bold text-[var(--red)]">{attendance?.absentToday ?? 0}</div>
                                    <div className="text-[10px] text-[var(--text3)]">Absent</div>
                                </div>
                                <div className="bg-[#fffbeb] rounded-[8px] p-2 text-center">
                                    <div className="text-[16px] font-bold text-[#d97706]">{attendance?.lateToday ?? 0}</div>
                                    <div className="text-[10px] text-[var(--text3)]">Late</div>
                                </div>
                            </div>
                            {/* 14-day trend */}
                            {(attendance?.monthlyTrend?.length ?? 0) > 0 && (
                                <ResponsiveContainer width="100%" height={120}>
                                    <BarChart data={attendance!.monthlyTrend} barSize={8}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={2} />
                                        <YAxis tick={{ fontSize: 9 }} />
                                        <Tooltip
                                            contentStyle={{ borderRadius: 8, border: "1px solid #e8e6e1", fontSize: 11 }}
                                        />
                                        <Bar dataKey="present" stackId="a" fill="#1a9e6e" name="Present" radius={[0, 0, 0, 0]} />
                                        <Bar dataKey="absent" stackId="a" fill="#dc2626" name="Absent" radius={[3, 3, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>

                        {/* Leave Breakdown */}
                        <div className="bg-white border border-[var(--border)] rounded-[12px] p-4">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[13px] font-semibold text-[var(--text)]">Leave Breakdown</span>
                                <div className="flex gap-2 text-[11px]">
                                    <span className="px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#d97706] font-medium">
                                        {leave?.pendingRequests ?? 0} pending
                                    </span>
                                    <span className="px-2 py-0.5 rounded-full bg-[var(--accent-light)] text-[var(--accent)] font-medium">
                                        {leave?.approvedThisMonth ?? 0} approved
                                    </span>
                                </div>
                            </div>
                            {(leave?.byType?.length ?? 0) > 0 ? (
                                <ResponsiveContainer width="100%" height={180}>
                                    <BarChart
                                        layout="vertical"
                                        data={leave!.byType}
                                        margin={{ left: 0, right: 16 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis type="number" tick={{ fontSize: 10 }} />
                                        <YAxis type="category" dataKey="type" tick={{ fontSize: 11 }} width={36} />
                                        <Tooltip
                                            contentStyle={{ borderRadius: 8, border: "1px solid #e8e6e1", fontSize: 11 }}
                                        />
                                        <Bar dataKey="count" fill="#1a9e6e" name="Leaves" radius={[0, 4, 4, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex items-center justify-center h-[180px] text-[var(--text3)] text-[13px]">
                                    No leave data this month
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </section>

            {/* ═══════════════════════════════════════════════
                SECTION 3 — FINANCE
            ═══════════════════════════════════════════════ */}
            <section>
                <SectionHeading>Finance</SectionHeading>
                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <SectionSkeleton rows={1} height="h-[160px]" />
                        <SectionSkeleton rows={1} height="h-[160px]" />
                        <SectionSkeleton rows={1} height="h-[160px]" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <FinanceCard
                            title="Payroll"
                            rows={[
                                { label: "Gross Salary", value: inr(payroll?.totalGross ?? 0) },
                                { label: "Net Salary", value: inr(payroll?.totalNet ?? 0), accent: true },
                                { label: "PF Liability", value: inr(payroll?.totalPFLiability ?? 0) },
                                {
                                    label: "Processed / Pending",
                                    value: `${payroll?.processedCount ?? 0} / ${payroll?.pendingCount ?? 0}`
                                },
                            ]}
                        />
                        <FinanceCard
                            title="Billing"
                            badge={billing?.overdueCount ? { label: "overdue", count: billing.overdueCount } : undefined}
                            rows={[
                                { label: "Invoiced This Month", value: inr(billing?.invoicedThisMonth ?? 0) },
                                { label: "Collected", value: inr(billing?.collectedThisMonth ?? 0), accent: true },
                                {
                                    label: "Outstanding",
                                    value: inr(billing?.outstanding ?? 0),
                                    red: (billing?.outstanding ?? 0) > 0
                                },
                            ]}
                        />
                        <FinanceCard
                            title="Expenses"
                            rows={[
                                { label: "Pending Approvals", value: String(expenses?.pendingApprovals ?? 0) },
                                { label: "Approved This Month", value: inr(expenses?.approvedThisMonth ?? 0), accent: true },
                            ]}
                        />
                    </div>
                )}
            </section>

            {/* ═══════════════════════════════════════════════
                SECTION 4 — RECRUITMENT PIPELINE
            ═══════════════════════════════════════════════ */}
            <section>
                <SectionHeading>Recruitment Pipeline</SectionHeading>
                {loading ? (
                    <SectionSkeleton rows={1} height="h-[120px]" />
                ) : (
                    <div className="bg-white border border-[var(--border)] rounded-[12px] p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                            <div>
                                <span className="text-[13px] font-semibold text-[var(--text)]">Candidate Pipeline</span>
                                <span className="ml-2 text-[11px] text-[var(--text3)]">
                                    {recruitment?.totalLeads ?? 0} total leads · {recruitment?.activeLeads ?? 0} active
                                </span>
                            </div>
                            <div className="flex gap-3 text-[12px]">
                                <span className="px-2.5 py-1 rounded-full bg-[var(--accent-light)] text-[var(--accent)] font-medium">
                                    ✓ {recruitment?.selectedThisMonth ?? 0} selected this month
                                </span>
                                <span className="px-2.5 py-1 rounded-full bg-[#fef2f2] text-[var(--red)] font-medium">
                                    ✕ {recruitment?.rejectedThisMonth ?? 0} rejected
                                </span>
                            </div>
                        </div>
                        <RecruitmentPipeline byStatus={recruitment?.byStatus ?? []} />
                    </div>
                )}
            </section>

            {/* ═══════════════════════════════════════════════
                SECTION 5 — PEOPLE OPS
            ═══════════════════════════════════════════════ */}
            <section>
                <SectionHeading>People Ops</SectionHeading>
                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <SectionSkeleton rows={1} height="h-[140px]" />
                        <SectionSkeleton rows={1} height="h-[140px]" />
                        <SectionSkeleton rows={1} height="h-[140px]" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <PeopleCard
                            title="Onboarding"
                            icon={UserPlus}
                            items={[
                                { label: "In Progress", value: onboarding?.inProgress ?? 0, color: "text-[#f59e0b]" },
                                { label: "Completed This Month", value: onboarding?.completedThisMonth ?? 0, color: "text-[var(--accent)]" },
                                { label: "Not Started", value: onboarding?.notStarted ?? 0, color: "text-[var(--text3)]" },
                            ]}
                        />
                        <PeopleCard
                            title="Exit Management"
                            icon={LogOut}
                            items={[
                                { label: "Active Exits", value: exit?.activeExits ?? 0, color: "text-[var(--red)]" },
                                { label: "F&F Pending", value: exit?.fnfPending ?? 0, color: "text-[#d97706]" },
                                { label: "Completed This Month", value: exit?.completedThisMonth ?? 0, color: "text-[var(--accent)]" },
                            ]}
                        />
                        <PeopleCard
                            title="Helpdesk"
                            icon={Ticket}
                            items={[
                                { label: "Open Tickets", value: helpdesk?.openTickets ?? 0, color: "text-[var(--red)]" },
                                { label: "Urgent", value: helpdesk?.urgentOpen ?? 0, color: "text-[#d97706]" },
                                { label: "Resolved This Month", value: helpdesk?.resolvedThisMonth ?? 0, color: "text-[var(--accent)]" },
                            ]}
                        />
                    </div>
                )}
            </section>

            {/* ═══════════════════════════════════════════════
                SECTION 6 — INSPECTION TRENDS
            ═══════════════════════════════════════════════ */}
            <section>
                <SectionHeading>Inspection Trends</SectionHeading>

                {loading ? (
                    <SectionSkeleton rows={1} height="h-[260px]" />
                ) : (
                    <>
                        {monthlyTrend.length > 0 && (
                            <div className="bg-white border border-[var(--border)] rounded-[12px] p-5 mb-4">
                                <h2 className="text-[14px] font-semibold text-[var(--text)] mb-4 flex items-center gap-2">
                                    <TrendingUp className="h-4 w-4 text-[var(--accent)]" /> Monthly Inspection Trend
                                </h2>
                                <ResponsiveContainer width="100%" height={220}>
                                    <LineChart data={monthlyTrend}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                                        <YAxis tick={{ fontSize: 11 }} />
                                        <Tooltip
                                            contentStyle={{ borderRadius: 8, border: "1px solid #e8e6e1", fontSize: 12 }}
                                            formatter={(val: number | string | undefined, name: string | undefined) => [val, name === "rate" ? "Approval Rate %" : (name ?? "")]}
                                        />
                                        <Legend wrapperStyle={{ fontSize: 12 }} />
                                        <Line type="monotone" dataKey="submitted" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Submitted" />
                                        <Line type="monotone" dataKey="approved" stroke="#1a9e6e" strokeWidth={2} dot={{ r: 3 }} name="Approved" />
                                        <Line type="monotone" dataKey="rate" stroke="#d97706" strokeWidth={2} dot={{ r: 3 }} name="Rate %" strokeDasharray="4 2" />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {/* Inspector Rankings */}
                        <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-hidden mb-4">
                            <div className="p-4 border-b border-[var(--border)] flex items-center gap-2">
                                <Trophy className="h-4 w-4 text-yellow-500" />
                                <span className="text-[14px] font-semibold text-[var(--text)]">Inspector Rankings</span>
                                <span className="text-[11px] text-[var(--text3)] ml-auto">Sorted by acceptance rate</span>
                            </div>
                            {inspectors.length === 0 ? (
                                <div className="p-12 text-center">
                                    <Users className="h-8 w-8 text-[var(--border)] mx-auto mb-2" />
                                    <p className="text-[13px] text-[var(--text3)]">No inspector data yet</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-[#f0f0f0]">
                                    {inspectors.map((inspector, idx) => (
                                        <div key={inspector.id} className={cn(
                                            "p-4 hover:bg-[#f9f8f5] transition-colors",
                                            idx === 0 && "bg-yellow-50/40"
                                        )}>
                                            <div className="flex items-start gap-4">
                                                <div className="flex items-center justify-center w-8 shrink-0 pt-0.5">
                                                    <RankIcon idx={idx} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between gap-2 mb-2">
                                                        <div>
                                                            <p className="text-[14px] font-semibold text-[var(--text)]">{inspector.name}</p>
                                                            <p className="text-[11px] text-[var(--text3)]">{inspector.email}</p>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <div className={cn(
                                                                "px-3 py-1 rounded-full text-[12px] font-bold",
                                                                inspector.acceptanceRate >= 80 ? "bg-green-100 text-green-700" :
                                                                inspector.acceptanceRate >= 50 ? "bg-yellow-100 text-yellow-700" :
                                                                "bg-red-100 text-red-700"
                                                            )}>
                                                                {inspector.acceptanceRate}%
                                                            </div>
                                                            <span className="text-[11px] text-[var(--text3)]">acceptance</span>
                                                        </div>
                                                    </div>
                                                    <div className="h-1.5 bg-[#f0f0f0] rounded-full mb-3">
                                                        <div
                                                            className={cn(
                                                                "h-1.5 rounded-full transition-all",
                                                                inspector.acceptanceRate >= 80 ? "bg-[var(--accent)]" :
                                                                inspector.acceptanceRate >= 50 ? "bg-[#d97706]" : "bg-[var(--red)]"
                                                            )}
                                                            style={{ width: `${inspector.acceptanceRate}%` }}
                                                        />
                                                    </div>
                                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                        <div className="bg-[#f9f8f5] rounded-[8px] p-2.5">
                                                            <p className="text-[10px] text-[var(--text3)] uppercase tracking-wide mb-0.5">Total</p>
                                                            <p className="text-[16px] font-bold text-[var(--text)]">{inspector.total}</p>
                                                        </div>
                                                        <div className="bg-green-50 rounded-[8px] p-2.5">
                                                            <p className="text-[10px] text-[var(--text3)] uppercase tracking-wide mb-0.5 flex items-center gap-1">
                                                                <CheckCircle2 className="h-2.5 w-2.5 text-green-600" /> Approved
                                                            </p>
                                                            <p className="text-[16px] font-bold text-green-700">{inspector.approved}</p>
                                                        </div>
                                                        <div className="bg-red-50 rounded-[8px] p-2.5">
                                                            <p className="text-[10px] text-[var(--text3)] uppercase tracking-wide mb-0.5 flex items-center gap-1">
                                                                <XCircle className="h-2.5 w-2.5 text-red-500" /> Rejected
                                                            </p>
                                                            <p className="text-[16px] font-bold text-red-600">{inspector.rejected}</p>
                                                        </div>
                                                        <div className="bg-orange-50 rounded-[8px] p-2.5">
                                                            <p className="text-[10px] text-[var(--text3)] uppercase tracking-wide mb-0.5 flex items-center gap-1">
                                                                <CornerUpLeft className="h-2.5 w-2.5 text-orange-500" /> Sent Back
                                                            </p>
                                                            <p className="text-[16px] font-bold text-orange-600">
                                                                {inspector.avgSentBack.toFixed(1)}
                                                                <span className="text-[10px] font-normal"> avg</span>
                                                            </p>
                                                        </div>
                                                    </div>
                                                    {inspector.avgTurnaroundHours > 0 && (
                                                        <div className="mt-2 flex items-center gap-1 text-[11px] text-[var(--text3)]">
                                                            <Clock className="h-3 w-3" />
                                                            <span>Avg turnaround: <strong className="text-[var(--text)]">{inspector.avgTurnaroundHours}h</strong></span>
                                                        </div>
                                                    )}
                                                    {inspector.recentInspections.length > 0 && (
                                                        <div className="mt-2 flex gap-2 flex-wrap">
                                                            {inspector.recentInspections.map((r, i) => (
                                                                <span key={i} className={cn(
                                                                    "text-[10px] px-2 py-0.5 rounded-full border font-medium",
                                                                    r.status === "approved" ? "bg-green-50 text-green-700 border-green-200" :
                                                                    r.status === "rejected" ? "bg-red-50 text-red-600 border-red-200" :
                                                                    r.status === "pending" ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                                                                    "bg-gray-100 text-gray-600 border-gray-200"
                                                                )}>
                                                                    {r.project} · {r.status}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Bar chart: submissions per inspector */}
                        {inspectors.length > 0 && (
                            <div className="bg-white border border-[var(--border)] rounded-[12px] p-5">
                                <h2 className="text-[14px] font-semibold text-[var(--text)] mb-4 flex items-center gap-2">
                                    <TrendingUp className="h-4 w-4 text-[var(--accent)]" /> Inspection Volume by Inspector
                                </h2>
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={inspectors.slice(0, 10).map(i => ({
                                        name: i.name.split(" ")[0],
                                        approved: i.approved,
                                        rejected: i.rejected,
                                        pending: i.pending
                                    }))}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                        <YAxis tick={{ fontSize: 11 }} />
                                        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e8e6e1", fontSize: 12 }} />
                                        <Legend wrapperStyle={{ fontSize: 12 }} />
                                        <Bar dataKey="approved" stackId="a" fill="#1a9e6e" name="Approved" radius={[0, 0, 0, 0]} />
                                        <Bar dataKey="rejected" stackId="a" fill="#dc2626" name="Rejected" />
                                        <Bar dataKey="pending" stackId="a" fill="#d97706" name="Pending" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </>
                )}
            </section>

            {/* Footer spacing */}
            <div className="h-4" />
        </div>
    )
}
