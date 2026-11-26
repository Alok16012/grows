"use client"

import { useState } from "react"
import { AssetReceiptCard } from "@/components/assets/AssetReceiptCard"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { format } from "date-fns"
import {
    ArrowRight, ChevronRight, CalendarCheck, Wallet, ClipboardCheck, HardHat,
    UserCheck, Clock, Target, BarChart2, CalendarOff, CreditCard, Headphones, UserPlus,
    LogOut, KeyRound, MapPin, ClipboardList, CheckCircle2, User, ListChecks,
    IndianRupee, Eye, EyeOff, PartyPopper, Megaphone, CalendarHeart, AlertTriangle, type LucideIcon,
} from "lucide-react"
import { useCachedFetch } from "@/lib/useCachedFetch"
import { WorkPanels } from "@/components/dashboard/WorkPanels"

/**
 * The phone home screen. Everyone sees THEIR OWN day first — today's
 * attendance, leave left, last salary, tasks — then (if their role allows)
 * the company numbers and the queues waiting on them, and finally what is
 * coming up (holiday, birthdays, announcements).
 *
 * Own data: /api/me/home. Company data: /api/dashboard/stats, which already
 * returns only what the signed-in user may see. Desktop keeps the full dashboard.
 */

type Stats = {
    employees?: { active: number; new30d: number }
    attendanceToday?: { pct: number; present: number; absent: number; onLeave: number; expected?: number }
    approvals?: { total: number; leaves: number; expenses: number; inspections: number; hasLeaves?: boolean; hasExpenses?: boolean; hasInspections?: boolean }
    onboarding?: { inProgress: number; notStarted: number; onHold: number }
    exits?: { pending: number; clearancePending: number }
    payroll?: { pct: number; processed: number; pending: number }
    recruitment?: { activeLeads: number; newLeads30d: number; joined30d: number }
    logins?: { withLogin: number; totalEmployees: number; withoutLogin: number }
    activeAssignments?: number
    activeSites?: number
    openTickets?: number
    error?: string
}

type Me = {
    employee: { firstName: string; code: string | null; designation: string | null; site: string | null } | null
    today: { checkIn: string | null; checkOut: string | null; status: string; workingHrs: number | null } | null
    month: { present: number; leave: number; absent: number; unmarked?: number }
    leave: { total: number; items: { code: string; name: string; available: number; color: string }[] } | null
    payslip: { month: number; year: number; net: number; paid: boolean } | null
    tasks: { myOpen: number; myOverdue: number; awaitingMine: number }
    holiday: { name: string; date: string; type: string } | null
    announcements: { id: string; title: string; category: string; publishedAt: string }[]
    celebrations: { name: string; kind: "birthday" | "work"; years: number | null }[]
    error?: string
}

type Tile = { label: string; href: string; icon: LucideIcon; color: string; tint: string; perms?: string[] }

