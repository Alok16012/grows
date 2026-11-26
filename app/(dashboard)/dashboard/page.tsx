"use client"

// Universal permission-driven dashboard.
// Every custom-role user lands here after login and sees ONLY the widgets
// their permissions allow — styled to match the admin dashboard.

import { useSession } from "next-auth/react"
import { AssetReceiptCard } from "@/components/assets/AssetReceiptCard"
import { COMPANY } from "@/lib/company"
import { ResponsiveHome } from "@/components/ResponsiveHome"
import { useCachedFetch } from "@/lib/useCachedFetch"
import {
    Users, CalendarCheck, ClipboardCheck, ClipboardList, ChevronRight,
    ArrowUpRight, UserPlus, LogOut, Wallet, Target, KeyRound, Headphones,
    MapPin, Folder, XCircle, Clock, CreditCard, BarChart2, Send,
    CalendarOff, GraduationCap, UserCheck, Sparkles,
} from "lucide-react"
import Link from "next/link"
import { format } from "date-fns"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { NeedsSiteBanner } from "@/components/new-joiners/NeedsSiteBanner"
import { MyDay } from "@/components/dashboard/MyDay"
import { WorkPanels } from "@/components/dashboard/WorkPanels"

// ─── Small shared pieces (mirrors the admin dashboard) ───────────────────────

type DonutSlice = { label: string; value: number; color: string }

function Donut({ slices, centerLabel }: { slices: DonutSlice[]; centerLabel: string }) {
    const sum = slices.reduce((s, x) => s + x.value, 0)
    const R = 38
    const C = 2 * Math.PI * R
    const nonzero = slices.filter(s => s.value > 0)
    let acc = 0
    return (
        <svg viewBox="0 0 100 100" className="w-[116px] h-[116px] shrink-0" role="img" aria-label={centerLabel}>
            <circle cx="50" cy="50" r={R} fill="none" stroke="var(--surface2)" strokeWidth="13" />
            {sum > 0 && nonzero.map(s => {
                const len = (s.value / sum) * C
                const dash = nonzero.length === 1 ? C : Math.max(0.5, len - 2)
                const el = (
                    <circle key={s.label} cx="50" cy="50" r={R} fill="none" stroke={s.color} strokeWidth="13"
                        strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-acc}
                        transform="rotate(-90 50 50)">
                        <title>{`${s.label}: ${s.value} (${Math.round((s.value / sum) * 100)}%)`}</title>
                    </circle>
                )
                acc += len
                return el
            })}
            <text x="50" y="49" textAnchor="middle" style={{ fontSize: 17, fontWeight: 700, fill: "var(--text)" }}>
                {sum.toLocaleString("en-IN")}
            </text>
            <text x="50" y="61" textAnchor="middle" style={{ fontSize: 6.5, fill: "var(--text3)", letterSpacing: 0.8 }}>
                {centerLabel}
            </text>
        </svg>
    )
}

function DonutLegend({ slices }: { slices: DonutSlice[] }) {
    const sum = slices.reduce((s, x) => s + x.value, 0)
    return (
        <div className="space-y-1.5 min-w-0 flex-1">
            {slices.map(s => (
                <div key={s.label} className="flex items-center gap-2 text-[12px]">
                    <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: s.color }} />
                    <span className="text-[var(--text2)] truncate flex-1">{s.label}</span>
                    <span className="font-semibold text-[var(--text)] tabular-nums">{s.value.toLocaleString("en-IN")}</span>
                    <span className="text-xs text-[var(--text2)] tabular-nums w-9 text-right">
                        {sum > 0 ? Math.round((s.value / sum) * 100) : 0}%
                    </span>
                </div>
            ))}
        </div>
    )
}

// ─── KPI card ────────────────────────────────────────────────────────────────

const kpiCard = "group flex min-h-[148px] min-w-0 flex-col rounded-2xl border border-[var(--border2)] bg-[var(--surface)] p-4 shadow-sm transition-colors hover:border-[var(--accent)] lg:p-5"

