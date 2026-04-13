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
    FolderOpen
} from "lucide-react"

export function Sidebar({ onMobileClose }: { onMobileClose?: () => void }) {
    const pathname = usePathname()
    const { data: session } = useSession()
    const role = session?.user?.role as string | undefined

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

    const navigation = [
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
                { name: "Branches", href: "/branches", icon: MapPin, roles: ["ADMIN", "MANAGER"] },
                { name: "Departments", href: "/departments", icon: Briefcase, roles: ["ADMIN", "MANAGER"] },
                { name: "Projects", href: "/projects", icon: Folder, roles: [] },
                { name: "Assignments", href: "/assignments", icon: HardHat, roles: ["ADMIN", "MANAGER"] },
                { name: "Groups", href: "/groups", icon: Users2, roles: ["ADMIN", "MANAGER"] },
                { name: "Recruitment", href: "/recruitment", icon: Target, roles: ["ADMIN", "MANAGER"] },
                { name: "Employees", href: "/employees", icon: UserCheck, roles: ["ADMIN", "MANAGER", "HR_MANAGER"] },
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
                { name: "Attendance", href: "/attendance", icon: Clock, roles: ["ADMIN", "MANAGER"] },
                { name: "Leaves", href: "/leaves", icon: CalendarOff, roles: ["ADMIN", "MANAGER"] },
                { name: "Payroll", href: "/payroll", icon: Wallet, roles: ["ADMIN", "MANAGER"] },
                { name: "Upload Attendance", href: "/attendance/upload", icon: Upload, roles: ["ADMIN", "MANAGER"] },
                { name: "Compliance", href: "/payroll/compliance", icon: ShieldCheck, roles: ["ADMIN", "MANAGER"] },
                { name: "Reports & Downloads", href: "/payroll/reports", icon: FileDown, roles: ["ADMIN", "MANAGER"] },
                { name: "Assets", href: "/assets", icon: Package, roles: ["ADMIN", "MANAGER"] },
                { name: "Expenses", href: "/expenses", icon: CreditCard, roles: ["ADMIN", "MANAGER"] },
            ]
        },
        {
            title: "PEOPLE OPS",
            links: [
                { name: "Onboarding", href: "/onboarding", icon: ClipboardList, roles: ["ADMIN", "MANAGER"] },
                { name: "Performance", href: "/performance", icon: Star, roles: ["ADMIN", "MANAGER"] },
                { name: "Exit", href: "/exit", icon: LogOut, roles: ["ADMIN", "MANAGER"] },
                { name: "LMS", href: "/lms", icon: GraduationCap, roles: ["ADMIN", "MANAGER"] },
                { name: "My Learning", href: "/lms/learn", icon: GraduationCap, roles: ["ADMIN", "MANAGER", "INSPECTION_BOY"] },
                { name: "My Profile", href: "/profile", icon: UserCheck, roles: ["INSPECTION_BOY"] },
            ]
        },
        {
            title: "DOCUMENTS",
            links: [
                { name: "Documents", href: "/documents", icon: FileText, roles: ["ADMIN", "MANAGER", "HR_MANAGER", "INSPECTION_BOY"] },
                { name: "Doc Types", href: "/documents/types", icon: FolderOpen, roles: ["ADMIN", "HR_MANAGER"] },
            ]
        },
        {
            title: "SUPPORT",
            links: [
                { name: "Helpdesk", href: "/helpdesk", icon: Headphones, roles: ["ADMIN", "MANAGER"] },
            ]
        },
        {
            title: "ANALYTICS",
            links: [
                { name: "Analytics", href: "/manager/analytics", icon: TrendingUp, roles: ["ADMIN", "MANAGER"] },
                { name: "Reports", href: "/reports", icon: BarChart2, roles: ["ADMIN", "MANAGER", "INSPECTION_BOY"] },
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
            <div className="flex-1 overflow-y-auto pt-4 px-2 scrollbar-thin" suppressHydrationWarning>
                {navigation.map((section) => {
                    const currentRole = String(role || "")
                    const filteredLinks = section.links.filter(link =>
                        currentRole ? link.roles.includes(currentRole) : link.roles.includes("ADMIN")
                    )
                    if (filteredLinks.length === 0) return null

                    return (
                        <div key={section.title} className="mb-6">
                            <h3 className="px-3 mb-2 text-[10.5px] font-semibold text-[var(--text3)] tracking-[0.6px] uppercase">
                                {section.title}
                            </h3>
                            <nav className="space-y-0.5">
                                {filteredLinks.map((link) => {
                                    const Icon = link.icon
                                    const isActive = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href))

                                    return (
                                        <Link
                                            key={link.href}
                                            href={link.href}
                                            onClick={onMobileClose}
                                            className={cn(
                                                "flex items-center justify-between rounded-[8px] px-[10px] py-[8px] text-[13px] transition-all group",
                                                isActive
                                                    ? "bg-[var(--accent-light)] text-[var(--accent-text)] font-medium"
                                                    : "text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)]"
                                            )}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Icon size={18} className={cn(isActive ? "text-[var(--accent-text)]" : "text-[var(--text3)] group-hover:text-[var(--text2)]")} />
                                                {link.name}
                                            </div>
                                            {link.badge && pendingCount > 0 && (
                                                <div className="h-[18px] min-w-[18px] rounded-full bg-[var(--red)] text-white text-[10px] font-bold flex items-center justify-center px-1">
                                                    {pendingCount}
                                                </div>
                                            )}
                                        </Link>
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