// Self-service — every employee, before anything else.
const MY_TILES: Tile[] = [
    { label: "Attendance", href: "/attendance",          icon: Clock,       color: "#0d9488", tint: "#e6fffa" },
    { label: "Leave",      href: "/leaves",              icon: CalendarOff, color: "#dd8f0d", tint: "#fff6e4" },
    { label: "Payslip",    href: "/profile?tab=payslip", icon: IndianRupee, color: "#6d4fe0", tint: "#f1edff" },
    { label: "Tasks",      href: "/tasks",               icon: ListChecks,  color: "#3d6ff5", tint: "#eaf0ff" },
]
// Office staff, in priority order.
const STAFF_TILES: Tile[] = [
    { label: "Approvals",  href: "/approvals",   icon: ClipboardCheck, color: "#dd8f0d", tint: "#fff6e4", perms: ["approvals.view"] },
    { label: "Tasks",      href: "/tasks",       icon: ListChecks,     color: "#3d6ff5", tint: "#eaf0ff" },
    { label: "Employees",  href: "/employees",   icon: UserCheck,      color: "#3d6ff5", tint: "#eaf0ff", perms: ["employees.view"] },
    { label: "Payroll",    href: "/payroll",     icon: Wallet,         color: "#6d4fe0", tint: "#f1edff", perms: ["payroll.view"] },
    { label: "Attendance", href: "/attendance", icon: Clock,      color: "#0d9488", tint: "#e6fffa", perms: ["attendance.view"] },
    { label: "Recruitment",href: "/recruitment", icon: Target,         color: "#6d4fe0", tint: "#f1edff", perms: ["recruitment.view"] },
    { label: "Reports",    href: "/reports",     icon: BarChart2,      color: "#0d9488", tint: "#e6fffa", perms: ["reports.view"] },
    { label: "Expenses",   href: "/expenses",    icon: CreditCard,     color: "#3d6ff5", tint: "#eaf0ff", perms: ["expenses.view", "expenses.approve"] },
    { label: "Helpdesk",   href: "/helpdesk",    icon: Headphones,     color: "#5b6478", tint: "#f0f2f8", perms: ["helpdesk.view"] },
]
const INSPECTOR_TILE: Tile = { label: "Inspections", href: "/inspection", icon: HardHat, color: "#3d6ff5", tint: "#eaf0ff" }
const HELP_TILE: Tile = { label: "Help", href: "/helpdesk", icon: Headphones, color: "#5b6478", tint: "#f0f2f8" }
const PROFILE_TILE: Tile = { label: "My profile", href: "/profile", icon: User, color: "#3d6ff5", tint: "#eaf0ff" }

type FocusCard = { title: string; highlight: string; sub: string; cta: string; href: string; icon: LucideIcon }

const fmt = (n: number) => n.toLocaleString("en-IN")
const time = (s: string | null) => s ? new Date(s).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : ""
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const card: React.CSSProperties = { background: "var(--surface)", borderRadius: 18, boxShadow: "var(--shadow-card)", textDecoration: "none" }

