"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { format } from "date-fns"
import {
    ArrowRight, ChevronRight, CalendarCheck, Wallet, ClipboardCheck, HardHat,
    UserCheck, Clock, Target, BarChart2, CalendarOff, CreditCard, Headphones, UserPlus,
    LogOut, KeyRound, MapPin, ClipboardList, CheckCircle2, User, Sparkles, ListChecks,
    IndianRupee, Eye, EyeOff, PartyPopper, Megaphone, CalendarHeart, AlertTriangle, type LucideIcon,
} from "lucide-react"
import { useCachedFetch } from "@/lib/useCachedFetch"

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
    month: { present: number; leave: number; absent: number }
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
    { label: "Payslip",    href: "/profile?tab=payslip", icon: IndianRupee, color: "#7c3aed", tint: "#f5f3ff" },
    { label: "Tasks",      href: "/tasks",               icon: ListChecks,  color: "#0b5cff", tint: "#e8effe" },
]
// Office staff, in priority order.
const STAFF_TILES: Tile[] = [
    { label: "Approvals",  href: "/approvals",   icon: ClipboardCheck, color: "#dd8f0d", tint: "#fff6e4", perms: ["approvals.view"] },
    { label: "Tasks",      href: "/tasks",       icon: ListChecks,     color: "#0b5cff", tint: "#e8effe" },
    { label: "Employees",  href: "/employees",   icon: UserCheck,      color: "#0b5cff", tint: "#e8effe", perms: ["employees.view"] },
    { label: "Payroll",    href: "/payroll",     icon: Wallet,         color: "#7c3aed", tint: "#f5f3ff", perms: ["payroll.view"] },
    { label: "Attendance", href: "/attendance", icon: Clock,      color: "#0d9488", tint: "#e6fffa", perms: ["attendance.view"] },
    { label: "Recruitment",href: "/recruitment", icon: Target,         color: "#7c3aed", tint: "#f5f3ff", perms: ["recruitment.view"] },
    { label: "Reports",    href: "/reports",     icon: BarChart2,      color: "#0d9488", tint: "#e6fffa", perms: ["reports.view"] },
    { label: "Expenses",   href: "/expenses",    icon: CreditCard,     color: "#0b5cff", tint: "#e8effe", perms: ["expenses.view", "expenses.approve"] },
    { label: "Helpdesk",   href: "/helpdesk",    icon: Headphones,     color: "#5b6478", tint: "#f0f2f8", perms: ["helpdesk.view"] },
]
const INSPECTOR_TILE: Tile = { label: "Inspections", href: "/inspection", icon: HardHat, color: "#0b5cff", tint: "#e8effe" }
const HELP_TILE: Tile = { label: "Help", href: "/helpdesk", icon: Headphones, color: "#5b6478", tint: "#f0f2f8" }
const PROFILE_TILE: Tile = { label: "My profile", href: "/profile", icon: User, color: "#0b5cff", tint: "#e8effe" }

type Slide = { pill: string; title: string; highlight: string; sub: string; cta: string; href: string; icon: LucideIcon }

const fmt = (n: number) => n.toLocaleString("en-IN")
const time = (s: string | null) => s ? new Date(s).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : ""
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const card: React.CSSProperties = { background: "var(--surface)", borderRadius: 18, boxShadow: "var(--shadow-card)", textDecoration: "none" }