function KpiCard({ href, icon: Icon, iconBg, iconColor, label, value, sub }: {
    href: string; icon: React.ElementType; iconBg: string; iconColor: string
    label: string; value: string; sub?: React.ReactNode
}) {
    return (
        <Link href={href} className={kpiCard}>
            <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: iconBg }}>
                        <Icon size={17} style={{ color: iconColor }} aria-hidden="true" />
                    </div>
                    <span className="text-sm font-medium leading-snug text-[var(--text2)]">{label}</span>
                </div>
                <ChevronRight size={16} className="shrink-0 text-[var(--text2)] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </div>
            <div className="mb-3 break-words text-[clamp(1.75rem,2.4vw,2.2rem)] font-bold leading-none tracking-tight text-[var(--text)] tabular-nums">{value}</div>
            {sub && <div className="mt-auto text-xs text-[var(--text2)]">{sub}</div>}
        </Link>
    )
}

// ─── Pipeline card ───────────────────────────────────────────────────────────

function PipelineCard({ href, icon: Icon, iconBg, iconColor, title, big, bigSub, rows, linkLabel }: {
    href: string; icon: React.ElementType; iconBg: string; iconColor: string
    title: string; big: string; bigSub: string
    rows: { label: string; value: string }[]; linkLabel: string
}) {
    return (
        <div className="flex min-w-0 flex-col rounded-2xl border border-[var(--border2)] bg-[var(--surface)] p-4 shadow-sm lg:p-5">
            <div className="h-8 w-8 rounded-[9px] flex items-center justify-center mb-3" style={{ background: iconBg }}>
                <Icon size={15} style={{ color: iconColor }} />
            </div>
            <p className="mb-2 text-sm font-semibold leading-snug text-[var(--text)]">{title}</p>
            <div className="text-[26px] font-bold leading-none text-[var(--text)] tabular-nums">{big}</div>
            <p className="mb-3 mt-1 text-xs text-[var(--text2)]">{bigSub}</p>
            <div className="mb-3 space-y-2 text-xs text-[var(--text2)]">
                {rows.map(r => (
                    <div key={r.label} className="flex justify-between gap-2"><span>{r.label}</span><span className="font-semibold tabular-nums">{r.value}</span></div>
                ))}
            </div>
            <Link href={href} className="mt-auto inline-flex min-h-8 items-center text-sm font-medium text-[var(--accent-text)] hover:underline">{linkLabel} →</Link>
        </div>
    )
}

// ─── Quick actions (permission-gated) ────────────────────────────────────────

