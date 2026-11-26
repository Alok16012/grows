"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { cn } from "@/lib/utils"
import { LayoutDashboard, UserCheck, Wallet, BarChart2, Clock, CalendarOff, HardHat, User, Menu, type LucideIcon } from "lucide-react"

type Item = { label: string; href: string; icon: LucideIcon; perms?: string[] }

// Staff shortcuts take priority, followed by self-service pages the user can open.
const STAFF: Item[] = [
    { label: "Employees",  href: "/employees",  icon: UserCheck, perms: ["employees.view"] },
    { label: "Payroll",    href: "/payroll",    icon: Wallet,    perms: ["payroll.view"] },
    { label: "Reports",    href: "/reports",    icon: BarChart2, perms: ["reports.view"] },
    { label: "Attendance", href: "/attendance", icon: Clock,       perms: ["attendance.view", "self.view"] },
    { label: "Leave",      href: "/leaves",     icon: CalendarOff, perms: ["self.view"] },
    { label: "Profile",    href: "/profile",    icon: User,        perms: ["self.view"] },
]

// Field inspectors.
const INSPECTOR: Item[] = [
    // "Assignments" is cut to "Assignmen…" in a five-item bar on a 375px phone.
    { label: "My Work",     href: "/inspection", icon: HardHat, perms: ["inspection.view", "inspection.submit", "inspection.history"] },
    { label: "Attendance",  href: "/attendance", icon: Clock,   perms: ["self.view"] },
    { label: "Profile",     href: "/profile",    icon: User,    perms: ["self.view"] },
]

/** Routes with a fixed action bar of their own at the bottom of the screen. */
const HIDE_ON = [/^\/inspection\/[^/]+\/form/]

export function MobileBottomNav({ onMore }: { onMore: () => void }) {
    const pathname = usePathname() ?? ""
    const { data: session } = useSession()
    const role = String((session?.user as any)?.role ?? "")
    const perms: string[] = (session?.user as any)?.permissions ?? []

    if (!session || HIDE_ON.some(r => r.test(pathname))) return null

    const allowed = (i: Item) => role === "ADMIN" || !i.perms || i.perms.some(p => perms.includes(p))
    // An inspector is anyone who files inspections and doesn't run the office.
    const isInspector = role === "INSPECTION_BOY"
        || (role !== "ADMIN" && perms.some(p => p.startsWith("inspection.")) && !perms.includes("employees.view"))

    const home: Item = { label: "Home", href: role === "ADMIN" ? "/admin" : "/dashboard", icon: LayoutDashboard }
    const items = [home, ...(isInspector ? INSPECTOR : STAFF).filter(allowed).slice(0, 3)]

    const isActive = (href: string) => pathname === href || (href !== home.href && pathname.startsWith(href + "/"))

    const itemClass = "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-1 text-[10px] font-medium leading-tight min-[375px]:text-[11px]"

    return (
        <nav
            aria-label="Primary"
            className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--surface)] shadow-[0_-4px_20px_rgba(15,23,41,0.07)] md:hidden"
            style={{
                padding: "4px max(8px, env(safe-area-inset-right)) calc(5px + env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left))",
            }}
        >
            <div className="mx-auto flex max-w-xl">
                {items.map(({ href, label, icon: Icon }) => {
                    const active = isActive(href)
                    return (
                        <Link
                            key={href}
                            href={href}
                            aria-current={active ? "page" : undefined}
                            className={cn(itemClass, active ? "font-semibold text-[var(--accent-text)]" : "text-[var(--text2)] hover:bg-[var(--surface2)]")}
                        >
                            <span className={cn("grid h-7 w-11 place-items-center rounded-full", active && "bg-[var(--accent-light)]")}>
                                <Icon size={19} strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
                            </span>
                            <span className="max-w-full truncate">{label}</span>
                        </Link>
                    )
                })}
                <button
                    type="button"
                    onClick={onMore}
                    aria-label="More navigation options"
                    aria-haspopup="dialog"
                    className={cn(itemClass, "text-[var(--text2)] hover:bg-[var(--surface2)]")}
                >
                    <span className="grid h-7 w-11 place-items-center">
                        <Menu size={19} aria-hidden="true" />
                    </span>
                    More
                </button>
            </div>
        </nav>
    )
}