export function MobileHome() {
    const { data: session } = useSession()
    const { data: stats, loading } = useCachedFetch<Stats>("/api/dashboard/stats")
    const { data: meData } = useCachedFetch<Me>("/api/me/home")
    const [slide, setSlide] = useState(0)
    const [showPay, setShowPay] = useState(false)
    const railRef = useRef<HTMLDivElement>(null)

    const role = String((session?.user as any)?.role ?? "")
    const perms: string[] = (session?.user as any)?.permissions ?? []
    const allowed = (t: Tile) => role === "ADMIN" || !t.perms || t.perms.some(p => perms.includes(p))
    const isInspector = role === "INSPECTION_BOY"
        || (role !== "ADMIN" && perms.some(p => p.startsWith("inspection.")) && !perms.includes("employees.view"))

    const me: Me | null = meData && !meData.error ? meData : null
    const emp = me?.employee ?? null
    const firstName = emp?.firstName || (session?.user?.name || "there").split(" ")[0]
    const hour = new Date().getHours()
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
    const s: Stats = stats && !stats.error ? stats : {}

    // ── Company hero slides (people without their own employee record, e.g. Admin) ──
    const slides: Slide[] = []
    if (isInspector) slides.push({ pill: "Today", title: "Your inspections", highlight: `${s.activeAssignments ?? 0} active`, sub: "Open your assignments and start the next part", cta: "My Assignments", href: "/inspection", icon: HardHat })
    if (s.attendanceToday) {
        const a = s.attendanceToday
        slides.push({
            pill: format(new Date(), "EEE, d MMM"), title: "Today's attendance",
            highlight: a.pct > 0 || !a.expected ? `${a.pct}% present` : `${fmt(a.present)} of ${fmt(a.expected)} in`,
            sub: `Present ${fmt(a.present)} · Absent ${fmt(a.absent)} · Leave ${fmt(a.onLeave)}`, cta: "View Attendance", href: "/attendance", icon: CalendarCheck,
        })
    }
    if (s.approvals && s.approvals.total > 0) slides.push({
        pill: "Action needed", title: "Approvals waiting", highlight: `${fmt(s.approvals.total)} pending`,
        sub: [s.approvals.hasLeaves ? `${s.approvals.leaves} leaves` : null, s.approvals.hasExpenses ? `${s.approvals.expenses} expenses` : null, s.approvals.hasInspections ? `${s.approvals.inspections} inspections` : null].filter(Boolean).join(" · ") || "Review and approve",
        cta: "Review Now", href: "/approvals", icon: ClipboardCheck,
    })
    if (s.payroll) slides.push({ pill: format(new Date(), "MMMM yyyy"), title: "Payroll", highlight: `${s.payroll.pct}% processed`, sub: `Processed ${fmt(s.payroll.processed)} · Pending ${fmt(s.payroll.pending)}`, cta: "Open Payroll", href: "/payroll", icon: Wallet })
    if (slides.length === 0) slides.push({ pill: format(new Date(), "EEE, d MMM"), title: "Welcome back", highlight: firstName, sub: "Everything you need is one tap away", cta: "My Profile", href: "/profile", icon: Sparkles })
    const heroSlides = slides.slice(0, 3)

    // ── Tiles: own things first, then the staff screens this role may open (max 8) ──
    const tiles: Tile[] = []
    const add = (t: Tile) => { if (allowed(t) && !tiles.some(x => x.href === t.href) && tiles.length < 8) tiles.push(t) }
    if (emp) MY_TILES.forEach(add)
    if (isInspector) add(INSPECTOR_TILE)
    STAFF_TILES.forEach(add)
    if (emp) { add(PROFILE_TILE); add(HELP_TILE) }

    // ── Company "today" strip ──
    const today: { label: string; value: string; sub?: string; href: string; icon: LucideIcon; color: string; tint: string }[] = []
    if (s.employees) today.push({ label: "Active employees", value: fmt(s.employees.active ?? 0), sub: s.employees.new30d > 0 ? `+${s.employees.new30d} in 30 days` : undefined, href: "/employees", icon: UserCheck, color: "#0b5cff", tint: "#e8effe" })
    if (s.attendanceToday) today.push({ label: "Present today", value: fmt(s.attendanceToday.present), sub: s.attendanceToday.expected ? `of ${fmt(s.attendanceToday.expected)} expected` : `${s.attendanceToday.pct}% attendance`, href: "/attendance", icon: CalendarCheck, color: "#15803d", tint: "#dcfce7" })
    if (s.approvals) today.push({ label: "Pending approvals", value: fmt(s.approvals.total), href: "/approvals", icon: ClipboardCheck, color: "#dd8f0d", tint: "#fff6e4" })
    if (s.recruitment) today.push({ label: "Active candidates", value: fmt(s.recruitment.activeLeads), sub: `${s.recruitment.joined30d} joined in 30 days`, href: "/recruitment", icon: Target, color: "#7c3aed", tint: "#f5f3ff" })
    if (s.activeAssignments !== undefined) today.push({ label: "Active assignments", value: fmt(s.activeAssignments), href: isInspector ? "/inspection" : "/assignments", icon: ClipboardList, color: "#0d9488", tint: "#e6fffa" })
    if (s.activeSites !== undefined) today.push({ label: "Active sites", value: fmt(s.activeSites), href: "/sites", icon: MapPin, color: "#0891b2", tint: "#ecfeff" })
    if (s.openTickets !== undefined) today.push({ label: "Open tickets", value: fmt(s.openTickets), href: "/helpdesk", icon: Headphones, color: "#5b6478", tint: "#f0f2f8" })

    // ── Needs attention: own tasks first, then the queues this role owns ──
    type Tone = "warn" | "info" | "danger"
    const attention: { title: string; sub: string; value: string; status: string; tone: Tone; href: string; cta: string; icon: LucideIcon; color: string; tint: string }[] = []
    const t = me?.tasks
    if (t && t.myOverdue > 0) attention.push({ title: "Overdue tasks", sub: `${t.myOpen} open in total`, value: `${fmt(t.myOverdue)} overdue`, status: "Overdue", tone: "danger", href: "/tasks", cta: "Open", icon: AlertTriangle, color: "#dc2626", tint: "#fef2f2" })
    else if (t && t.myOpen > 0) attention.push({ title: "My tasks", sub: "Given to you", value: `${fmt(t.myOpen)} open`, status: "Open", tone: "info", href: "/tasks", cta: "Open", icon: ListChecks, color: "#0b5cff", tint: "#e8effe" })
    if (t && t.awaitingMine > 0) attention.push({ title: "Tasks to approve", sub: "Marked done, waiting for you", value: `${fmt(t.awaitingMine)} waiting`, status: "Approve", tone: "warn", href: "/tasks?view=byme", cta: "Review", icon: CheckCircle2, color: "#dd8f0d", tint: "#fff6e4" })
    if (s.approvals && s.approvals.total > 0) attention.push({ title: "Approvals", sub: "Leaves, expenses and inspections", value: `${fmt(s.approvals.total)} waiting`, status: "Pending", tone: "warn", href: "/approvals", cta: "Review", icon: ClipboardCheck, color: "#dd8f0d", tint: "#fff6e4" })
    if (s.onboarding && s.onboarding.inProgress > 0) attention.push({ title: "Onboarding", sub: `${s.onboarding.notStarted} yet to start · ${s.onboarding.onHold} on hold`, value: `${fmt(s.onboarding.inProgress)} in progress`, status: "In Progress", tone: "info", href: "/onboarding", cta: "View", icon: UserPlus, color: "#0b5cff", tint: "#e8effe" })
    if (s.payroll && s.payroll.pending > 0) attention.push({ title: `Payroll · ${format(new Date(), "MMM yyyy")}`, sub: `${fmt(s.payroll.processed)} processed`, value: `${fmt(s.payroll.pending)} pending`, status: "Pending", tone: "warn", href: "/payroll", cta: "Continue", icon: Wallet, color: "#7c3aed", tint: "#f5f3ff" })
    if (s.exits && s.exits.pending > 0) attention.push({ title: "Exits", sub: `${s.exits.clearancePending} clearances pending`, value: `${fmt(s.exits.pending)} open`, status: "Open", tone: "danger", href: "/exit", cta: "View", icon: LogOut, color: "#dc2626", tint: "#fef2f2" })
    if (s.logins && s.logins.withoutLogin > 0) attention.push({ title: "Employee logins", sub: `${fmt(s.logins.withLogin)} of ${fmt(s.logins.totalEmployees)} set up`, value: `${fmt(s.logins.withoutLogin)} without login`, status: "Action", tone: "info", href: "/admin/employee-logins", cta: "Manage", icon: KeyRound, color: "#0b5cff", tint: "#e8effe" })

    const onRailScroll = () => { const el = railRef.current; if (el) setSlide(Math.round(el.scrollLeft / el.clientWidth)) }
    const hasCompany = today.length > 0

    return (
        <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: 20, padding: "4px 16px 8px" }}>
            {/* Greeting + who I am */}
            <div>
                <p style={{ margin: 0, fontSize: 13, color: "var(--text2)" }}>{greeting},</p>
                <p style={{ margin: "1px 0 0", fontSize: 22, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>{firstName} 👋</p>
                {emp && (emp.designation || emp.site || emp.code) && <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--text3)" }}>{[emp.designation, emp.site, emp.code].filter(Boolean).join(" · ")}</p>}
            </div>

            {/* My day — attendance today, the first thing an employee checks. */}
            {emp ? <MyDayCard me={me!} /> : (
                <div>
                    <div ref={railRef} onScroll={onRailScroll} className="no-scrollbar" style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", borderRadius: 22, scrollbarWidth: "none" }}>
                        {(loading && !stats ? [null] : heroSlides).map((h, i) => (
                            <div key={i} style={{ flex: "0 0 100%", scrollSnapAlign: "start" }}>
                                {h ? <HeroCard {...h} /> : <div style={{ height: 196, borderRadius: 22, background: "var(--accent-light)" }} className="skeleton-pulse" />}
                            </div>
                        ))}
                    </div>
                    {heroSlides.length > 1 && (
                        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 10 }}>
                            {heroSlides.map((_, i) => <span key={i} style={{ height: 6, width: i === slide ? 22 : 6, borderRadius: 99, background: i === slide ? "var(--accent)" : "#c7d3f0", transition: "all 0.2s" }} />)}
                        </div>
                    )}
                </div>
            )}

            {/* Quick actions — up to two rows of four. */}
            {tiles.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "14px 12px" }}>
                    {tiles.map(tl => {
                        const Icon = tl.icon
                        return (
                            <Link key={tl.href + tl.label} href={tl.href} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, textDecoration: "none" }}>
                                <span style={{ width: "100%", aspectRatio: "1 / 1", maxWidth: 64, borderRadius: 18, background: "var(--surface)", boxShadow: "var(--shadow-card)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <span style={{ width: 38, height: 38, borderRadius: 12, background: tl.tint, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <Icon size={21} color={tl.color} strokeWidth={2.2} aria-hidden="true" />
                                    </span>
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text)", textAlign: "center", lineHeight: 1.2 }}>{tl.label}</span>
                            </Link>
                        )
                    })}
                </div>
            )}

            {/* My summary — leave left, last salary (hidden until tapped), this month. */}
            {emp && me && (
                <section>
                    <SectionHead kicker="Your numbers" title="My summary" />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <Link href="/leaves" style={{ ...card, padding: 14, display: "block" }}>
                            <Mini icon={CalendarOff} color="#dd8f0d" tint="#fff6e4" label="Leave left" />
                            <p style={big}>{me.leave ? `${fmt(me.leave.total)} day${me.leave.total === 1 ? "" : "s"}` : "—"}</p>
                            <p style={small}>{me.leave?.items.slice(0, 3).map(i => `${i.code} ${i.available}`).join(" · ") || "No leave types set"}</p>
                        </Link>
                        <div style={{ ...card, padding: 14 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                <Mini icon={IndianRupee} color="#7c3aed" tint="#f5f3ff" label="Last salary" />
                                {me.payslip && <button type="button" onClick={() => setShowPay(v => !v)} aria-label={showPay ? "Hide salary" : "Show salary"} style={{ border: "none", background: "none", padding: 2, cursor: "pointer", color: "var(--text3)" }}>{showPay ? <EyeOff size={16} /> : <Eye size={16} />}</button>}
                            </div>
                            <Link href="/profile?tab=payslip" style={{ textDecoration: "none" }}>
                                <p style={big}>{me.payslip ? (showPay ? `₹${fmt(Math.round(me.payslip.net))}` : "₹ • • • • •") : "—"}</p>
                                <p style={small}>{me.payslip ? `${MONTHS[me.payslip.month - 1]} ${me.payslip.year} · ${me.payslip.paid ? "paid" : "view payslip"}` : "No payslip sent yet"}</p>
                            </Link>
                        </div>
                        <Link href="/attendance" style={{ ...card, padding: 14, display: "block" }}>
                            <Mini icon={CalendarCheck} color="#15803d" tint="#dcfce7" label="This month" />
                            <p style={big}>{fmt(me.month.present)} present</p>
                            <p style={small}>{me.month.leave} leave · {me.month.absent} absent</p>
                        </Link>
                        <Link href="/tasks" style={{ ...card, padding: 14, display: "block" }}>
                            <Mini icon={ListChecks} color={me.tasks.myOverdue ? "#dc2626" : "#0b5cff"} tint={me.tasks.myOverdue ? "#fef2f2" : "#e8effe"} label="My tasks" />
                            <p style={big}>{fmt(me.tasks.myOpen)} open</p>
                            <p style={{ ...small, color: me.tasks.myOverdue ? "#dc2626" : small.color, fontWeight: me.tasks.myOverdue ? 600 : 400 }}>{me.tasks.myOverdue ? `${me.tasks.myOverdue} overdue` : "Nothing overdue"}</p>
                        </Link>
                    </div>
                </section>
            )}

            {/* Needs attention */}
            {(me || (stats && !stats.error)) && (
                <section>
                    <SectionHead kicker="For you" title="Needs attention" />
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
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{attention.map(a => <AttentionCard key={a.title} {...a} />)}</div>
                    )}
                </section>
            )}

            {/* Company today — staff only. */}
            {hasCompany && (
                <section>
                    <SectionHead kicker="At a glance" title={emp ? "Company today" : "Today"} />
                    <div className="no-scrollbar" style={{ display: "flex", gap: 12, overflowX: "auto", margin: "0 -16px", padding: "2px 16px 6px", scrollbarWidth: "none" }}>
                        {today.map(c => {
                            const Icon = c.icon
                            return (
                                <Link key={c.label} href={c.href} style={{ ...card, flex: "0 0 150px", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
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
                    <SectionHead kicker="Around the company" title="Coming up" />
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
                        {me.announcements.map(a => (
                            <Row key={a.id} href="/announcements" icon={Megaphone} color={a.category === "URGENT" ? "#dc2626" : "#0b5cff"} tint={a.category === "URGENT" ? "#fef2f2" : "#e8effe"}
                                title={a.title} sub={`${a.category.charAt(0) + a.category.slice(1).toLowerCase()} · ${format(new Date(a.publishedAt), "d MMM")}`} />
                        ))}
                    </div>
                </section>
            )}

            {stats?.error && !me && (
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--text3)", textAlign: "center" }}>
                    Couldn&apos;t load today&apos;s numbers. <button type="button" onClick={() => window.location.reload()} style={{ border: "none", background: "none", color: "var(--accent)", fontWeight: 600, cursor: "pointer", padding: 0 }}>Try again</button>
                </p>
            )}
        </div>
    )
}

const big: React.CSSProperties = { margin: "10px 0 0", fontSize: 19, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.15 }
const small: React.CSSProperties = { margin: "3px 0 0", fontSize: 11.5, color: "var(--text3)", lineHeight: 1.3 }

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
    return <HeroCard pill={format(new Date(), "EEE, d MMM")} title="Today" highlight={view.highlight} sub={view.sub} cta={view.cta} href={state === "leave" ? "/leaves" : "/attendance"} icon={state === "done" ? CheckCircle2 : CalendarCheck} />
}

function HeroCard({ pill, title, highlight, sub, cta, href, icon: Icon }: Slide) {
    return (
        <div style={{
            position: "relative", overflow: "hidden", borderRadius: 22, padding: "20px 18px", minHeight: 196,
            background: "var(--accent-gradient)", color: "white", display: "flex", gap: 12,
        }}>
            {/* Soft glows, as on Zavtoo's banner. */}
            <span aria-hidden="true" style={{ position: "absolute", right: -40, top: -40, width: 170, height: 170, borderRadius: "50%", background: "rgba(255,255,255,0.10)" }} />
            <span aria-hidden="true" style={{ position: "absolute", left: -30, bottom: -60, width: 150, height: 150, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />

            <div style={{ position: "relative", flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                <span style={{ background: "#d9f99d", color: "#04246b", fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 99 }}>{pill}</span>
                <p style={{ margin: "12px 0 0", fontSize: 21, fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.02em" }}>{title}</p>
                <p style={{ margin: "2px 0 0", fontSize: 21, fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.02em", color: "var(--gold)" }}>{highlight}</p>
                <p style={{ margin: "8px 0 0", fontSize: 12.5, lineHeight: 1.4, color: "rgba(255,255,255,0.85)" }}>{sub}</p>
                <Link href={href} className="press" style={{
                    marginTop: 14, display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 16px",
                    borderRadius: 12, background: "var(--gold-gradient)", color: "#04246b", fontSize: 13.5, fontWeight: 700,
                    textDecoration: "none", boxShadow: "0 6px 14px rgba(221,143,13,0.35)",
                }}>
                    {cta} <ArrowRight size={15} aria-hidden="true" />
                </Link>
            </div>

            <div aria-hidden="true" style={{ position: "relative", alignSelf: "center", flexShrink: 0 }}>
                <span style={{
                    width: 84, height: 84, borderRadius: 24, background: "rgba(255,255,255,0.96)",
                    display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 10px 24px rgba(2,11,36,0.25)",
                    transform: "rotate(-6deg)",
                }}>
                    <Icon size={40} color="#0b5cff" strokeWidth={2} />
                </span>
            </div>
        </div>
    )
}

function SectionHead({ kicker, title }: { kicker: string; title: string }) {
    return (
        <div style={{ marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: 12, color: "var(--text2)" }}>{kicker}</p>
            <p style={{ margin: "1px 0 0", fontSize: 19, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>{title}</p>
        </div>
    )
}

const TONES = {
    warn:   { bg: "#fef3c7", fg: "#d97706", bd: "#fde68a" },
    info:   { bg: "#eff6ff", fg: "#1e40af", bd: "#dbeafe" },
    danger: { bg: "#fee2e2", fg: "#dc2626", bd: "#fecaca" },
}

function AttentionCard({ title, sub, value, status, tone, href, cta, icon: Icon, color, tint }: {
    title: string; sub: string; value: string; status: string; tone: keyof typeof TONES
    href: string; cta: string; icon: LucideIcon; color: string; tint: string
}) {
    const t = TONES[tone]
    return (
        <Link href={href} style={{ background: "var(--surface)", borderRadius: 18, padding: 14, boxShadow: "var(--shadow-card)", display: "flex", gap: 14, textDecoration: "none" }}>
            <span style={{ width: 64, height: 64, borderRadius: 14, background: tint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={28} color={color} aria-hidden="true" />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</p>
                    <span style={{ background: t.bg, color: t.fg, border: `1px solid ${t.bd}`, fontSize: 10.5, fontWeight: 600, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0 }}>{status}</span>
                </div>
                <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                    <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{value}</p>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>{cta} <ArrowRight size={14} aria-hidden="true" /></span>
                </div>
            </div>
        </Link>
    )
}