const ALL_ACTIONS: { perm: string[]; href: string; icon: React.ElementType; label: string; sub: string; color: string; bg: string }[] = [
    { perm: ["approvals.view"],                      href: "/approvals",            icon: ClipboardCheck, label: "Approve Requests",  sub: "Pending approvals",   color: "#d97706", bg: "#fef3c7" },
    { perm: ["attendance.view"],                     href: "/attendance",           icon: Clock,          label: "Attendance",        sub: "View & mark",         color: "#3d6ff5", bg: "#eaf0ff" },
    { perm: ["employees.view"],                      href: "/employees",            icon: UserCheck,      label: "Employees",         sub: "Employee directory",  color: "#3d6ff5", bg: "#eaf0ff" },
    { perm: ["employees.create"],                    href: "/employees",            icon: UserPlus,       label: "Add Employee",      sub: "Onboard new hire",    color: "#0891b2", bg: "#ecfeff" },
    { perm: ["recruitment.view"],                    href: "/recruitment",          icon: Target,         label: "Recruitment",       sub: "Candidate pipeline",  color: "#8b6cf6", bg: "#f1edff" },
    { perm: ["onboarding.view"],                     href: "/onboarding",           icon: ClipboardList,  label: "Onboarding",        sub: "Review candidates",   color: "#0d9488", bg: "#f0fdfa" },
    { perm: ["leaves.view", "leaves.approve"],       href: "/leaves",               icon: CalendarOff,    label: "Leaves",            sub: "Requests & balances", color: "#f59e0b", bg: "#fef3c7" },
    { perm: ["expenses.view", "expenses.approve"],    href: "/expenses",             icon: CreditCard,     label: "Expenses",          sub: "Claims & approvals",  color: "#b45309", bg: "#fef3c7" },
    { perm: ["payroll.view"],                        href: "/payroll",              icon: Wallet,         label: "Payroll",           sub: "Salary processing",   color: "#3d6ff5", bg: "#eaf0ff" },
    { perm: ["projects.view"],                       href: "/projects",             icon: Folder,         label: "Projects",          sub: "All projects",        color: "#6d4fe0", bg: "#f1edff" },
    { perm: ["sites.view"],                          href: "/sites",                icon: MapPin,         label: "Sites",             sub: "Site management",     color: "#0891b2", bg: "#ecfeff" },
    { perm: ["assignments.view"],                    href: "/assignments",          icon: ClipboardList,  label: "Assignments",       sub: "Inspection work",     color: "#0d9488", bg: "#f0fdfa" },
    { perm: ["documents.view"],                      href: "/documents/send",       icon: Send,           label: "Send Document",     sub: "Issue letters",       color: "#b45309", bg: "#fef3c7" },
    { perm: ["users.manage"],                        href: "/admin/employee-logins", icon: KeyRound,      label: "Employee Logins",   sub: "IDs & passwords",     color: "#dc2626", bg: "#fef2f2" },
    { perm: ["helpdesk.view"],                       href: "/helpdesk",             icon: Headphones,     label: "Helpdesk",          sub: "Support tickets",     color: "#555c72", bg: "#f6f7fc" },
    { perm: ["reports.view"],                        href: "/reports",              icon: BarChart2,      label: "Reports",           sub: "Analytics & exports", color: "#0d9488", bg: "#f0fdfa" },
    { perm: ["lms.view", "lms.edit"],              href: "/lms/learn",            icon: GraduationCap,  label: "Training",          sub: "Courses & learning",  color: "#8b6cf6", bg: "#f1edff" },
]

// Phones get the Zavtoo-style MobileHome; md and up keep this dashboard.
export default function UniversalDashboard() {
    return <ResponsiveHome desktop={<DesktopDashboard />} />
}

