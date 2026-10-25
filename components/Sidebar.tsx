"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { cn } from "@/lib/utils"
import { COMPANY } from "@/lib/company"
import {
    Home,
    ClipboardCheck,
    UserPlus,
    UsersRound,
    Clock,
    Wallet,
    TrendingUp,
    Package,
    Megaphone,
    BarChart3,
    SlidersHorizontal,
    CircleUser,
    HardHat,
    ChevronDown,
    Search,
    X,
} from "lucide-react"

type NavLink = {
    name: string
    href: string
    permission?: string
    // Visible if the user holds ANY of these permissions (OR). Use when a
    // page is reachable through more than one permission.
    permissionAny?: string[]
    // Which pending count to show; the three add up to the dashboard's
    // "Pending approvals" total (inspections + leaves + expenses).
    badge?: BadgeKey
    // Self-service entries ("My Attendance") duplicate a management page for
    // anyone who already has it ("Attendance" → same route). Hide the
    // self-service copy for ADMIN and for holders of this permission.
    hideIfHas?: string
    // Employee-only entries (My Onboarding, My Learning…) that ADMIN never needs.
    hideForAdmin?: boolean
    // Small heading printed above this link inside its category (Settings
    // splits into Organisation / Users & Access / HR & Payroll Rules).
    group?: string
    // Extra path prefixes that should mark this link active (e.g. the
    // Inspection entry stays highlighted across the whole stepper flow).
    matchPrefixes?: string[]
}

type BadgeKey = "approvals" | "leaves" | "expenses"

// Count endpoint and tooltip per badge.
const BADGES: Record<BadgeKey, { url: string; title: string }> = {
    approvals: { url: "/api/approvals?count=true", title: "Inspection reports awaiting review" },
    leaves: { url: "/api/leaves?status=PENDING&count=true", title: "Leave requests awaiting approval" },
    expenses: { url: "/api/expenses?status=SUBMITTED&count=true", title: "Expense claims awaiting approval" },
}

type NavCategory = {
    title: string
    icon: any
    links: NavLink[]
}

// Which categories the user folded away. Per-browser convenience only.
const COLLAPSED_KEY = "grows.sidebar.collapsed"
const COLLAPSED_EVENT = "grows:sidebar-collapsed"

