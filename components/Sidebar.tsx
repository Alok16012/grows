"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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
    Sparkles,
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
    Upload,
    FileDown,
    FolderOpen,
    BookOpen,
    Files,
    IndianRupee,
    TableProperties
} from "lucide-react"

export function Sidebar({ onMobileClose }: { onMobileClose?: () => void }) {
    const pathname = usePathname()
    const { data: session } = useSession()
    const role = session?.user?.role as string | undefined
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    const [pendingCount, setPendingCount] = useState(0)

    useEffect(() => {
        if (role === "ADMIN" || role === "MANAGER") {
            const fetchCount = async () => {
                try {
                    const res = await fetch("/api/approvals?count=true")
                    const data = await res.json()
                    setPendingCount(data.count || 0)
                } catch (e) {
                    console.error("Failed to fetch pending count", e)
                }
            }
            fetchCount()
            const interval = setInterval(fetchCount, 60000)
            return () => clearInterval(interval)
        }
    }, [role])

    const userPermissions: string[] = (session?.user as any)?.permissions || []

    const navigation: { title: string; links: { name: string; href: string; icon: any; roles: string[]; permission?: string; badge?: boolean }[] }[] = [
        {
            title: "MAIN",
            links: [
                { name: "Dashboard", href: role === "INSPECTION_BOY" ? "/inspection" : role === "MANAGER" ? "/manager" : "/admin", icon: LayoutDashboard, roles: ["ADMIN", "MANAGER", "INSPECTION_BOY"] },
                { name: "Client Portal", href: "/client", icon: FileText, roles: ["CLIENT"] },
            ]
        },
        {
            title: "MANAGEMENT",
            links: [
                { name: "Companies", href: "/companies", icon: Building2, roles: ["ADMIN", "MANAGER"] },
                { name: "Departments", href: "/departments", icon: Briefcase, roles: ["ADMIN", "MANAGER"] },
                { name: "Projects", href: "/projects", icon: Folder, roles: [] },
                { name: "Assignments", href: "/assignments", icon: HardHat, roles: ["ADMIN", "MANAGER"] },
                { name: "Groups", href: "/groups", icon: Users2, roles: ["ADMIN", "MANAGER"] },
                { name: "Recruitment", href: "/recruitment", icon: Target, roles: ["ADMIN", "MANAGER"], permission: "recruitment.view" },
                { name: "Employees", href: "/employees", icon: UserCheck, roles: ["ADMIN", "MANAGER", "HR_MANAGER"], permission: "employees.view" },
                { name: "Employee Master", href: "/employees/master", icon: TableProperties, roles: ["ADMIN", "MANAGER", "HR_MANAGER"], permission: "employees.view" },
                { name: "Master Documents", href: "/employees/documents", icon: Files, roles: ["ADMIN", "MANAGER", "HR_MANAGER"], permission: "documents.view" },
                { name: "Sites", href: "/sites", icon: MapPin, roles: ["ADMIN", "MANAGER"] },
                { name: "Field", href: "/field", icon: Navigation, roles: ["ADMIN", "MANAGER"] },
                { name: "Billing", href: "/billing", icon: Receipt, roles: ["ADMIN", "MANAGER"] },
                { name: "Contracts", href: "/contracts", icon: FileSignature, roles: ["ADMIN", "MANAGER"] },
                { name: "Approvals", href: "/approvals", icon: ClipboardCheck, roles: ["ADMIN", "MANAGER"], badge: true },
            ]
        },
        {
            title: "HR OPERATIONS",
            links: [
                { name: "Attendance", href: "/attendance", icon: Clock, roles: ["ADMIN", "MANAGER"], permission: "attendance.view" },
                { name: "Leaves", href: "/leaves", icon: CalendarOff, roles: ["ADMIN", "MANAGER"], permission: "leaves.view" },
                { 
                    name: "Payroll", 
                    href: "/payroll", 
                    icon: Wallet, 
                    roles: ["ADMIN", "MANAGER"], 
                    permission: "payroll.view",
                    subLinks: [
                        { name: "Payments Dashboard", href: "/payroll" },
                        { name: "Process Payroll", href: "/payroll/process" },
                        { name: "Site Wise Wage Sheet", href: "/payroll/wagesheet" },
                        { name: "Select Sites (Multi)", href: "/payroll/select-sites" },
                        { name: "Final Payroll (Multi Site)", href: "/payroll/final" },
                        { name: "Payslip Generation", href: "/payroll/salary-slips" },
                        { name: "Compliance Reports", href: "/payroll/compliance" },
                    ]
                },
                { name: "Upload Attendance", href: "/attendance/upload", icon: Upload, roles: ["ADMIN", "MANAGER"], permission: "attendance.manage" },
                { name: "Assets", href: "/assets", icon: Package, roles: ["ADMIN", "MANAGER"], permission: "assets.view" },
                { name: "Expenses", href: "/expenses", icon: CreditCard, roles: ["ADMIN", "MANAGER"] },
            ]
        },
        {
            title: "PEOPLE OPS",
            links: [
                { name: "Onboarding", href: "/onboarding", icon: ClipboardList, roles: ["ADMIN", "MANAGER"], permission: "onboarding.view" },
                { name: "Performance", href: "/performance", icon: Star, roles: ["ADMIN", "MANAGER"], permission: "performance.view" },
                { name: "Exit", href: "/exit", icon: LogOut, roles: ["ADMIN", "MANAGER"] },
                { name: "LMS", href: "/lms", icon: GraduationCap, roles: ["ADMIN", "MANAGER"], permission: "lms.manage" },
                { name: "My Learning", href: "/lms/learn", icon: GraduationCap, roles: ["ADMIN", "MANAGER", "INSPECTION_BOY"], permission: "lms.view" },
                { name: "My Profile", href: "/profile", icon: UserCheck, roles: ["INSPECTION_BOY"] },
            ]
        },
        {
            title: "DOCUMENTS",
            links: [
                { name: "Documents", href: "/documents", icon: FileText, roles: ["ADMIN", "MANAGER", "HR_MANAGER", "INSPECTION_BOY"], permission: "documents.view" },
                { name: "Doc Types", href: "/documents/types", icon: FolderOpen, roles: ["ADMIN", "HR_MANAGER"], permission: "documents.view" },
            ]
        },
        {
            title: "SUPPORT",
            links: [
                { name: "Helpdesk", href: "/helpdesk", icon: Headphones, roles: ["ADMIN", "MANAGER"], permission: "helpdesk.view" },
            ]
        },
        {
            title: "ANALYTICS",
            links: [
                { name: "Analytics", href: "/manager/analytics", icon: TrendingUp, roles: ["ADMIN", "MANAGER"], permission: "reports.view" },
                { name: "Reports", href: "/reports", icon: BarChart2, roles: ["ADMIN", "MANAGER", "INSPECTION_BOY"], permission: "reports.view" },
            ]
        },
        {
            title: "CONFIGURATION",
            links: [
                { name: "Users", href: "/admin/users", icon: Users, roles: ["ADMIN"] },
                { name: "Roles", href: "/admin/roles", icon: Shield, roles: ["ADMIN"] },
                { name: "Reports", href: "/reports", icon: BarChart2, roles: ["CLIENT"] },
            ]
        }
    ]

    return (
        <div className="flex h-full w-[230px] flex-col bg-[var(--surface)] border-r border-[var(--border)] overflow-hidden">
            {/* Header / Logo */}
            <div className="flex h-[54px] items-center justify-between px-4 border-b border-[var(--border)] shrink-0">
                <Link href="/" className="flex items-center gap-2.5">
                    <div className="h-8 w-8 bg-[var(--accent)] rounded-[6px] flex items-center justify-center text-white">
                        <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            {/* Square Frame */}
                            <path d="M3 3h18v18H3z" />
                            {/* The 'G' shape inside */}
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

            {/* Navigation */}
            <div className="flex-1 overflow-y-auto pt-4 px-2 scrollbar-thin">
                {mounted && navigation.map((section) => {
                    const currentRole = String(role || "")
                    const filteredLinks = section.links.filter(link => {
                        // ADMIN sees everything
                        if (currentRole === "ADMIN") return true
                        // If user has a custom role AND the link has a permission key:
                        // use ONLY the custom permissions — no system role fallback
                        // This ensures "Quality Engineer" (4 perms) sees less than "HR RECRUITER" (18 perms)
                        if (link.permission && userPermissions.length > 0) {
                            return userPermissions.includes(link.permission)
                        }
                        // No custom role (or link has no permission key): use system role
                        return link.roles.includes(currentRole)
                    })
                    if (filteredLinks.length === 0) return null

                    return (
                        <div key={section.title} className="mb-6">
                            <h3 className="px-3 mb-2 text-[10.5px] font-semibold text-[var(--text3)] tracking-[0.6px] uppercase">
                                {section.title}
                            </h3>
                            <nav className="space-y-0.5">
                                    const hasSubLinks = !!link.subLinks && link.subLinks.length > 0
                                    const isSubActive = hasSubLinks && link.subLinks!.some(sub => pathname === sub.href || (sub.href !== "/" && pathname.startsWith(sub.href)))
                                    const isItemActive = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href))
                                    const showSub = isSubActive || isItemActive

                                    return (
                                        <div key={link.href} className="flex flex-col gap-0.5">
                                            <Link
                                                href={link.href}
                                                onClick={onMobileClose}
                                                className={cn(
                                                    "flex items-center justify-between rounded-[8px] px-[10px] py-[8px] text-[13px] transition-all group",
                                                    isItemActive && !hasSubLinks
                                                        ? "bg-[var(--accent-light)] text-[var(--accent-text)] font-medium"
                                                        : (isSubActive || isItemActive)
                                                            ? "bg-[var(--surface2)] text-[var(--text)] font-medium"
                                                            : "text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)]"
                                                )}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <Icon size={18} className={cn(isItemActive || isSubActive ? "text-[var(--accent-text)]" : "text-[var(--text3)] group-hover:text-[var(--text2)]")} />
                                                    {link.name}
                                                </div>
                                                {hasSubLinks && (
                                                    <ChevronRight 
                                                        size={14} 
                                                        className={cn("transition-transform text-[var(--text3)]", showSub && "rotate-90")} 
                                                    />
                                                )}
                                                {link.badge && pendingCount > 0 && (
                                                    <div className="h-[18px] min-w-[18px] rounded-full bg-[var(--red)] text-white text-[10px] font-bold flex items-center justify-center px-1">
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

            {/* Upgrade Box */}
            <div className="px-3 mb-4">
                <div className="bg-[var(--surface2)] border border-[var(--border)] rounded-[12px] p-4 text-center">
                    <div className="flex justify-center mb-2">
                        <div className="h-8 w-8 bg-white border border-[var(--border)] rounded-full flex items-center justify-center text-[var(--amber)] shadow-sm">
                            <Sparkles size={16} fill="currentColor" />
                        </div>
                    </div>
                    <p className="text-[12px] font-medium text-[var(--text)] mb-1">Scale your inspections</p>
                    <p className="text-[11px] text-[var(--text2)] mb-3">Upgrade for unlimited devices</p>
                    <button className="w-full h-8 bg-white border border-[var(--border)] text-[11px] font-semibold text-[var(--text)] rounded-[6px] hover:bg-white shadow-sm transition-all active:scale-95">
                        Upgrade Pro
                    </button>
                </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-[var(--border)] mt-auto">
                <div className="flex flex-col gap-1">
                    <p className="text-[10.5px] text-[var(--text3)]">v1.1.2 · Dashboard</p>
                    <Link href="/terms" className="text-[10.5px] text-[var(--text3)] hover:text-[var(--text2)]">Terms & Conditions</Link>
                </div>
            </div>
        </div>
    )
}