function DesktopDashboard() {
    const { data: session } = useSession()
    // Cached fetch: revisits paint the last snapshot instantly and refresh in
    // the background — critical because the server is far from most users.
    const { data: stats, loading } = useCachedFetch<any>("/api/dashboard/stats")

    const perms: string[] = (session?.user as any)?.permissions || []
    const isAdmin = session?.user?.role === "ADMIN"
    const has = (...keys: string[]) => isAdmin || keys.some(k => perms.includes(k))

    if (loading || !session) {
        return (
            <div className="space-y-6 animate-pulse p-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-[14px]">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 w-full rounded-[14px]" />)}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-[14px]">
                    <Skeleton className="h-48 rounded-[14px]" />
                    <Skeleton className="h-48 rounded-[14px]" />
                    <Skeleton className="h-48 rounded-[14px]" />
                </div>
            </div>
        )
    }

    if (!stats || stats.error) {
        return (
            <div className="flex h-[400px] flex-col items-center justify-center m-4 rounded-[14px] border border-dashed border-[var(--border)] bg-[var(--surface)]">
                <XCircle size={40} className="text-[var(--red)] mb-4" />
                <h3 className="text-[18px] font-bold text-[var(--text)] mb-2">Failed to load dashboard</h3>
                <p className="text-[13px] text-[var(--text2)] mb-6">{stats?.error || "Connection error"}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="px-6 py-2 bg-[var(--accent)] text-white text-[13px] font-semibold rounded-[8px] hover:opacity-90 transition-all"
                >
                    Try Again
                </button>
            </div>
        )
    }

    const roleName = (session.user as { customRoleName?: string | null }).customRoleName

    const att = stats.attendanceToday
    const approvals = stats.approvals
    const employees = stats.employees
    const onboarding = stats.onboarding
    const exits = stats.exits
    const payroll = stats.payroll
    const recruitment = stats.recruitment
    const logins = stats.logins
    const week7: { day: string; count: number }[] = stats.attendanceTrend7d || []
    const week7Max = Math.max(1, ...week7.map(d => d.count))
    const fmtK = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "K" : String(n))

    // ── KPI cards, in priority order — first 4 the user qualifies for ────────
    const kpis: React.ReactNode[] = []
    if (employees) kpis.push(
        <KpiCard key="emp" href="/employees" icon={Users} iconBg="#eaf0ff" iconColor="#2f5be0"
            label="Active Employees" value={(employees.active ?? 0).toLocaleString("en-IN")}
            sub={employees.new30d > 0
                ? <span className="inline-flex items-center gap-0.5 h-6 px-2 rounded-full bg-[var(--accent-light)] text-[var(--accent-text)] text-[11px] font-semibold"><ArrowUpRight size={12} className="stroke-[3px]" />+{employees.new30d} last 30 days</span>
                : <span className="text-xs text-[var(--text2)]">No new joiners in 30 days</span>}
        />
    )
    if (att) kpis.push(
        <KpiCard key="att" href="/attendance" icon={CalendarCheck} iconBg="#dcfce7" iconColor="#15803d"
            label="Today's Attendance" value={`${att.pct}%`}
            sub={<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="text-[var(--text3)]">Present <span className="font-semibold text-[var(--accent-text)] tabular-nums">{att.present.toLocaleString("en-IN")}</span></span>
                <span className="text-[var(--text3)]">Absent <span className="font-semibold text-[var(--red)] tabular-nums">{att.absent.toLocaleString("en-IN")}</span></span>
                <span className="text-[var(--text3)]">Leave <span className="font-semibold text-[var(--amber)] tabular-nums">{att.onLeave.toLocaleString("en-IN")}</span></span>
            </div>}
        />
    )
    if (approvals) kpis.push(
        <KpiCard key="apr" href="/approvals" icon={ClipboardCheck} iconBg="#fef3c7" iconColor="#d97706"
            label="Pending Approvals" value={String(approvals.total)}
            sub={<span className="text-xs text-[var(--text2)]">
                {[
                    approvals.hasLeaves ? `${approvals.leaves} leaves` : null,
                    approvals.hasExpenses ? `${approvals.expenses} expenses` : null,
                    approvals.hasInspections ? `${approvals.inspections} inspections` : null,
                ].filter(Boolean).join(" · ")}
            </span>}
        />
    )
    if (recruitment) kpis.push(
        <KpiCard key="rec" href="/recruitment" icon={Target} iconBg="#f1edff" iconColor="#8b6cf6"
            label="Active Candidates" value={String(recruitment.activeLeads)}
            sub={<span className="text-xs text-[var(--text2)]">+{recruitment.newLeads30d} new · {recruitment.joined30d} joined (30d)</span>}
        />
    )
    if (logins) kpis.push(
        <KpiCard key="log" href="/admin/employee-logins" icon={KeyRound} iconBg="#fef2f2" iconColor="#dc2626"
            label="Employee Logins" value={`${logins.withLogin}/${logins.totalEmployees}`}
            sub={logins.withoutLogin > 0
                ? <span className="text-[11px] font-semibold text-[var(--amber)]">{logins.withoutLogin} without login</span>
                : <span className="text-xs text-[var(--text2)]">All employees have logins</span>}
        />
    )
    if (stats.activeAssignments !== undefined) kpis.push(
        <KpiCard key="asg" href="/assignments" icon={ClipboardList} iconBg="#f0fdfa" iconColor="#0d9488"
            label="Active Assignments" value={String(stats.activeAssignments)} />
    )
    if (stats.activeSites !== undefined) kpis.push(
        <KpiCard key="sit" href="/sites" icon={MapPin} iconBg="#ecfeff" iconColor="#0891b2"
            label="Active Sites" value={String(stats.activeSites)} />
    )
    if (stats.openTickets !== undefined) kpis.push(
        <KpiCard key="tkt" href="/helpdesk" icon={Headphones} iconBg="#f6f7fc" iconColor="#555c72"
            label="Open Tickets" value={String(stats.openTickets)} />
    )
    const kpiRow = kpis.slice(0, 4)

    // ── Donut data ───────────────────────────────────────────────────────────
    const attSlices: DonutSlice[] = att ? [
        { label: "Present", value: att.present, color: "#16a34a" },
        { label: "Absent", value: att.absent, color: "#dc2626" },
        { label: "On Leave", value: att.onLeave, color: "#f59e0b" },
    ] : []
    const pbs = stats.projectsByStatus || null
    const projSlices: DonutSlice[] = pbs ? [
        { label: "Active", value: pbs.ACTIVE ?? 0, color: "#16a34a" },
        { label: "Planning", value: pbs.PLANNING ?? 0, color: "#3d6ff5" },
        { label: "On Hold", value: pbs.ON_HOLD ?? 0, color: "#ef4444" },
        { label: "Completed", value: pbs.COMPLETED ?? 0, color: "#6d4fe0" },
    ] : []

    // ── Pipeline cards ───────────────────────────────────────────────────────
    const pipelines: React.ReactNode[] = []
    if (onboarding) pipelines.push(
        <PipelineCard key="onb" href="/onboarding" icon={UserPlus} iconBg="#eaf0ff" iconColor="#2f5be0"
            title="Onboarding Pipeline" big={String(onboarding.inProgress)} bigSub="In progress"
            rows={[
                { label: "Yet to start", value: String(onboarding.notStarted) },
                { label: "On hold", value: String(onboarding.onHold) },
            ]} linkLabel="View pipeline" />
    )
    if (exits) pipelines.push(
        <PipelineCard key="ext" href="/exit" icon={LogOut} iconBg="#fef3c7" iconColor="#d97706"
            title="Exits Pending" big={String(exits.pending)} bigSub="Open requests"
            rows={[{ label: "Clearances pending", value: String(exits.clearancePending) }]}
            linkLabel="View details" />
    )
    if (payroll) pipelines.push(
        <PipelineCard key="pay" href="/payroll" icon={Wallet} iconBg="#eaf0ff" iconColor="#3d6ff5"
            title="Payroll Status" big={`${payroll.pct}%`} bigSub={`Processed · ${format(new Date(), "MMM yyyy")}`}
            rows={[
                { label: "Processed", value: payroll.processed.toLocaleString("en-IN") },
                { label: "Pending", value: payroll.pending.toLocaleString("en-IN") },
            ]} linkLabel="View payroll" />
    )
    if (logins && kpiRow.length >= 4 && !kpis.slice(0, 4).some((k: any) => k?.key === "log")) pipelines.push(
        <PipelineCard key="log2" href="/admin/employee-logins" icon={KeyRound} iconBg="#fef2f2" iconColor="#dc2626"
            title="Employee Logins" big={`${logins.withLogin}/${logins.totalEmployees}`} bigSub="Logins provisioned"
            rows={[{ label: "Without login", value: String(logins.withoutLogin) }]}
            linkLabel="Manage logins" />
    )

    const actions = ALL_ACTIONS.filter(a => has(...a.perm)).slice(0, 8)

    const hasAnyWidget = kpiRow.length > 0 || pipelines.length > 0 || attSlices.length > 0 || projSlices.length > 0

    return (
        <div className="space-y-5 p-4 lg:space-y-6 lg:p-0 [container-type:inline-size]">
            <header className="rounded-2xl bg-[#152647] px-5 py-5 text-white lg:px-6">
                <h1 className="text-[clamp(1.6rem,2.8vw,2rem)] font-semibold leading-tight tracking-tight">Workspace</h1>
                {roleName && <p className="mt-1 text-sm text-slate-200">{roleName}</p>}
            </header>
            <NeedsSiteBanner />
            {/* Issued assets waiting for Received / Not received (blinks). */}
            <AssetReceiptCard />
            {/* Check-in, quick actions, my tasks, events, attendance and leave rings. */}
            <MyDay />
            {/* The profile's own work first: recruiter, payroll, inspector, HR, approver … */}
            <WorkPanels />
            {hasAnyWidget && <h2 className="pt-1 text-lg font-semibold text-[var(--text)]">Company overview</h2>}

            {/* ── KPI ROW ── */}
            {kpiRow.length > 0 && (
                <div className={cn(
                    "grid grid-cols-1 gap-4",
                    kpiRow.length === 1 ? "max-w-sm" : "[@container(min-width:420px)]:grid-cols-2",
                    kpiRow.length === 3 && "[@container(min-width:680px)]:grid-cols-3",
                    kpiRow.length === 4 && "[@container(min-width:940px)]:grid-cols-4"
                )}>
                    {kpiRow}
                </div>
            )}

            {/* ── Visual row: donuts + 7-day trend ── */}
            {(attSlices.length > 0 || projSlices.length > 0) && (
                <div className={cn(
                    "grid grid-cols-1 items-stretch gap-4",
                    "[@container(min-width:640px)]:grid-cols-2",
                    att && pbs && "[@container(min-width:960px)]:grid-cols-3"
                )}>
                    {att && (
                        <div className="min-w-0 rounded-2xl border border-[var(--border2)] bg-[var(--surface)] p-4 shadow-sm lg:p-5">
                            <h3 className="text-base font-semibold text-[var(--text)] mb-3">
                                Attendance Split <span className="font-normal text-[var(--text3)]">(Today)</span>
                            </h3>
                            {att.present + att.absent + att.onLeave === 0 ? (
                                <p className="text-[12.5px] text-[var(--text3)] text-center py-8">No attendance marked yet.</p>
                            ) : (
                                <div className="flex items-center gap-4">
                                    <Donut centerLabel="EMPLOYEES" slices={attSlices} />
                                    <DonutLegend slices={attSlices} />
                                </div>
                            )}
                        </div>
                    )}
                    {pbs && (
                        <div className="min-w-0 rounded-2xl border border-[var(--border2)] bg-[var(--surface)] p-4 shadow-sm lg:p-5">
                            <h3 className="text-base font-semibold text-[var(--text)] mb-3">Projects by Status</h3>
                            {projSlices.every(s => s.value === 0) ? (
                                <p className="text-[12.5px] text-[var(--text3)] text-center py-8">No projects yet.</p>
                            ) : (
                                <div className="flex items-center gap-4">
                                    <Donut centerLabel="PROJECTS" slices={projSlices} />
                                    <DonutLegend slices={projSlices} />
                                </div>
                            )}
                        </div>
                    )}
                    {att && (
                        <div className="min-w-0 rounded-2xl border border-[var(--border2)] bg-[var(--surface)] p-4 shadow-sm lg:p-5 flex flex-col">
                            <h3 className="text-base font-semibold text-[var(--text)] mb-1">
                                Attendance <span className="font-normal text-[var(--text3)]">(Last 7 days)</span>
                            </h3>
                            <p className="text-xs text-[var(--text2)] mb-3">Employees checked in per day</p>
                            {week7.length === 0 ? (
                                <p className="text-[12.5px] text-[var(--text3)] text-center py-8">No attendance data yet.</p>
                            ) : (
                                <div className="flex-1 flex flex-col justify-end">
                                    <div className="flex gap-2">
                                        <div className="flex flex-col justify-between text-[10px] text-[var(--text3)] tabular-nums h-[88px] py-0.5 shrink-0 text-right w-7">
                                            <span>{fmtK(week7Max)}</span>
                                            <span>{fmtK(Math.round(week7Max / 2))}</span>
                                            <span>0</span>
                                        </div>
                                        <div className="flex-1 flex items-end gap-[6px] h-[88px] border-l border-b border-[var(--border)] pl-2">
                                            {week7.map((d, i) => (
                                                <div
                                                    key={d.day}
                                                    style={{ height: `${Math.max(3, (d.count / week7Max) * 100)}%` }}
                                                    title={`${format(new Date(d.day), "EEE, d MMM")}: ${d.count}`}
                                                    className={cn(
                                                        "flex-1 rounded-t-[3px] transition-all",
                                                        i === week7.length - 1
                                                            ? "bg-[var(--accent)]"
                                                            : "bg-[color-mix(in_srgb,var(--accent)_28%,transparent)]"
                                                    )}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex gap-[6px] pl-9 mt-1.5">
                                        {week7.map(d => (
                                            <span key={d.day} className="flex-1 text-center text-xs text-[var(--text2)] font-medium">
                                                {format(new Date(d.day), "EEE")}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ── Pipelines + Quick Actions ── */}
            {(pipelines.length > 0 || actions.length > 0) && (
                <div className="grid grid-cols-1 items-stretch gap-4 [@container(min-width:920px)]:grid-cols-2">
                    {pipelines.length > 0 && (
                        <div className={cn(
                            "grid min-w-0 gap-4",
                            pipelines.length > 1 && "grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))]",
                            actions.length === 0 && "[@container(min-width:920px)]:col-span-2"
                        )}>
                            {pipelines}
                        </div>
                    )}
                    {actions.length > 0 && (
                        <div className={cn(
                            "flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--border2)] bg-[var(--surface)] shadow-sm",
                            pipelines.length === 0 && "[@container(min-width:920px)]:col-span-2"
                        )}>
                            <div className="px-4 py-3.5 border-b border-[var(--border)]">
                                <h3 className="text-base font-semibold leading-snug text-[var(--text)]">Quick actions</h3>
                            </div>
                            <div className="grid flex-1 auto-rows-fr grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-3 p-4">
                                {actions.map(({ href, icon: Icon, label, sub, color, bg }) => (
                                    <Link key={label} href={href} className="flex items-center gap-3 p-3 border border-[var(--border)] rounded-[12px] hover:shadow-sm hover:border-[var(--accent)] transition-all">
                                        <div className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0" style={{ backgroundColor: bg }}>
                                            <Icon size={16} style={{ color }} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold leading-snug text-[var(--text)]">{label}</p>
                                            <p className="mt-0.5 text-xs text-[var(--text2)]">{sub}</p>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Empty state — user has no dashboard-level permissions ── */}
            {!hasAnyWidget && actions.length === 0 && (
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-10 text-center">
                    <div className="w-12 h-12 rounded-[14px] bg-[var(--accent-light)] flex items-center justify-center mx-auto mb-4">
                        <Sparkles size={22} className="text-[var(--accent-text)]" />
                    </div>
                    <h3 className="text-[16px] font-bold text-[var(--text)] mb-1.5">Welcome to {COMPANY.name}</h3>
                    <p className="text-[13px] text-[var(--text2)] mb-6 max-w-sm mx-auto">
                        Your account doesn&apos;t have any dashboard modules yet. Use the links below, or contact your admin for access.
                    </p>
                    <div className="flex items-center justify-center gap-3 flex-wrap">
                        <Link href="/profile" className="px-4 py-2 bg-[var(--accent)] text-white text-[12.5px] font-semibold rounded-[8px] hover:opacity-90 transition-all">My Profile</Link>
                        <Link href="/attendance" className="px-4 py-2 border border-[var(--border)] text-[var(--text)] text-[12.5px] font-semibold rounded-[8px] hover:border-[var(--accent)] transition-all">My Attendance</Link>
                        <Link href="/helpdesk" className="px-4 py-2 border border-[var(--border)] text-[var(--text)] text-[12.5px] font-semibold rounded-[8px] hover:border-[var(--accent)] transition-all">Help &amp; Support</Link>
                    </div>
                </div>
            )}
        </div>
    )
}