export function MobileHome() {
    const { data: session } = useSession()
    const { data: stats, loading } = useCachedFetch<Stats>("/api/dashboard/stats")
    const { data: meData, loading: loadingMe } = useCachedFetch<Me>("/api/me/home")
    const [showPay, setShowPay] = useState(false)

    const role = String((session?.user as any)?.role ?? "")
    const perms: string[] = (session?.user as any)?.permissions ?? []
    const allowed = (t: Tile) => role === "ADMIN" || !t.perms || t.perms.some(p => perms.includes(p))
    const isInspector = role === "INSPECTION_BOY"
        || (role !== "ADMIN" && perms.some(p => p.startsWith("inspection.")) && !perms.includes("employees.view"))

    const me: Me | null = meData && !meData.error ? meData : null
    const emp = me?.employee ?? null
    const firstName = emp?.firstName || session?.user?.name?.trim().split(/\s+/)[0]
    const hour = new Date().getHours()
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
    const s: Stats = stats && !stats.error ? stats : {}

    // Put the first available action in view. Company metrics stay available below.
    const focusCards: FocusCard[] = []
    if (isInspector) focusCards.push({
        title: "Your inspections",
        highlight: typeof s.activeAssignments === "number" ? fmt(s.activeAssignments) + " active" : "My assignments",
        sub: "Review scheduled work and continue an inspection.",
        cta: "Open assignments", href: "/inspection", icon: HardHat,
    })
    if (s.approvals && s.approvals.total > 0) focusCards.push({
        title: "Approvals",
        highlight: fmt(s.approvals.total) + " pending",
        sub: [
            s.approvals.hasLeaves ? s.approvals.leaves + " leaves" : null,
            s.approvals.hasExpenses ? s.approvals.expenses + " expenses" : null,
            s.approvals.hasInspections ? s.approvals.inspections + " inspections" : null,
        ].filter(Boolean).join(" · ") || "Requests are ready for review.",
        cta: "Review approvals", href: "/approvals", icon: ClipboardCheck,
    })
    if (s.attendanceToday) {
        const a = s.attendanceToday
        focusCards.push({
            title: "Today's attendance",
            highlight: fmt(a.present) + " present",
            sub: fmt(a.absent) + " absent · " + fmt(a.onLeave) + " on leave",
            cta: "View attendance", href: "/attendance", icon: CalendarCheck,
        })
    }
    if (s.payroll) focusCards.push({
        title: "Payroll",
        highlight: s.payroll.pct + "% processed",
        sub: fmt(s.payroll.pending) + " pending this month",
        cta: "Open payroll", href: "/payroll", icon: Wallet,
    })
    const primary = focusCards[0]

    // ── Tiles: own things first, then the staff screens this role may open (max 8) ──
    const tiles: Tile[] = []
    const add = (t: Tile) => { if (allowed(t) && !tiles.some(x => x.href === t.href) && tiles.length < 8) tiles.push(t) }
    if (emp) MY_TILES.forEach(add)
    if (isInspector) add(INSPECTOR_TILE)
    STAFF_TILES.forEach(add)
    if (emp) { add(PROFILE_TILE); add(HELP_TILE) }

    // ── Company "today" strip ──
    const today: { label: string; value: string; sub?: string; href: string; icon: LucideIcon; color: string; tint: string }[] = []
    if (s.employees) today.push({ label: "Active employees", value: fmt(s.employees.active ?? 0), sub: s.employees.new30d > 0 ? `+${s.employees.new30d} in 30 days` : undefined, href: "/employees", icon: UserCheck, color: "#3d6ff5", tint: "#eaf0ff" })
    if (s.attendanceToday) today.push({ label: "Present today", value: fmt(s.attendanceToday.present), sub: s.attendanceToday.expected ? `of ${fmt(s.attendanceToday.expected)} expected` : `${s.attendanceToday.pct}% attendance`, href: "/attendance", icon: CalendarCheck, color: "#15803d", tint: "#dcfce7" })
    if (s.approvals) today.push({ label: "Pending approvals", value: fmt(s.approvals.total), href: "/approvals", icon: ClipboardCheck, color: "#dd8f0d", tint: "#fff6e4" })
    if (s.payroll) today.push({ label: "Payroll processed", value: s.payroll.pct + "%", sub: fmt(s.payroll.pending) + " pending", href: "/payroll", icon: Wallet, color: "#2f5be0", tint: "#eaf0ff" })
    if (s.recruitment) today.push({ label: "Active candidates", value: fmt(s.recruitment.activeLeads), sub: `${s.recruitment.joined30d} joined in 30 days`, href: "/recruitment", icon: Target, color: "#6d4fe0", tint: "#f1edff" })
    if (s.activeAssignments !== undefined) today.push({ label: "Active assignments", value: fmt(s.activeAssignments), href: isInspector ? "/inspection" : "/assignments", icon: ClipboardList, color: "#0d9488", tint: "#e6fffa" })
    if (s.activeSites !== undefined) today.push({ label: "Active sites", value: fmt(s.activeSites), href: "/sites", icon: MapPin, color: "#0891b2", tint: "#ecfeff" })
    if (s.openTickets !== undefined) today.push({ label: "Open tickets", value: fmt(s.openTickets), href: "/helpdesk", icon: Headphones, color: "#5b6478", tint: "#f0f2f8" })

    // ── Needs attention: own tasks first, then the queues this role owns ──
    type Tone = "warn" | "info" | "danger"
    const attention: { title: string; sub: string; value: string; tone: Tone; href: string; icon: LucideIcon; color: string; tint: string }[] = []
    const t = me?.tasks
    if (t && t.myOverdue > 0) attention.push({ title: "Overdue tasks", sub: `${t.myOpen} open in total`, value: `${fmt(t.myOverdue)} overdue`, tone: "danger", href: "/tasks", icon: AlertTriangle, color: "#dc2626", tint: "#fef2f2" })
    else if (t && t.myOpen > 0) attention.push({ title: "My tasks", sub: "Given to you", value: `${fmt(t.myOpen)} open`, tone: "info", href: "/tasks", icon: ListChecks, color: "#3d6ff5", tint: "#eaf0ff" })
    if (t && t.awaitingMine > 0) attention.push({ title: "Tasks to approve", sub: "Marked done, waiting for you", value: `${fmt(t.awaitingMine)} waiting`, tone: "warn", href: "/tasks?view=byme", icon: CheckCircle2, color: "#dd8f0d", tint: "#fff6e4" })
    if (s.approvals && s.approvals.total > 0) attention.push({ title: "Approvals", sub: "Leaves, expenses and inspections", value: `${fmt(s.approvals.total)} waiting`, tone: "warn", href: "/approvals", icon: ClipboardCheck, color: "#dd8f0d", tint: "#fff6e4" })
    if (s.onboarding && s.onboarding.inProgress > 0) attention.push({ title: "Onboarding", sub: `${s.onboarding.notStarted} yet to start · ${s.onboarding.onHold} on hold`, value: `${fmt(s.onboarding.inProgress)} in progress`, tone: "info", href: "/onboarding", icon: UserPlus, color: "#3d6ff5", tint: "#eaf0ff" })
    if (s.payroll && s.payroll.pending > 0) attention.push({ title: `Payroll · ${format(new Date(), "MMM yyyy")}`, sub: `${fmt(s.payroll.processed)} processed`, value: `${fmt(s.payroll.pending)} pending`, tone: "warn", href: "/payroll", icon: Wallet, color: "#6d4fe0", tint: "#f1edff" })
    if (s.exits && s.exits.pending > 0) attention.push({ title: "Exits", sub: `${s.exits.clearancePending} clearances pending`, value: `${fmt(s.exits.pending)} open`, tone: "danger", href: "/exit", icon: LogOut, color: "#dc2626", tint: "#fef2f2" })
    if (s.logins && s.logins.withoutLogin > 0) attention.push({ title: "Employee logins", sub: `${fmt(s.logins.withLogin)} of ${fmt(s.logins.totalEmployees)} set up`, value: `${fmt(s.logins.withoutLogin)} without login`, tone: "info", href: "/admin/employee-logins", icon: KeyRound, color: "#3d6ff5", tint: "#eaf0ff" })

    const hasCompany = today.length > 0
    const loadingHome = (loading && !stats) || (loadingMe && !meData)

    return (
        <div className="flex min-w-0 flex-col gap-6 px-4 pb-6 pt-5 sm:px-6">
            <header className="min-w-0">
                <p className="text-sm font-medium text-[var(--text2)]">{format(new Date(), "EEEE, d MMMM")}</p>
                <h1 className="mt-1 break-words text-[clamp(1.45rem,6vw,1.95rem)] font-bold leading-tight text-[var(--text)]">
                    {greeting}{firstName ? ", " + firstName : ""}
                </h1>
                {emp && (emp.designation || emp.site || emp.code) && (
                    <p className="mt-1 break-words text-sm text-[var(--text2)]">
                        {[emp.designation, emp.site, emp.code].filter(Boolean).join(" · ")}
                    </p>
                )}
            </header>

            {/* Issued assets waiting for Received / Not received (blinks). */}
            <AssetReceiptCard />

            {emp && me ? <MyDayCard me={me} /> : loadingHome ? (
                <div className="h-40 animate-pulse rounded-2xl bg-[var(--accent-light)]" role="status">
                    <span className="sr-only">Loading your dashboard</span>
                </div>
            ) : primary && <PrimaryCard {...primary} />}

            {tiles.length > 0 && (
                <section aria-labelledby="mobile-quick-links">
                    <SectionHead id="mobile-quick-links" title="Quick links" />
                    <div className="grid grid-cols-4 gap-x-1.5 gap-y-2 rounded-2xl border bg-[var(--surface)] p-2 shadow-sm sm:gap-x-3 sm:p-3">
                        {tiles.map(({ href, label, icon: Icon, color, tint }) => (
                            <Link key={href} href={href} className="flex min-w-0 flex-col items-center gap-2 rounded-xl px-0.5 py-2.5 text-center transition-colors hover:bg-[var(--surface2)]">
                                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: tint }}>
                                    <Icon size={20} color={color} strokeWidth={2} aria-hidden="true" />
                                </span>
                                <span className="max-w-full break-words text-[11px] font-semibold leading-tight text-[var(--text)] min-[380px]:text-xs">
                                    {label}
                                </span>
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            {/* My summary — leave left, last salary (hidden until tapped), this month. */}
            {emp && me && (
                <section>
                    <SectionHead title="My summary" />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <Link href="/leaves" style={{ ...card, padding: 14, display: "block" }}>
                            <Mini icon={CalendarOff} color="#dd8f0d" tint="#fff6e4" label="Leave left" />
                            <p style={big}>{me.leave ? `${fmt(me.leave.total)} day${me.leave.total === 1 ? "" : "s"}` : "—"}</p>
                            <p style={small}>{me.leave?.items.slice(0, 3).map(i => `${i.code} ${i.available}`).join(" · ") || "No leave types set"}</p>
                        </Link>
                        <div style={{ ...card, padding: 14 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                <Mini icon={IndianRupee} color="#6d4fe0" tint="#f1edff" label="Last salary" />
                                {me.payslip && <button type="button" onClick={() => setShowPay(v => !v)} aria-label={showPay ? "Hide salary" : "Show salary"} style={{ border: "none", background: "none", width: 36, height: 36, display: "grid", placeItems: "center", cursor: "pointer", color: "var(--text2)", flexShrink: 0 }}>{showPay ? <EyeOff size={16} /> : <Eye size={16} />}</button>}
                            </div>
                            <Link href="/profile?tab=payslip" style={{ textDecoration: "none" }}>
                                <p style={big}>{me.payslip ? (showPay ? `₹${fmt(Math.round(me.payslip.net))}` : "₹ • • • • •") : "—"}</p>
                                <p style={small}>{me.payslip ? `${MONTHS[me.payslip.month - 1]} ${me.payslip.year} · ${me.payslip.paid ? "paid" : "view payslip"}` : "No payslip sent yet"}</p>
                            </Link>
                        </div>
                        <Link href="/attendance" style={{ ...card, padding: 14, display: "block" }}>
                            <Mini icon={CalendarCheck} color="#15803d" tint="#dcfce7" label="This month" />
                            <p style={big}>{fmt(me.month.present)} present</p>
                            <p style={small}>{me.month.leave} leave · {me.month.absent} absent{me.month.unmarked ? ` · ${me.month.unmarked} not marked` : ""}</p>
                        </Link>
                        <Link href="/tasks" style={{ ...card, padding: 14, display: "block" }}>
                            <Mini icon={ListChecks} color={me.tasks.myOverdue ? "#dc2626" : "#3d6ff5"} tint={me.tasks.myOverdue ? "#fef2f2" : "#eaf0ff"} label="My tasks" />
                            <p style={big}>{fmt(me.tasks.myOpen)} open</p>
                            <p style={{ ...small, color: me.tasks.myOverdue ? "#dc2626" : small.color, fontWeight: me.tasks.myOverdue ? 600 : 400 }}>{me.tasks.myOverdue ? `${me.tasks.myOverdue} overdue` : "Nothing overdue"}</p>
                        </Link>
                    </div>
                </section>
            )}

            {/* The profile's own work (recruiter, payroll, inspector …) */}
            <WorkPanels compact />

            {/* Needs attention */}
            {(attention.length > 0 || (!loadingHome && (me || (stats && !stats.error)))) && (
                <section>
                    <SectionHead title="Needs attention" />
                    {attention.length === 0 ? (
                        <div style={{ ...card, padding: 18, display: "flex", alignItems: "center", gap: 14 }}>
                            <span style={{ width: 44, height: 44, borderRadius: 14, background: "var(--success-light)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <CheckCircle2 size={22} color="var(--success)" aria-hidden="true" />
                            </span>
                            <div>
                                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--text)" }}>All caught up</p>
                                <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--text2)" }}>Nothing is waiting on you right now.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-2xl border bg-[var(--surface)] shadow-sm">{attention.map(a => <AttentionRow key={a.title} {...a} />)}</div>
                    )}
                </section>
            )}

            {/* Company today — staff only. */}
            {hasCompany && (
                <section>
                    <SectionHead title="Company overview" />
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {today.map(c => {
                            const Icon = c.icon
                            return (
                                <Link key={c.label} href={c.href} style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 10 }} className="min-w-0">
                                    <span style={{ width: 36, height: 36, borderRadius: 11, background: c.tint, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={18} color={c.color} aria-hidden="true" /></span>
                                    <div>
                                        <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>{c.value}</p>
                                        <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--text2)", lineHeight: 1.3 }}>{c.label}</p>
                                        {c.sub && <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text3)", lineHeight: 1.3 }}>{c.sub}</p>}
                                    </div>
                                </Link>
                            )
                        })}
                    </div>
                </section>
            )}

            {/* Coming up — holiday, birthdays & anniversaries, announcements. */}
            {me && (me.holiday || me.celebrations.length > 0 || me.announcements.length > 0) && (
                <section>
                    <SectionHead title="Coming up" />
                    <div style={{ ...card, padding: "4px 14px" }}>
                        {me.holiday && (
                            <Row href="/leaves" icon={CalendarHeart} color="#db2777" tint="#fdf2f8"
                                title={me.holiday.name}
                                sub={`${format(new Date(me.holiday.date), "EEE, d MMM")} · ${daysAway(me.holiday.date)}`} />
                        )}
                        {me.celebrations.length > 0 && (
                            <Row icon={PartyPopper} color="#dd8f0d" tint="#fff6e4"
                                title={celebrationTitle(me.celebrations)}
                                sub={me.celebrations.slice(0, 4).map(c => c.kind === "birthday" ? `🎂 ${c.name}` : `🎉 ${c.name} (${c.years} yr)`).join(" · ") + (me.celebrations.length > 4 ? ` +${me.celebrations.length - 4} more` : "")} />
                        )}
                        {me.announcements.slice(0, 2).map(a => (
                            <Row key={a.id} href="/announcements" icon={Megaphone} color={a.category === "URGENT" ? "#dc2626" : "#3d6ff5"} tint={a.category === "URGENT" ? "#fef2f2" : "#eaf0ff"}
                                title={a.title} sub={`${a.category.charAt(0) + a.category.slice(1).toLowerCase()} · ${format(new Date(a.publishedAt), "d MMM")}`} />
                        ))}
                    </div>
                </section>
            )}

            {!loadingHome && (!stats || stats.error) && !me && (
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--text3)", textAlign: "center" }}>
                    Couldn&apos;t load today&apos;s numbers. <button type="button" onClick={() => window.location.reload()} style={{ border: "none", background: "none", color: "var(--accent)", fontWeight: 600, cursor: "pointer", padding: 0 }}>Try again</button>
                </p>
            )}
        </div>
    )
}

const big: React.CSSProperties = { margin: "10px 0 0", fontSize: 19, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.15 }
const small: React.CSSProperties = { margin: "3px 0 0", fontSize: 12, color: "var(--text2)", lineHeight: 1.4 }

function daysAway(d: string) {
    const ist = (x: Date) => { const t = new Date(x.getTime() + 330 * 60_000); return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) }
    const n = Math.round((ist(new Date(d)) - ist(new Date())) / 86_400_000)
    return n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`
}
function celebrationTitle(c: Me["celebrations"]) {
    const b = c.filter(x => x.kind === "birthday").length, w = c.length - b
    return [b ? `${b} birthday${b === 1 ? "" : "s"}` : null, w ? `${w} work anniversar${w === 1 ? "y" : "ies"}` : null].filter(Boolean).join(" & ") + " today"
}

function Mini({ icon: Icon, color, tint, label }: { icon: LucideIcon; color: string; tint: string; label: string }) {
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, background: tint, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={16} color={color} aria-hidden="true" /></span>
            <span style={{ fontSize: 12, color: "var(--text2)", fontWeight: 500 }}>{label}</span>
        </span>
    )
}

function Row({ href, icon: Icon, color, tint, title, sub }: { href?: string; icon: LucideIcon; color: string; tint: string; title: string; sub: string }) {
    const inner = (
        <>
            <span style={{ width: 38, height: 38, borderRadius: 12, background: tint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={19} color={color} aria-hidden="true" /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
                <span style={{ display: "block", fontSize: 12, color: "var(--text2)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</span>
            </span>
            {href && <ChevronRight size={17} color="var(--text3)" aria-hidden="true" />}
        </>
    )
    const st: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: "11px 0", textDecoration: "none" }
    return href ? <Link href={href} style={st} className="border-b border-[var(--border)] last:border-b-0">{inner}</Link> : <div style={st} className="border-b border-[var(--border)] last:border-b-0">{inner}</div>
}

// Today's attendance for the signed-in employee, with the next step as the button.
function MyDayCard({ me }: { me: Me }) {
    const d = me.today
    const onLeave = d && /LEAVE/.test(d.status)
    const state = !d ? "none" : onLeave ? "leave" : d.checkIn && !d.checkOut ? "in" : d.checkIn || d.status === "PRESENT" ? "done" : d.status === "ABSENT" ? "absent" : "none"
    const view = {
        none:   { highlight: "Not marked yet", sub: "Mark your attendance for today", cta: "Mark attendance" },
        in:     { highlight: `In since ${time(d?.checkIn ?? null)}`, sub: "Don't forget to check out when you leave", cta: "Check out" },
        done:   { highlight: "Present", sub: d?.checkIn ? `${time(d.checkIn)}${d.checkOut ? ` – ${time(d.checkOut)}` : ""}${d.workingHrs ? ` · ${Number(d.workingHrs).toFixed(1)} h` : ""}` : "Marked present", cta: "View attendance" },
        leave:  { highlight: "On leave", sub: "Enjoy your day off", cta: "View leave" },
        absent: { highlight: "Marked absent", sub: "Think this is wrong? Raise it with HR", cta: "View attendance" },
    }[state]
    return <PrimaryCard title="Today’s attendance" highlight={view.highlight} sub={view.sub} cta={view.cta} href={state === "leave" ? "/leaves" : "/attendance"} icon={state === "done" ? CheckCircle2 : CalendarCheck} />
}

function PrimaryCard({ title, highlight, sub, cta, href, icon: Icon }: FocusCard) {
    return (
        <section className="rounded-2xl bg-[#102653] p-4 text-white shadow-[0_8px_24px_rgba(16,38,83,0.18)] sm:p-5">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-sm font-medium text-blue-100">{title}</h2>
                    <p className="mt-1.5 break-words text-[clamp(1.25rem,5.5vw,1.65rem)] font-bold leading-tight tracking-tight">{highlight}</p>
                </div>
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/20 bg-white/10 text-blue-100">
                    <Icon size={21} aria-hidden="true" />
                </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-blue-100">{sub}</p>
            <Link href={href} className="mt-4 inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-[#102653] transition-colors hover:bg-blue-50">
                {cta} <ArrowRight size={16} className="shrink-0" aria-hidden="true" />
            </Link>
        </section>
    )
}

function SectionHead({ title, id }: { title: string; id?: string }) {
    return <h2 id={id} className="mb-2.5 text-lg font-bold tracking-tight text-[var(--text)]">{title}</h2>
}

const TONES = { warn: "#93540a", info: "#2f5be0", danger: "#b91c1c" }

function AttentionRow({ title, sub, value, tone, href, icon: Icon, color, tint }: {
    title: string; sub: string; value: string; tone: keyof typeof TONES
    href: string; icon: LucideIcon; color: string; tint: string
}) {
    return (
        <Link href={href} className="flex min-h-[72px] min-w-0 items-center gap-3 border-b px-3 py-3 transition-colors last:border-b-0 hover:bg-[var(--surface2)] sm:px-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: tint }}>
                <Icon size={19} color={color} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-semibold text-[var(--text)]">{title}</span>
                <span className="mt-0.5 block break-words text-xs leading-5 text-[var(--text2)]">{sub}</span>
            </span>
            <span className="max-w-[30%] break-words text-right text-xs font-semibold" style={{ color: TONES[tone] }}>{value}</span>
            <ChevronRight size={16} className="shrink-0 text-[var(--text2)]" aria-hidden="true" />
        </Link>
    )
}
