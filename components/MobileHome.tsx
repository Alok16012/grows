"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { format } from "date-fns"
import {
    Search, ArrowRight, ChevronRight, CalendarCheck, Wallet, ClipboardCheck, HardHat,
    UserCheck, Clock, Target, BarChart2, CalendarOff, CreditCard, Headphones, UserPlus,
    LogOut, KeyRound, MapPin, ClipboardList, CheckCircle2, User, Sparkles, type LucideIcon,
} from "lucide-react"
import { useCachedFetch } from "@/lib/useCachedFetch"

/**
 * The phone home screen, laid out like Zavtoo's: brand header (TopNav),
 * a big search bar, a swipeable hero banner with a gold call to action,
 * four quick-action tiles, a horizontally scrolling "Today" strip, and a
 * "Needs attention" list of status cards.
 *
 * It replaces the dashboard grid on phones only — desktop keeps the full
 * dashboard. Every number comes from /api/dashboard/stats, which already
 * returns exactly what the signed-in user may see, so the screen adapts to
 * an admin, an HR manager or an inspector without extra rules here; the
 * tiles follow the same permissions as the sidebar.
 */

type Stats = {
    employees?: { active: number; new30d: number }
    attendanceToday?: { pct: number; present: number; absent: number; onLeave: number }
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

type Tile = { label: string; href: string; icon: LucideIcon; color: string; tint: string; perms?: string[] }

// Office staff, in priority order — the first four the user may open show.
const STAFF_TILES: Tile[] = [
    { label: "Employees",  href: "/employees",   icon: UserCheck,      color: "#0b5cff", tint: "#e8effe", perms: ["employees.view"] },
    { label: "Attendance", href: "/attendance",  icon: Clock,          color: "#0d9488", tint: "#e6fffa", perms: ["attendance.view"] },
    { label: "Approvals",  href: "/approvals",   icon: ClipboardCheck, color: "#dd8f0d", tint: "#fff6e4", perms: ["approvals.view"] },
    { label: "Payroll",    href: "/payroll",     icon: Wallet,         color: "#7c3aed", tint: "#f5f3ff", perms: ["payroll.view"] },
    { label: "Recruitment",href: "/recruitment", icon: Target,         color: "#7c3aed", tint: "#f5f3ff", perms: ["recruitment.view"] },
    { label: "Reports",    href: "/reports",     icon: BarChart2,      color: "#0d9488", tint: "#e6fffa", perms: ["reports.view"] },
    { label: "Leaves",     href: "/leaves",      icon: CalendarOff,    color: "#dd8f0d", tint: "#fff6e4", perms: ["leaves.view"] },
    { label: "Expenses",   href: "/expenses",    icon: CreditCard,     color: "#0b5cff", tint: "#e8effe", perms: ["expenses.view", "expenses.manage"] },
    { label: "Helpdesk",   href: "/helpdesk",    icon: Headphones,     color: "#5b6478", tint: "#f0f2f8", perms: ["helpdesk.view"] },
]

const INSPECTOR_TILES: Tile[] = [
    { label: "Assignments", href: "/inspection", icon: HardHat,     color: "#0b5cff", tint: "#e8effe", perms: ["inspection.view", "inspection.submit", "inspection.history"] },
    { label: "Attendance",  href: "/attendance", icon: Clock,       color: "#0d9488", tint: "#e6fffa", perms: ["self.view"] },
    { label: "Leaves",      href: "/leaves",     icon: CalendarOff, color: "#dd8f0d", tint: "#fff6e4", perms: ["self.view"] },
    { label: "Help",        href: "/helpdesk",   icon: Headphones,  color: "#7c3aed", tint: "#f5f3ff", perms: ["self.view"] },
]

type Slide = { pill: string; title: string; highlight: string; sub: string; cta: string; href: string; icon: LucideIcon }

const fmt = (n: number) => n.toLocaleString("en-IN")

export function MobileHome() {
    const { data: session } = useSession()
    const { data: stats, loading } = useCachedFetch<Stats>("/api/dashboard/stats")
    const [slide, setSlide] = useState(0)
    const railRef = useRef<HTMLDivElement>(null)

    const role = String((session?.user as any)?.role ?? "")
    const perms: string[] = (session?.user as any)?.permissions ?? []
    const allowed = (t: Tile) => role === "ADMIN" || !t.perms || t.perms.some(p => perms.includes(p))
    // Same test as the bottom bar, so the two never disagree about who this is.
    const isInspector = role === "INSPECTION_BOY"
        || (role !== "ADMIN" && perms.some(p => p.startsWith("inspection.")) && !perms.includes("employees.view"))

    const firstName = (session?.user?.name || "there").split(" ")[0]
    const hour = new Date().getHours()
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
    const s: Stats = stats && !stats.error ? stats : {}

    // ── Hero slides: only the ones this user has numbers for ────────────────
    const slides: Slide[] = []
    if (isInspector) slides.push({
        pill: "Today", title: "Your inspections", highlight: `${s.activeAssignments ?? 0} active`,
        sub: "Open your assignments and start the next part", cta: "My Assignments", href: "/inspection", icon: HardHat,
    })
    if (s.attendanceToday) slides.push({
        pill: format(new Date(), "EEE, d MMM"), title: "Today's attendance", highlight: `${s.attendanceToday.pct}% present`,
        sub: `Present ${fmt(s.attendanceToday.present)} · Absent ${fmt(s.attendanceToday.absent)} · Leave ${fmt(s.attendanceToday.onLeave)}`,
        cta: "View Attendance", href: "/attendance", icon: CalendarCheck,
    })
    if (s.approvals && s.approvals.total > 0) slides.push({
        pill: "Action needed", title: "Approvals waiting", highlight: `${fmt(s.approvals.total)} pending`,
        sub: [s.approvals.hasLeaves ? `${s.approvals.leaves} leaves` : null, s.approvals.hasExpenses ? `${s.approvals.expenses} expenses` : null, s.approvals.hasInspections ? `${s.approvals.inspections} inspections` : null].filter(Boolean).join(" · ") || "Review and approve",
        cta: "Review Now", href: "/approvals", icon: ClipboardCheck,
    })
    if (s.payroll) slides.push({
        pill: format(new Date(), "MMMM yyyy"), title: "Payroll", highlight: `${s.payroll.pct}% processed`,
        sub: `Processed ${fmt(s.payroll.processed)} · Pending ${fmt(s.payroll.pending)}`,
        cta: "Open Payroll", href: "/payroll", icon: Wallet,
    })
    if (slides.length === 0) slides.push({
        pill: format(new Date(), "EEE, d MMM"), title: "Welcome back", highlight: firstName,
        sub: "Everything you need is one tap away", cta: "My Profile", href: "/profile", icon: Sparkles,
    })
    const heroSlides = slides.slice(0, 3)

    const tiles = (isInspector ? INSPECTOR_TILES : STAFF_TILES).filter(allowed).slice(0, 4)

    // ── "Today" strip ───────────────────────────────────────────────────────
    const today: { label: string; value: string; sub?: string; href: string; icon: LucideIcon; color: string; tint: string }[] = []
    if (s.employees) today.push({ label: "Active employees", value: fmt(s.employees.active ?? 0), sub: s.employees.new30d > 0 ? `+${s.employees.new30d} in 30 days` : undefined, href: "/employees", icon: UserCheck, color: "#0b5cff", tint: "#e8effe" })
    if (s.attendanceToday) today.push({ label: "Present today", value: fmt(s.attendanceToday.present), sub: `${s.attendanceToday.pct}% attendance`, href: "/attendance", icon: CalendarCheck, color: "#15803d", tint: "#dcfce7" })
    if (s.approvals) today.push({ label: "Pending approvals", value: fmt(s.approvals.total), href: "/approvals", icon: ClipboardCheck, color: "#dd8f0d", tint: "#fff6e4" })
    if (s.recruitment) today.push({ label: "Active candidates", value: fmt(s.recruitment.activeLeads), sub: `${s.recruitment.joined30d} joined in 30 days`, href: "/recruitment", icon: Target, color: "#7c3aed", tint: "#f5f3ff" })
    if (s.activeAssignments !== undefined) today.push({ label: "Active assignments", value: fmt(s.activeAssignments), href: isInspector ? "/inspection" : "/assignments", icon: ClipboardList, color: "#0d9488", tint: "#e6fffa" })
    if (s.activeSites !== undefined) today.push({ label: "Active sites", value: fmt(s.activeSites), href: "/sites", icon: MapPin, color: "#0891b2", tint: "#ecfeff" })
    if (s.openTickets !== undefined) today.push({ label: "Open tickets", value: fmt(s.openTickets), href: "/helpdesk", icon: Headphones, color: "#5b6478", tint: "#f0f2f8" })

    // ── "Needs attention" cards, like Zavtoo's order cards ──────────────────
    type Tone = "warn" | "info" | "danger"
    const attention: { title: string; sub: string; value: string; status: string; tone: Tone; href: string; cta: string; icon: LucideIcon; color: string; tint: string }[] = []
    if (s.approvals && s.approvals.total > 0) attention.push({ title: "Approvals", sub: "Leaves, expenses and inspections", value: `${fmt(s.approvals.total)} waiting`, status: "Pending", tone: "warn", href: "/approvals", cta: "Review", icon: ClipboardCheck, color: "#dd8f0d", tint: "#fff6e4" })
    if (s.onboarding && s.onboarding.inProgress > 0) attention.push({ title: "Onboarding", sub: `${s.onboarding.notStarted} yet to start · ${s.onboarding.onHold} on hold`, value: `${fmt(s.onboarding.inProgress)} in progress`, status: "In Progress", tone: "info", href: "/onboarding", cta: "View", icon: UserPlus, color: "#0b5cff", tint: "#e8effe" })
    if (s.payroll && s.payroll.pending > 0) attention.push({ title: `Payroll · ${format(new Date(), "MMM yyyy")}`, sub: `${fmt(s.payroll.processed)} processed`, value: `${fmt(s.payroll.pending)} pending`, status: "Pending", tone: "warn", href: "/payroll", cta: "Continue", icon: Wallet, color: "#7c3aed", tint: "#f5f3ff" })
    if (s.exits && s.exits.pending > 0) attention.push({ title: "Exits", sub: `${s.exits.clearancePending} clearances pending`, value: `${fmt(s.exits.pending)} open`, status: "Open", tone: "danger", href: "/exit", cta: "View", icon: LogOut, color: "#dc2626", tint: "#fef2f2" })
    if (s.logins && s.logins.withoutLogin > 0) attention.push({ title: "Employee logins", sub: `${fmt(s.logins.withLogin)} of ${fmt(s.logins.totalEmployees)} set up`, value: `${fmt(s.logins.withoutLogin)} without login`, status: "Action", tone: "info", href: "/admin/employee-logins", cta: "Manage", icon: KeyRound, color: "#0b5cff", tint: "#e8effe" })

    const onRailScroll = () => {
        const el = railRef.current
        if (el) setSlide(Math.round(el.scrollLeft / el.clientWidth))
    }

    return (
        <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: 20, padding: "4px 16px 8px" }}>
            {/* Greeting */}
            <div>
                <p style={{ margin: 0, fontSize: 13, color: "var(--text2)" }}>{greeting},</p>
                <p style={{ margin: "1px 0 0", fontSize: 22, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>{firstName} 👋</p>
            </div>

            {/* Search — opens the header search, so there is one search. */}
            <button type="button" onClick={() => window.dispatchEvent(new Event("grows:open-search"))}
                style={{
                    display: "flex", alignItems: "center", gap: 12, width: "100%", height: 52, padding: "0 18px",
                    background: "var(--surface)", border: "none", borderRadius: 16, boxShadow: "var(--shadow-card)",
                    cursor: "pointer", textAlign: "left",
                }}>
                <Search size={20} color="var(--text3)" aria-hidden="true" />
                <span style={{ fontSize: 15, color: "var(--text3)" }}>Search sites, projects, inspections…</span>
            </button>

            {/* Hero — swipe between slides; dots below, as in Zavtoo. */}
            <div>
                <div ref={railRef} onScroll={onRailScroll} className="no-scrollbar"
                    style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", borderRadius: 22, scrollbarWidth: "none" }}>
                    {(loading && !stats ? [null] : heroSlides).map((h, i) => (
                        <div key={i} style={{ flex: "0 0 100%", scrollSnapAlign: "start", paddingRight: i < heroSlides.length - 1 ? 0 : 0 }}>
                            {h ? <HeroCard {...h} /> : <div style={{ height: 196, borderRadius: 22, background: "var(--accent-light)" }} className="skeleton-pulse" />}
                        </div>
                    ))}
                </div>
                {heroSlides.length > 1 && (
                    <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 10 }}>
                        {heroSlides.map((_, i) => (
                            <span key={i} style={{ height: 6, width: i === slide ? 22 : 6, borderRadius: 99, background: i === slide ? "var(--accent)" : "#c7d3f0", transition: "all 0.2s" }} />
                        ))}
                    </div>
                )}
            </div>

            {/* Quick actions — Zavtoo's four white tiles. */}
            {tiles.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(tiles.length, 4)}, minmax(0, 1fr))`, gap: 12 }}>
                    {tiles.map(t => {
                        const Icon = t.icon
                        return (
                            <Link key={t.href + t.label} href={t.href} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textDecoration: "none" }}>
                                <span style={{
                                    width: "100%", aspectRatio: "1 / 1", maxWidth: 72, borderRadius: 20, background: "var(--surface)",
                                    boxShadow: "var(--shadow-card)", display: "flex", alignItems: "center", justifyContent: "center",
                                }}>
                                    <span style={{ width: 40, height: 40, borderRadius: 12, background: t.tint, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <Icon size={22} color={t.color} strokeWidth={2.2} aria-hidden="true" />
                                    </span>
                                </span>
                                <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text)", textAlign: "center", lineHeight: 1.25 }}>{t.label}</span>
                            </Link>
                        )
                    })}
                </div>
            )}

            {/* Today strip */}
            {today.length > 0 && (
                <section>
                    <SectionHead kicker="At a glance" title="Today" />
                    <div className="no-scrollbar" style={{ display: "flex", gap: 12, overflowX: "auto", margin: "0 -16px", padding: "2px 16px 6px", scrollbarWidth: "none" }}>
                        {today.map(c => {
                            const Icon = c.icon
                            return (
                                <Link key={c.label} href={c.href} style={{
                                    flex: "0 0 150px", background: "var(--surface)", borderRadius: 18, padding: 14,
                                    boxShadow: "var(--shadow-card)", textDecoration: "none", display: "flex", flexDirection: "column", gap: 10,
                                }}>
                                    <span style={{ width: 36, height: 36, borderRadius: 11, background: c.tint, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <Icon size={18} color={c.color} aria-hidden="true" />
                                    </span>
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

            {/* Needs attention */}
            {!isInspector && stats && !stats.error && (
                <section>
                    <SectionHead kicker="For you" title="Needs attention" />
                    {attention.length === 0 ? (
                        <div style={{ background: "var(--surface)", borderRadius: 18, padding: 18, boxShadow: "var(--shadow-card)", display: "flex", alignItems: "center", gap: 14 }}>
                            <span style={{ width: 44, height: 44, borderRadius: 14, background: "var(--success-light)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <CheckCircle2 size={22} color="var(--success)" aria-hidden="true" />
                            </span>
                            <div>
                                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--text)" }}>All caught up</p>
                                <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--text2)" }}>Nothing is waiting on you right now.</p>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            {attention.map(a => <AttentionCard key={a.title} {...a} />)}
                        </div>
                    )}
                </section>
            )}

            {/* Inspector: a nudge to the profile, the other place they live. */}
            {isInspector && (
                <Link href="/profile" style={{ background: "var(--surface)", borderRadius: 18, padding: 16, boxShadow: "var(--shadow-card)", display: "flex", alignItems: "center", gap: 14, textDecoration: "none" }}>
                    <span style={{ width: 44, height: 44, borderRadius: 14, background: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <User size={22} color="var(--accent)" aria-hidden="true" />
                    </span>
                    <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--text)" }}>My profile</p>
                        <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--text2)" }}>Documents, bank details and payslips</p>
                    </div>
                    <ChevronRight size={18} color="var(--text3)" aria-hidden="true" />
                </Link>
            )}

            {stats?.error && (
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--text3)", textAlign: "center" }}>
                    Couldn&apos;t load today&apos;s numbers. <button type="button" onClick={() => window.location.reload()} style={{ border: "none", background: "none", color: "var(--accent)", fontWeight: 600, cursor: "pointer", padding: 0 }}>Try again</button>
                </p>
            )}
        </div>
    )
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
