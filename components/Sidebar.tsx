"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { LayoutDashboard, Users, ClipboardList, ShieldCheck, UserCircle, LogOut, Building2, FolderOpen, ClipboardCheck, FileText, X, Folder, HardHat, BarChart2, Users2 } from "lucide-react"

export function Sidebar({ onMobileClose }: { onMobileClose?: () => void }) {
    const pathname = usePathname()
    const { data: session } = useSession()
    const role = session?.user?.role

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

    const links = [
        // ADMIN LINKS
        { name: "Dashboard", href: "/admin", icon: LayoutDashboard, roles: ["ADMIN"] },
        { name: "Companies", href: "/companies", icon: Building2, roles: ["ADMIN", "MANAGER", "INSPECTION_BOY"] },
        { name: "Projects", href: "/projects", icon: Folder, roles: ["ADMIN", "MANAGER"] },
        { name: "Assignments", href: "/assignments", icon: HardHat, roles: ["ADMIN", "MANAGER"] },
        { name: "Groups", href: "/groups", icon: Users2, roles: ["ADMIN", "MANAGER"] },
        { name: "Approvals", href: "/approvals", icon: ClipboardCheck, roles: ["ADMIN", "MANAGER"], badge: true },
        { name: "Users", href: "/admin/users", icon: Users, roles: ["ADMIN"] },

        // MANAGER LINKS
        { name: "Dashboard", href: "/manager", icon: LayoutDashboard, roles: ["MANAGER"] },

        // INSPECTOR LINKS
        { name: "My Dashboard", href: "/inspection", icon: LayoutDashboard, roles: ["INSPECTION_BOY"] },

        // REPORTS LINKS
        { name: "Reports", href: "/reports", icon: BarChart2, roles: ["ADMIN", "MANAGER"] },
        { name: "Company Reports", href: "/reports", icon: BarChart2, roles: ["CLIENT", "INSPECTION_BOY"] },

        // CLIENT LINKS
        { name: "Client Portal", href: "/client", icon: FileText, roles: ["CLIENT"] },
    ]

    // Filter links based on role and remove duplicates (some roles share links but with different names/orders)
    const filteredLinks = links.filter((link) =>
        role && link.roles.includes(role)
    )

    return (
        <div className="flex h-full flex-col bg-white border-r">
            <div className="flex h-16 items-center justify-between px-6 border-b shrink-0">
                <Link href="/" className="flex items-center gap-2 font-bold text-xl text-primary">
                    <ShieldCheck className="h-7 w-7" />
                    <span className="tracking-tight">CIMS</span>
                </Link>
                {onMobileClose && (
                    <button onClick={onMobileClose} className="p-2 md:hidden hover:bg-muted rounded-md transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto py-6 px-4">
                <nav className="space-y-1">
                    {filteredLinks.map((link) => {
                        const Icon = link.icon
                        const isActive = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href))
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                onClick={onMobileClose}
                                className={cn(
                                    "flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all group",
                                    isActive
                                        ? "bg-primary text-primary-foreground shadow-sm"
                                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <Icon className={cn("h-4.5 w-4.5", isActive ? "" : "text-muted-foreground/70 group-hover:text-accent-foreground")} />
                                    {link.name}
                                </div>
                                {link.badge && pendingCount > 0 && (
                                    <Badge className={cn(
                                        "h-5 min-w-[20px] rounded-full px-1 text-[10px] flex items-center justify-center border-none",
                                        isActive ? "bg-white text-primary" : "bg-primary text-white"
                                    )}>
                                        {pendingCount}
                                    </Badge>
                                )}
                            </Link>
                        )
                    })}
                </nav>
            </div>

            <div className="p-4 border-t bg-muted/20">
                <div className="flex flex-col gap-1 px-2 mb-4">
                    <p className="text-sm font-semibold truncate leading-none mb-1">{session?.user?.name}</p>
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{role?.replace("_", " ")}</p>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-10 px-3"
                    onClick={() => signOut({ callbackUrl: "/login" })}
                >
                    <LogOut className="h-4 w-4" />
                    <span className="font-medium">Sign Out</span>
                </Button>
            </div>
        </div>
    )
}
