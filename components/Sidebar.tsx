"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { cn } from "@/lib/utils"
import {
    LayoutDashboard,
    Users,
    Building2,
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
    Receipt,
    CreditCard,
    FileSignature,
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
        const fetchCount = async () => {
            if (document.hidden) return
            try {
                const res = await fetch("/api/approvals?count=true")
                const data = await res.json()
                if (!stopped) setPendingCount(data.count || 0)
            } catch { /* silent */ }
        }
        fetchCount()
        const interval = setInterval(fetchCount, 5 * 60_000)
        return () => { stopped = true; clearInterval(interval) }
    }, [role])

    const userPermissions: string[] = (session?.user as any)?.permissions || []

    // Land users purely by what their custom role grants — system roles
    // (INSPECTION_BOY/CLIENT/MANAGER/HR_MANAGER) no longer drive routing.
    // ADMIN → admin home; everyone else → first page their permissions allow;
    // fallback → their own profile (the one page every user always has).
    function landingForUser(): string {
        if (role === "ADMIN") return "/admin"

        if (userPermissions.includes("recruitment.view")) return "/recruitment"
        if (userPermissions.includes("assignments.view")) return "/assignments"
        if (userPermissions.includes("projects.view")) return "/projects"
        if (userPermissions.includes("sites.view")) return "/sites"
        if (userPermissions.includes("employees.view")) return "/employees"
        if (userPermissions.includes("attendance.view")) return "/attendance"
        if (userPermissions.includes("payroll.view")) return "/payroll"
        if (userPermissions.includes("expenses.view") || userPermissions.includes("expenses.manage")) return "/expenses"
        if (userPermissions.includes("helpdesk.view")) return "/helpdesk"
        if (userPermissions.includes("lms.view")) return "/lms/learn"
        if (userPermissions.includes("reports.view")) return "/reports"

        return "/profile"
    }
    const dashboardHref = landingForUser()

    // ─────────────────────────────────────────────────────────────────────────
    // NAVIGATION CONFIG
    // Three views:
    //   • Admin / Manager  — full operational access
    //   • INSPECTION_BOY   — inspector self-service
    //   • CLIENT           — read-only portal
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
                // CLIENT gets their own portal as the first item
                { name: "Client Portal", href: "/client", icon: FileText, roles: ["CLIENT"] },
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
                { name: "Onboarding",       href: "/onboarding",          icon: ClipboardList, roles: ["ADMIN", "MANAGER"], permission: "onboarding.view" },
                { name: "Documents",        href: "/employees/documents", icon: Files,        roles: ["ADMIN", "MANAGER", "HR_MANAGER"], permission: "documents.view" },
                { name: "Send Documents",   href: "/documents/send",      icon: SendHorizontal, roles: ["ADMIN", "MANAGER", "HR_MANAGER"], permission: "documents.view" },
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

        // ── CLIENTS & FINANCE ─────────────────────────────────────────────────
        {
            title: "CLIENTS & FINANCE",
            links: [
                { name: "Companies",    href: "/companies", icon: Building2,     roles: ["ADMIN", "MANAGER"], permission: "companies.view" },
                { name: "Billing",      href: "/billing",   icon: Receipt,       roles: ["ADMIN", "MANAGER"], permission: "billing.view" },
                { name: "Contracts",    href: "/contracts", icon: FileSignature, roles: ["ADMIN", "MANAGER"], permission: "contracts.view" },
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
                { name: "Clients",          href: "/admin/clients", icon: Building2,  roles: ["ADMIN"] },
                { name: "Roles",            href: "/admin/roles",   icon: Shield,     roles: ["ADMIN"] },
                { name: "Wage Rule Book",   href: "/admin/rule-book", icon: BookOpen, roles: ["ADMIN"] },
                { name: "Doc Types",        href: "/documents/types", icon: FolderOpen, roles: ["ADMIN"], permission: "documents.view" },
            ],
        },

        // ── INSPECTION BOY — MY WORK ──────────────────────────────────────────
        {
            title: "MY WORK",
            links: [
                { name: "My Assignments",   href: "/assignments",    icon: HardHat,      roles: ["INSPECTION_BOY"] },
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

        // ── CLIENT — REPORTS ─────────────────────────────────────────────────
        {
            title: "REPORTS",
            links: [
                { name: "Reports",  href: "/reports", icon: BarChart2, roles: ["CLIENT"] },
            ],
        },
    ]

    return (
        <div className="sidebar-dark flex h-full w-[230px] flex-col bg-[var(--surface)] border-r border-[var(--border)] overflow-hidden">

            {/* ── Logo / Header ── */}
            <div className="flex h-[54px] items-center justify-between px-4 border-b border-[var(--border)] shrink-0">
                <Link href="/" className="flex items-center gap-2.5">
                    <div className="h-8 w-8 bg-[var(--accent)] rounded-[6px] flex items-center justify-center text-white">
                        <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 3h18v18H3z" />
                            <path d="M18 9h-6v6h6v-3h-3" />
                        </svg>
                    </div>
                    <span className="font-bold text-[16px] tracking-tight text-[var(--text)]">Growus Auto</span>
                </Link>
                {onMobileClose && (
                    <button onClick={onMobileClose} className="p-1 md:hidden hover:bg-[var(--surface2)] rounded-md transition-colors text-[var(--text3)]">
                        <X size={20} />
                    </button>
                )}
            </div>

            {/* ── Navigation ── */}
            <div className="flex-1 overflow-y-auto pt-4 px-2 scrollbar-thin">
                {navigation.map((section) => {
                    const currentRole = String(role || "")

                    const filteredLinks = section.links.filter(link => {
                        if (currentRole === "ADMIN") return true

                        // Everything is gated PURELY by custom-role permissions now.
                        // No hardcoded role (MANAGER/HR_MANAGER/INSPECTION_BOY/CLIENT)
                        // grants anything — Admin → Roles is the single source of truth.
                        if (link.permission) return userPermissions.includes(link.permission)

                        // No universal exceptions: a link without a permission is
                        // hidden for everyone except ADMIN. Access is governed
                        // solely by custom-role permissions.
                        return false
                    })

                    if (filteredLinks.length === 0) return null

                    return (
                        <div key={section.title} className="mb-5">
                            <h3 className="px-3 mb-1.5 text-[10px] font-semibold text-[var(--text3)] tracking-[0.7px] uppercase">
                                {section.title}
                            </h3>
                            <nav className="space-y-0.5">
                                {filteredLinks.map((link) => {
                                    const Icon = link.icon
                                    const hasSubLinks = !!link.subLinks && link.subLinks.length > 0
                                    const isSubActive  = hasSubLinks && link.subLinks!.some(sub => pathname === sub.href || (sub.href !== "/" && pathname.startsWith(sub.href)))
                                    const isItemActive = pathname === link.href
                                        || (link.href !== "/" && pathname.startsWith(link.href))
                                        || (link.matchPrefixes?.some(p => pathname === p || pathname.startsWith(p + "/")) ?? false)
                                    const showSub = isSubActive || isItemActive

                                    return (
                                        <div key={`${link.href}-${link.name}`} className="flex flex-col gap-0.5">
                                            <Link
                                                href={link.href}
                                                onClick={onMobileClose}
                                                className={cn(
                                                    "flex items-center justify-between rounded-[8px] px-[10px] py-[7.5px] text-[13px] transition-all group",
                                                    isItemActive && !hasSubLinks
                                                        ? "bg-[var(--accent-light)] text-[var(--accent-text)] font-medium"
                                                        : (isSubActive || isItemActive)
                                                            ? "bg-[var(--surface2)] text-[var(--text)] font-medium"
                                                            : "text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)]"
                                                )}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <Icon
                                                        size={16}
                                                        className={cn(
                                                            isItemActive || isSubActive
                                                                ? "text-[var(--accent-text)]"
                                                                : "text-[var(--text3)] group-hover:text-[var(--text2)]"
                                                        )}
                                                    />
                                                    {link.name}
                                                </div>
                                                {hasSubLinks && (
                                                    <ChevronRight size={13} className={cn("transition-transform text-[var(--text3)]", showSub && "rotate-90")} />
                                                )}
                                                {link.badge && pendingCount > 0 && (
                                                    <div className="h-[17px] min-w-[17px] rounded-full bg-[var(--red)] text-white text-[10px] font-bold flex items-center justify-center px-1">
                                                        {pendingCount}
                                                    </div>
                                                )}
                                            </Link>

                                            {hasSubLinks && showSub && (
                                                <div className="flex flex-col gap-0.5 ml-4 border-l border-[var(--border)] pl-3 my-0.5">
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
                                                                        ? "bg-[var(--accent-light)] text-[var(--accent-text)] font-medium"
                                                                        : "text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)]"
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
            <div className="px-5 py-4 border-t border-[var(--border)] mt-auto">
                <div className="flex flex-col gap-1">
                    <p className="text-[10.5px] text-[var(--text3)]">v1.1.2 · Growus Auto</p>
                    <Link href="/terms" className="text-[10.5px] text-[var(--text3)] hover:text-[var(--text2)]">Terms & Conditions</Link>
                </div>
            </div>
        </div>
    )
}
