"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { cn } from "@/lib/utils"
import {
    LayoutDashboard,
    Users,
    HardHat,
    ClipboardCheck,
    FileText,
    X,
    Folder,
    BarChart2,
    Users2,
    ChevronRight,
    TrendingUp,
    Target,
    UserCheck,
    MapPin,
    Clock,
    CalendarOff,
    Wallet,
    ClipboardList,
    Star,
    LogOut,
    Package,
    Headphones,
    CreditCard,
    GraduationCap,
    Navigation,
    Shield,
    Briefcase,
    ShieldCheck,
    FolderOpen,
    Files,
    IndianRupee,
    TableProperties,
    BadgeCheck,
    BookOpen,
    Settings2,
    Layers,
    CheckSquare,
    UserCog,
    Megaphone,
    KeyRound,
    SendHorizontal,
} from "lucide-react"

type NavLink = {
    name: string
    href: string
    icon: any
    roles: string[]
    permission?: string
    // Visible if the user holds ANY of these permissions (OR). Use when a
    // page is reachable through more than one permission.
    permissionAny?: string[]
    badge?: boolean
    subLinks?: { name: string; href: string }[]
    // Extra path prefixes that should mark this link active (e.g. the
    // Inspection entry stays highlighted across the whole stepper flow).
    matchPrefixes?: string[]
}

type NavSection = {
    title: string
    links: NavLink[]
}