export function Sidebar({ onMobileClose }: { onMobileClose?: () => void }) {
    const pathname = usePathname()
    const { data: session } = useSession()
    const role = session?.user?.role as string | undefined

    const [badgeCounts, setBadgeCounts] = useState<Record<BadgeKey, number>>({ approvals: 0, leaves: 0, expenses: 0 })
    const [collapsed, setCollapsed] = useState<string[]>([])
    // The category holding the current page, held open without touching the
    // saved folds (so visiting a page doesn't undo the user's choice).
    const [revealed, setRevealed] = useState<string | null>(null)
    const [query, setQuery] = useState("")

    // Pending-count polls — pause when tab is hidden to avoid wasted fetches.
    // Interval bumped 60s → 5min; the badges aren't time-critical. Each badge
    // is gated by the same permission as its nav item.
    useEffect(() => {
        const perms: string[] = (session?.user as any)?.permissions || []
        const gate: Record<BadgeKey, string> = { approvals: "approvals.view", leaves: "leaves.view", expenses: "expenses.view" }
        const keys = (Object.keys(BADGES) as BadgeKey[]).filter(k => role === "ADMIN" || perms.includes(gate[k]))
        if (keys.length === 0) return
        let stopped = false
        const ac = new AbortController()
        const fetchCounts = () => {
            if (document.hidden) return
            for (const k of keys) {
                fetch(BADGES[k].url, { signal: ac.signal })
                    .then(res => res.json())
                    .then(data => { if (!stopped) setBadgeCounts(prev => ({ ...prev, [k]: data.count || 0 })) })
                    .catch(() => { /* silent */ })
            }
        }
        fetchCounts()
        const interval = setInterval(fetchCounts, 5 * 60_000)
        // A tab opened in the background skipped the first fetch and then
        // showed no badges for five minutes; catch up as soon as it's seen.
        const onVisible = () => { if (!document.hidden) fetchCounts() }
        document.addEventListener("visibilitychange", onVisible)
        return () => { stopped = true; clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); ac.abort() }
    }, [role])

    // The layout mounts two sidebars (desktop rail + mobile drawer); an event
    // keeps their folds in step so neither saves over the other.
    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(COLLAPSED_KEY) || "[]")
            if (Array.isArray(saved)) setCollapsed(saved.filter((s): s is string => typeof s === "string"))
        } catch { /* storage blocked — start expanded */ }
        const onChange = (e: Event) => setCollapsed((e as CustomEvent<string[]>).detail)
        window.addEventListener(COLLAPSED_EVENT, onChange)
        return () => window.removeEventListener(COLLAPSED_EVENT, onChange)
    }, [])

    const saveCollapsed = (next: string[]) => {
        try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next)) } catch { /* ignore */ }
        window.dispatchEvent(new CustomEvent(COLLAPSED_EVENT, { detail: next }))
    }

    const userPermissions: string[] = (session?.user as any)?.permissions || []

    // ADMIN → admin home; everyone else → the universal permission-driven
    // dashboard, which renders exactly the widgets their permissions allow.
    const dashboardHref = role === "ADMIN" ? "/admin" : "/dashboard"

    // ─────────────────────────────────────────────────────────────────────────
    // NAVIGATION CONFIG — category → module, per the admin navigation review.
    // The management categories come first; "My Work" / "My Account" hold the
    // self-service copies an employee without management rights sees.
    // ─────────────────────────────────────────────────────────────────────────
    const navigation: NavCategory[] = [
        {
            title: "Home",
            icon: Home,
            links: [
                { name: "Dashboard", href: dashboardHref },
                { name: "Approvals Inbox", href: "/approvals", permission: "approvals.view", badge: "approvals" },
            ],
        },
        {
            title: "Inspections & Projects",
            icon: ClipboardCheck,
            links: [
                // Opens the guided stepper flow (starts on the HR Sites list =
                // /sites); Sites, Projects and Field Tasks are reached via its rail.
                { name: "Projects & Sites", href: "/sites", permission: "projects.view", matchPrefixes: ["/sites", "/projects", "/field"] },
                { name: "Inspection Assignments", href: "/assignments", permission: "assignments.view" },
            ],
        },
        {
            title: "Talent Acquisition",
            icon: UserPlus,
            links: [
                { name: "Job Openings", href: "/jobs", permission: "jobs.view" },
                { name: "Candidates & Recruitment", href: "/recruitment", permission: "recruitment.view" },
                { name: "Onboarding", href: "/onboarding", permissionAny: ["onboarding.view", "recruitment.view"] },
            ],
        },
        {
            title: "Employee Management",
            icon: UsersRound,
            links: [
                { name: "Employee Directory", href: "/employees", permission: "employees.view" },
                { name: "Employee Master Data", href: "/employees/master", permission: "employees.view" },
                { name: "Employee Documents", href: "/employees/documents", permission: "documents.view" },
                { name: "Letters & Documents", href: "/documents/send", permissionAny: ["documents.send", "documents.view"] },
                { name: "Policies", href: "/policies", permissionAny: ["policy.view", "policy.manage", "policy.report"] },
                // An employee leaving is an HR process (clearance, F&F), not growth.
                { name: "Exit Management", href: "/exit", permission: "exit.view" },
            ],
        },
        {
            title: "Time & Attendance",
            icon: Clock,
            links: [
                { name: "Attendance", href: "/attendance", permission: "attendance.view" },
                { name: "Leave", href: "/leaves", permission: "leaves.view", badge: "leaves" },
            ],
        },
        {
            title: "Payroll & Expenses",
            icon: Wallet,
            links: [
                { name: "Payroll", href: "/payroll", permission: "payroll.view" },
                { name: "Expense Claims", href: "/expenses", permission: "expenses.view", badge: "expenses" },
            ],
        },
        {
            title: "Performance & Learning",
            icon: TrendingUp,
            links: [
                { name: "Performance", href: "/performance", permission: "performance.view", matchPrefixes: ["/performance/hub"] },
                { name: "Training (LMS)", href: "/lms", permission: "lms.manage" },
            ],
        },
        {
            title: "Assets",
            icon: Package,
            links: [
                // Requesters / approvers / store staff work here without assets.view.
                { name: "Asset Register", href: "/assets", permissionAny: ["assets.view", "assets.manage", "assets.request", "assets.approve", "assets.issue"] },
            ],
        },
        {
            title: "Communication & Support",
            icon: Megaphone,
            links: [
                { name: "Announcements", href: "/announcements", permission: "announcements.view" },
                { name: "Helpdesk", href: "/helpdesk", permission: "helpdesk.view" },
            ],
        },
        {
            title: "Reports & Analytics",
            icon: BarChart3,
            links: [
                { name: "Analytics", href: "/manager/analytics", permission: "reports.view" },
                { name: "Reports", href: "/reports", permission: "reports.view" },
            ],
        },
        {
            // Admin, or the matching permission (users.view, roles.view,
            // audit.view, users.manage, documents.view).
            title: "Settings",
            icon: SlidersHorizontal,
            links: [
                { name: "Departments", href: "/departments", group: "Organisation" },
                { name: "System Users", href: "/admin/users", permissionAny: ["users.view", "users.manage"], group: "Users & Access" },
                { name: "Employee Logins", href: "/admin/employee-logins", permission: "users.manage", group: "Users & Access" },
                { name: "Roles", href: "/admin/roles", permission: "roles.view", group: "Users & Access" },
                { name: "Audit log", href: "/admin/audit", permission: "audit.view", group: "Users & Access" },
                { name: "Wage Rule Book", href: "/admin/rule-book", group: "HR & Payroll Rules" },
                { name: "Document Types", href: "/documents/types", permission: "documents.view", group: "HR & Payroll Rules" },
            ],
        },
        {
            title: "My Work",
            icon: HardHat,
            links: [
                // Points at the Inspector Workspace (/inspection) — the only screen
                // that can open and submit an inspection form. /assignments is the
                // manager-side wizard and just bounces inspectors back here.
                { name: "My Assignments", href: "/inspection", permissionAny: ["inspection.view", "inspection.submit", "inspection.history"], matchPrefixes: ["/inspection"], hideForAdmin: true },
                { name: "My Attendance", href: "/attendance", permission: "self.view", hideIfHas: "attendance.view" },
                { name: "My Leaves", href: "/leaves", permission: "self.view", hideIfHas: "leaves.view" },
                { name: "My Performance", href: "/performance", permission: "self.view", hideIfHas: "performance.view", matchPrefixes: ["/performance/hub"] },
                { name: "My Learning", href: "/lms/learn", permission: "lms.view", hideForAdmin: true },
            ],
        },
        {
            title: "My Account",
            icon: CircleUser,
            links: [
                { name: "My Profile", href: "/profile", permission: "self.view" },
                { name: "My Onboarding", href: "/self-onboarding", permission: "self.view", hideForAdmin: true },
                { name: "Announcements", href: "/announcements", permission: "self.view", hideIfHas: "announcements.view" },
                { name: "Help & Support", href: "/helpdesk", permission: "self.view", hideIfHas: "helpdesk.view" },
            ],
        },
    ]

    const currentRole = String(role || "")
    const canSee = (link: NavLink) => {
        // Self-service copies of a page this user already manages.
        if (link.hideIfHas && (currentRole === "ADMIN" || userPermissions.includes(link.hideIfHas))) return false
        if (currentRole === "ADMIN") return !link.hideForAdmin

        // The universal dashboard is available to every user who
        // holds at least one permission — it self-adapts to them.
        if (link.href === "/dashboard") return userPermissions.length > 0

        // Everything is gated PURELY by custom-role permissions.
        // No hardcoded role (MANAGER/HR_MANAGER/INSPECTION_BOY/CLIENT)
        // grants anything — Admin → Roles is the single source of truth.
        // A link without a permission is ADMIN-only.
        if (link.permissionAny) return link.permissionAny.some(p => userPermissions.includes(p))
        if (link.permission) return userPermissions.includes(link.permission)
        return false
    }

    // Every link across all categories — a prefix match yields to any more
    // specific link anywhere in the menu (e.g. Dashboard "/admin" vs Roles "/admin/roles").
    const allLinks = navigation.flatMap(c => c.links)
    const isActive = (link: NavLink) => {
        const prefixMatch = link.href !== "/" && pathname.startsWith(link.href + "/")
            && !allLinks.some(other => other.href.length > link.href.length
                && (pathname === other.href || pathname.startsWith(other.href + "/")))
        return pathname === link.href
            || prefixMatch
            || (link.matchPrefixes?.some(p => pathname === p || pathname.startsWith(p + "/")) ?? false)
    }

    const visible = navigation
        .map(c => ({ ...c, links: c.links.filter(canSee) }))
        .filter(c => c.links.length > 0)

    const q = query.trim().toLowerCase()
    const shown = q
        ? visible
            .map(c => c.title.toLowerCase().includes(q) ? c : { ...c, links: c.links.filter(l => l.name.toLowerCase().includes(q)) })
            .filter(c => c.links.length > 0)
        : visible
    const moduleCount = visible.reduce((n, c) => n + c.links.length, 0)

    // The category holding the current page opens itself on arrival, even if
    // it was folded away earlier.
    const activeCategory = visible.find(c => c.links.some(isActive))?.title ?? null
    useEffect(() => { setRevealed(activeCategory) }, [pathname, activeCategory])

    // A search shows every match; otherwise honour the fold.
    const isOpen = (title: string) => !!q || title === revealed || !collapsed.includes(title)
    const allCollapsed = visible.length > 0 && visible.every(c => !isOpen(c.title))
    const toggle = (title: string) => {
        if (isOpen(title)) {
            if (title === revealed) setRevealed(null)
            if (!collapsed.includes(title)) saveCollapsed([...collapsed, title])
        } else {
            saveCollapsed(collapsed.filter(t => t !== title))
        }
    }
    const toggleAll = () => {
        if (allCollapsed) return saveCollapsed([])
        setRevealed(null)
        saveCollapsed(visible.map(c => c.title))
    }

    return (
        // Deep-blue rail with white type — the dashboard's "Operations overview"
        // look. Colours are local to the sidebar; page tokens are untouched.
        <div className="flex h-full w-full flex-col overflow-hidden rounded-r-[24px] md:rounded-none text-white bg-[linear-gradient(180deg,#0b2a8f_0%,#0a1f6e_55%,#081a5c_100%)]">

            {/* ── Logo / Header ── */}
            <div className="flex h-[72px] items-center justify-between px-5 shrink-0">
                <Link href="/" className="flex items-center gap-2.5">
                    <div className="h-10 w-10 rounded-[12px] flex items-center justify-center text-white bg-[#1f6bff] ring-1 ring-white/25 shadow-[0_6px_16px_rgba(11,92,255,0.45)]">
                        <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 3h18v18H3z" />
                            <path d="M18 9h-6v6h6v-3h-3" />
                        </svg>
                    </div>
                    <span className="text-[19px] font-bold tracking-[-0.02em] text-white leading-none">{COMPANY.shortName} <span className="text-[#5b9dff]">{COMPANY.nameSuffix}</span></span>
                </Link>
                {onMobileClose && (
                    <button onClick={onMobileClose} aria-label="Close sidebar" className="p-1 md:hidden hover:bg-white/10 rounded-md transition-colors text-white/70 h-9 w-9 flex items-center justify-center">
                        <X size={20} />
                    </button>
                )}
            </div>

            {/* ── Find a module ── */}
            <div className="px-3 shrink-0">
                <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/55 pointer-events-none" aria-hidden="true" />
                    <input
                        type="search"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === "Escape") setQuery("") }}
                        placeholder="Find a module..."
                        aria-label="Find a module"
                        className="w-full h-10 rounded-[10px] bg-white/10 pl-9 pr-3 text-[13px] text-white placeholder:text-white/55 outline-none ring-1 ring-white/10 focus:ring-white/35 [&::-webkit-search-cancel-button]:invert"
                    />
                </div>
                {visible.length > 1 && (
                    <div className="flex items-center justify-between px-1 pt-3 pb-1">
                        <p className="text-[10.5px] font-semibold tracking-[1px] uppercase text-white/55">
                            {visible.length} {visible.length === 1 ? "category" : "categories"} · {moduleCount} {moduleCount === 1 ? "module" : "modules"}
                        </p>
                        {!q && (
                            <button
                                type="button"
                                onClick={toggleAll}
                                className="shrink-0 whitespace-nowrap text-[11px] font-medium text-white/70 hover:text-white"
                            >
                                {allCollapsed ? "Expand all" : "Collapse all"}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* ── Navigation ── */}
            <nav aria-label="Main" className="flex-1 overflow-y-auto pt-1 pb-3 px-3 scrollbar-thin [scrollbar-color:rgba(255,255,255,0.2)_transparent]">
                {q && shown.length === 0 && (
                    <p className="px-3 py-6 text-[13px] text-white/60">No module matches “{query.trim()}”.</p>
                )}
                {shown.map((category) => {
                    const Icon = category.icon
                    const open = isOpen(category.title)
                    const holdsActive = category.links.some(isActive)
                    const listId = `nav-${category.title.replace(/\W+/g, "-").toLowerCase()}`

                    return (
                        <div key={category.title} className="mb-1">
                            <button
                                type="button"
                                onClick={() => toggle(category.title)}
                                aria-expanded={open}
                                aria-controls={listId}
                                disabled={!!q}
                                className={cn(
                                    "w-full flex items-center gap-2.5 rounded-[10px] px-3 py-2 min-h-[40px] text-left text-[13.5px] font-semibold transition-colors",
                                    holdsActive ? "text-white" : "text-white/85 hover:text-white",
                                    !q && "hover:bg-white/10"
                                )}
                            >
                                <Icon size={17} className={holdsActive ? "text-white" : "text-white/70"} aria-hidden="true" />
                                <span className="flex-1 leading-tight">{category.title}</span>
                                <span className="text-[11px] font-medium text-white/50 tabular-nums">{category.links.length}</span>
                                <ChevronDown size={14} className={cn("text-white/55 transition-transform", !open && "-rotate-90")} aria-hidden="true" />
                            </button>

                            {open && (
                                <div id={listId} className="flex flex-col gap-0.5 pb-2 pt-0.5">
                                    {category.links.map((link, i) => {
                                        const active = isActive(link)
                                        const heading = link.group && link.group !== category.links[i - 1]?.group ? link.group : null
                                        return (
                                            <div key={`${link.href}-${link.name}`}>
                                                {heading && (
                                                    <p className="pl-[42px] pr-3 pt-2 pb-1 text-[10px] font-bold tracking-[1px] uppercase text-[#8fb6ff]">{heading}</p>
                                                )}
                                                <Link
                                                    href={link.href}
                                                    onClick={onMobileClose}
                                                    aria-current={active ? "page" : undefined}
                                                    className={cn(
                                                        "flex items-center justify-between gap-2 rounded-[10px] pl-[42px] pr-3 py-2 min-h-[38px] text-[13.5px] transition-all",
                                                        active
                                                            ? "bg-[#1f6bff] text-white font-semibold shadow-[0_8px_20px_rgba(11,92,255,0.45)]"
                                                            : "text-white/80 hover:bg-white/10 hover:text-white"
                                                    )}
                                                >
                                                    <span className="leading-tight">{link.name}</span>
                                                    {link.badge && badgeCounts[link.badge] > 0 && (
                                                        <span title={BADGES[link.badge].title} className="h-[18px] min-w-[18px] shrink-0 rounded-full bg-[var(--red)] text-white text-[10px] font-bold flex items-center justify-center px-1.5">
                                                            {badgeCounts[link.badge]}
                                                        </span>
                                                    )}
                                                </Link>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )
                })}
            </nav>

            {/* ── Footer ── */}
            <div className="px-5 py-4 mt-auto shrink-0">
                <div className="flex flex-col gap-1">
                    <p className="text-[11px] text-white/60">{`v${COMPANY.version} · ${COMPANY.name}`}</p>
                    <Link href="/terms" className="text-[11px] text-white/60 hover:text-white">Terms & Conditions</Link>
                </div>
            </div>
        </div>
    )
}