export function Sidebar({ onMobileClose }: { onMobileClose?: () => void }) {
    const pathname = usePathname()
    const { data: session } = useSession()
    const role = session?.user?.role as string | undefined

    const [pendingCount, setPendingCount] = useState(0)

    // Approval count poll — pauses when tab is hidden to avoid wasted fetches.
    // Interval bumped 60s → 5min; the badge isn't time-critical.
    useEffect(() => {
        const perms = (session?.user as any)?.permissions || []
        if (role !== "ADMIN" && !perms.includes("approvals.view")) return
        let stopped = false
        const ac = new AbortController()
        const fetchCount = async () => {
            if (document.hidden) return
            try {
                const res = await fetch("/api/approvals?count=true", { signal: ac.signal })
                const data = await res.json()
                if (!stopped) setPendingCount(data.count || 0)
            } catch { /* silent */ }
        }
        fetchCount()
        const interval = setInterval(fetchCount, 5 * 60_000)
        return () => { stopped = true; clearInterval(interval); ac.abort() }
    }, [role])

    const userPermissions: string[] = (session?.user as any)?.permissions || []

    // ADMIN → admin home; everyone else → the universal permission-driven
    // dashboard, which renders exactly the widgets their permissions allow.
    const dashboardHref = role === "ADMIN" ? "/admin" : "/dashboard"

    // ─────────────────────────────────────────────────────────────────────────
    // NAVIGATION CONFIG
    // Three views:
    //   • Admin / Manager  — full operational access
    //   • INSPECTION_BOY   — inspector self-service
    // ─────────────────────────────────────────────────────────────────────────
    const navigation: NavSection[] = [

        // ── MAIN ──────────────────────────────────────────────────────────────
        {
            title: "MAIN",
            links: [
                {
                    name: "Dashboard",
                    href: dashboardHref,
                    icon: LayoutDashboard,
                    roles: ["ADMIN", "MANAGER", "HR_MANAGER", "INSPECTION_BOY"],
                },
            ],
        },

        // ── INSPECTIONS (core product) ────────────────────────────────────────
        {
            title: "INSPECTIONS",
            links: [
                // Single entry that opens the guided stepper flow (starts on the
                // real HR Sites list = /sites). The individual pages — Sites,
                // Projects, Assignments, Field Tasks — are reached via the stepper
                // rail, not the sidebar. (Groups was removed.)
                { name: "Inspection", href: "/sites", icon: ClipboardCheck, roles: ["ADMIN", "MANAGER"], permission: "projects.view", matchPrefixes: ["/sites", "/projects", "/assignments", "/field"] },
            ],
        },

        // ── WORKFORCE (employee management) ──────────────────────────────────
        {
            title: "WORKFORCE",
            links: [
                { name: "Employees",        href: "/employees",           icon: UserCheck,    roles: ["ADMIN", "MANAGER", "HR_MANAGER"], permission: "employees.view" },
                { name: "Employee Master",  href: "/employees/master",    icon: TableProperties, roles: ["ADMIN", "MANAGER", "HR_MANAGER"], permission: "employees.view" },
                { name: "Recruitment",      href: "/recruitment",         icon: Target,       roles: ["ADMIN", "MANAGER", "HR_MANAGER"], permission: "recruitment.view" },
                { name: "Jobs",             href: "/jobs",                icon: Briefcase,    roles: ["ADMIN", "MANAGER", "HR_MANAGER"], permission: "jobs.view" },
                { name: "Onboarding",       href: "/onboarding",          icon: ClipboardList, roles: ["ADMIN", "MANAGER", "HR_MANAGER"], permissionAny: ["onboarding.view", "recruitment.view"] },
                { name: "Documents",        href: "/employees/documents", icon: Files,        roles: ["ADMIN", "MANAGER", "HR_MANAGER"], permission: "documents.view" },
                { name: "Send Documents",   href: "/documents/send",      icon: SendHorizontal, roles: ["ADMIN", "MANAGER", "HR_MANAGER"], permissionAny: ["documents.send", "documents.view"] },
            ],
        },

        // ── HR OPERATIONS ─────────────────────────────────────────────────────
        {
            title: "HR OPERATIONS",
            links: [
                { name: "Attendance",   href: "/attendance", icon: Clock,       roles: ["ADMIN", "MANAGER"], permission: "attendance.view" },
                { name: "Leaves",       href: "/leaves",     icon: CalendarOff, roles: ["ADMIN", "MANAGER"], permission: "leaves.view" },
                { name: "Payroll",      href: "/payroll",    icon: Wallet,      roles: ["ADMIN", "MANAGER"], permission: "payroll.view" },
                { name: "Assets",       href: "/assets",     icon: Package,     roles: ["ADMIN", "MANAGER"], permission: "assets.view" },
                { name: "Expenses",     href: "/expenses",   icon: CreditCard,  roles: ["ADMIN", "MANAGER"], permission: "expenses.view" },
            ],
        },

        // ── TALENT & GROWTH ───────────────────────────────────────────────────
        {
            title: "TALENT & GROWTH",
            links: [
                { name: "Performance",      href: "/performance", icon: Star,          roles: ["ADMIN", "MANAGER"], permission: "performance.view" },
                { name: "Exit Management",  href: "/exit",        icon: LogOut,        roles: ["ADMIN", "MANAGER"], permission: "exit.view" },
                { name: "Training (LMS)",   href: "/lms",         icon: GraduationCap, roles: ["ADMIN", "MANAGER"], permission: "lms.manage" },
            ],
        },

        // ── OPERATIONS (approvals + support) ─────────────────────────────────
        {
            title: "OPERATIONS",
            links: [
                { name: "Approvals",    href: "/approvals",     icon: CheckSquare,  roles: ["ADMIN", "MANAGER"], permission: "approvals.view", badge: true },
                { name: "Announcements", href: "/announcements", icon: Megaphone,   roles: ["ADMIN", "MANAGER"], permission: "announcements.view" },
                { name: "Helpdesk",     href: "/helpdesk",      icon: Headphones,   roles: ["ADMIN", "MANAGER"], permission: "helpdesk.view" },
            ],
        },

        // ── ANALYTICS ─────────────────────────────────────────────────────────
        {
            title: "ANALYTICS",
            links: [
                { name: "Analytics",    href: "/manager/analytics", icon: TrendingUp, roles: ["ADMIN", "MANAGER"], permission: "reports.view" },
                { name: "Reports",      href: "/reports",           icon: BarChart2,  roles: ["ADMIN", "MANAGER"], permission: "reports.view" },
            ],
        },

        // ── CONFIGURATION (ADMIN only) ────────────────────────────────────────
        {
            title: "CONFIGURATION",
            links: [
                { name: "Departments",      href: "/departments",   icon: Briefcase,  roles: ["ADMIN"] },
                { name: "System Users",     href: "/admin/users",   icon: Users,      roles: ["ADMIN"] },
                { name: "Employee Logins",  href: "/admin/employee-logins", icon: KeyRound, roles: ["ADMIN"], permission: "users.manage" },
                { name: "Roles",            href: "/admin/roles",   icon: Shield,     roles: ["ADMIN"] },
                { name: "Wage Rule Book",   href: "/admin/rule-book", icon: BookOpen, roles: ["ADMIN"] },
                { name: "Doc Types",        href: "/documents/types", icon: FolderOpen, roles: ["ADMIN"], permission: "documents.view" },
            ],
        },

        // ── INSPECTION BOY — MY WORK ──────────────────────────────────────────
        {
            title: "MY WORK",
            links: [
                // Points at the Inspector Workspace (/inspection) — the only screen
                // that can open and submit an inspection form. /assignments is the
                // manager-side wizard and just bounces inspectors back here.
                { name: "My Assignments",   href: "/inspection",     icon: HardHat,      roles: ["INSPECTION_BOY"], permissionAny: ["inspection.view", "inspection.submit", "inspection.history"], matchPrefixes: ["/inspection"] },
                { name: "My Attendance",    href: "/attendance",     icon: Clock,        roles: ["INSPECTION_BOY"], permission: "self.view" },
                { name: "My Leaves",        href: "/leaves",         icon: CalendarOff,  roles: ["INSPECTION_BOY"], permission: "self.view" },
            ],
        },

        // ── INSPECTION BOY — LEARNING ─────────────────────────────────────────
        {
            title: "LEARNING",
            links: [
                { name: "My Learning",      href: "/lms/learn",      icon: GraduationCap, roles: ["INSPECTION_BOY"], permission: "lms.view" },
            ],
        },

        // ── INSPECTION BOY — MY ACCOUNT ───────────────────────────────────────
        {
            title: "MY ACCOUNT",
            links: [
                { name: "My Profile",       href: "/profile",        icon: UserCheck,    roles: ["INSPECTION_BOY"], permission: "self.view" },
                { name: "My Onboarding",    href: "/self-onboarding", icon: BadgeCheck,  roles: ["INSPECTION_BOY"], permission: "self.view" },
                { name: "Announcements",    href: "/announcements",  icon: Megaphone,    roles: ["INSPECTION_BOY"], permission: "self.view" },
                { name: "Help & Support",   href: "/helpdesk",       icon: Headphones,   roles: ["INSPECTION_BOY"], permission: "self.view" },
            ],
        },

    ]

    return (
        // Deep-blue rail with white type — the dashboard's "Operations overview"
        // look. Colours are local to the sidebar; page tokens are untouched.
        <div className="flex h-full w-full flex-col overflow-hidden rounded-r-[24px] md:rounded-none text-white bg-[linear-gradient(180deg,#0b2a8f_0%,#0a1f6e_55%,#081a5c_100%)]">

            {/* ── Logo / Header ── */}
            <div className="flex h-[80px] items-center justify-between px-5 shrink-0">
                <Link href="/" className="flex items-center gap-2.5">
                    <div className="h-10 w-10 rounded-[12px] flex items-center justify-center text-white bg-[#1f6bff] ring-1 ring-white/25 shadow-[0_6px_16px_rgba(11,92,255,0.45)]">
                        <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 3h18v18H3z" />
                            <path d="M18 9h-6v6h6v-3h-3" />
                        </svg>
                    </div>
                    <span className="text-[19px] font-bold tracking-[-0.02em] text-white leading-none">Growus <span className="text-[#5b9dff]">ERP</span></span>
                </Link>
                {onMobileClose && (
                    <button onClick={onMobileClose} aria-label="Close sidebar" className="p-1 md:hidden hover:bg-white/10 rounded-md transition-colors text-white/70 h-9 w-9 flex items-center justify-center">
                        <X size={20} />
                    </button>
                )}
            </div>

            {/* ── Navigation ── */}
            <div className="flex-1 overflow-y-auto pt-2 px-3 scrollbar-thin [scrollbar-color:rgba(255,255,255,0.2)_transparent]">
                {navigation.map((section) => {
                    const currentRole = String(role || "")

                    const filteredLinks = section.links.filter(link => {
                        if (currentRole === "ADMIN") return true

                        // The universal dashboard is available to every user who
                        // holds at least one permission — it self-adapts to them.
                        if (link.name === "Dashboard") return userPermissions.length > 0

                        // Everything is gated PURELY by custom-role permissions now.
                        // No hardcoded role (MANAGER/HR_MANAGER/INSPECTION_BOY/CLIENT)
                        // grants anything — Admin → Roles is the single source of truth.
                        if (link.permissionAny) return link.permissionAny.some(p => userPermissions.includes(p))
                        if (link.permission) return userPermissions.includes(link.permission)

                        // No universal exceptions: a link without a permission is
                        // hidden for everyone except ADMIN. Access is governed
                        // solely by custom-role permissions.
                        return false
                    })

                    if (filteredLinks.length === 0) return null

                    return (
                        <div key={section.title} className="mb-5">
                            <h3 className="px-3 mb-2 text-[11px] font-semibold text-white/60 tracking-[1.2px] uppercase">
                                {section.title}
                            </h3>
                            <nav className="space-y-0.5">
                                {filteredLinks.map((link) => {
                                    const Icon = link.icon
                                    const hasSubLinks = !!link.subLinks && link.subLinks.length > 0
                                    const isSubActive  = hasSubLinks && link.subLinks!.some(sub => pathname === sub.href || (sub.href !== "/" && pathname.startsWith(sub.href)))
                                    // A prefix match yields to a more specific sibling (e.g.
                                    // "/employees" stays inactive on "/employees/master").
                                    const prefixMatch = link.href !== "/" && pathname.startsWith(link.href + "/")
                                        && !filteredLinks.some(other => other.href.length > link.href.length
                                            && (pathname === other.href || pathname.startsWith(other.href + "/")))
                                    const isItemActive = pathname === link.href
                                        || prefixMatch
                                        || (link.matchPrefixes?.some(p => pathname === p || pathname.startsWith(p + "/")) ?? false)
                                    const showSub = isSubActive || isItemActive

                                    return (
                                        <div key={`${link.href}-${link.name}`} className="flex flex-col gap-0.5">
                                            <Link
                                                href={link.href}
                                                onClick={onMobileClose}
                                                aria-current={isItemActive && !hasSubLinks ? "page" : undefined}
                                                className={cn(
                                                    "flex items-center justify-between rounded-[12px] px-3.5 py-2 min-h-[46px] text-[14px] font-medium transition-all group",
                                                    isItemActive && !hasSubLinks
                                                        ? "bg-[#1f6bff] text-white font-semibold shadow-[0_8px_20px_rgba(11,92,255,0.45)]"
                                                        : (isSubActive || isItemActive)
                                                            ? "bg-white/10 text-white"
                                                            : "text-white/85 hover:bg-white/10 hover:text-white"
                                                )}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <Icon
                                                        size={18}
                                                        className={cn(
                                                            isItemActive || isSubActive
                                                                ? "text-white"
                                                                : "text-white/75 group-hover:text-white"
                                                        )}
                                                        aria-hidden="true"
                                                    />
                                                    {link.name}
                                                </div>
                                                {hasSubLinks && (
                                                    <ChevronRight size={13} className={cn("transition-transform text-white/60", showSub && "rotate-90")} />
                                                )}
                                                {link.badge && pendingCount > 0 && (
                                                    <div className="h-[17px] min-w-[17px] rounded-full bg-[var(--red)] text-white text-[10px] font-bold flex items-center justify-center px-1">
                                                        {pendingCount}
                                                    </div>
                                                )}
                                            </Link>

                                            {hasSubLinks && showSub && (
                                                <div className="flex flex-col gap-0.5 ml-4 border-l border-white/15 pl-3 my-0.5">
                                                    {link.subLinks!.map(sub => {
                                                        const isSubLinkActive = pathname === sub.href
                                                        return (
                                                            <Link
                                                                key={sub.href}
                                                                href={sub.href}
                                                                onClick={onMobileClose}
                                                                className={cn(
                                                                    "rounded-[6px] px-[10px] py-[6px] text-[12px] transition-all",
                                                                    isSubLinkActive
                                                                        ? "bg-white/15 text-white font-medium"
                                                                        : "text-white/65 hover:text-white hover:bg-white/10"
                                                                )}
                                                            >
                                                                {sub.name}
                                                            </Link>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </nav>
                        </div>
                    )
                })}
            </div>

            {/* ── Footer ── */}
            <div className="px-5 py-4 mt-auto">
                <div className="flex flex-col gap-1">
                    <p className="text-[11px] text-white/60">v1.1.2 · Growus ERP</p>
                    <Link href="/terms" className="text-[11px] text-white/60 hover:text-white">Terms & Conditions</Link>
                </div>
            </div>
        </div>
    )
}
