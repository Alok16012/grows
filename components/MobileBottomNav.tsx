"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { LayoutDashboard, UserCheck, Wallet, BarChart2, Clock, HardHat, User, Menu, type LucideIcon } from "lucide-react"

/**
 * Zavtoo-style floating bottom navigation for phones.
 *
 * On a phone the only way around the app used to be the hamburger → full
 * sidebar drawer, two taps and a long scroll for anything. This puts the four
 * places a person actually lives one tap away, in the floating pill Zavtoo
 * uses, and "More" opens the same sidebar for everything else — so nothing
 * becomes unreachable.
 *
 * The four are picked by who is signed in: an inspector gets their
 * assignments, attendance and profile; office staff get the modules their
 * permissions allow, in priority order. Visibility follows the sidebar's rule
 * exactly (ADMIN sees all; everyone else by permission), so the bar can never
 * offer a page the sidebar would hide.
 */

type Item = { label: string; href: string; icon: LucideIcon; perms?: string[] }

// Office staff, most-used first. The first three the user may open are shown.
const STAFF: Item[] = [
    { label: "Employees",  href: "/employees",  icon: UserCheck, perms: ["employees.view"] },
    { label: "Payroll",    href: "/payroll",    icon: Wallet,    perms: ["payroll.view"] },
    { label: "Reports",    href: "/reports",    icon: BarChart2, perms: ["reports.view"] },
    { label: "Attendance", href: "/attendance", icon: Clock,     perms: ["attendance.view"] },
]

// Field inspectors.
const INSPECTOR: Item[] = [
    { label: "Assignments", href: "/inspection", icon: HardHat, perms: ["inspection.view", "inspection.submit", "inspection.history"] },
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

    const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/")

    return (
        // Floats over the content with no backdrop of its own — only the pill
        // is solid, exactly as in Zavtoo. Hidden from md up, where the sidebar
        // is always visible.
        <div className="no-print md:hidden" style={{
            // Below the sidebar drawer's overlay (z-40) and drawer (z-50), so
            // opening "More" covers the bar instead of the bar poking through.
            position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30,
            padding: "0 12px calc(10px + env(safe-area-inset-bottom))",
            pointerEvents: "none",
        }}>
            <nav aria-label="Primary" style={{
                display: "flex", alignItems: "stretch",
                background: "rgba(255,255,255,0.94)",
                backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
                borderRadius: 999, padding: 4,
                boxShadow: "0 8px 24px rgba(15,23,41,0.14)",
                pointerEvents: "auto",
            }}>
                {items.map(item => {
                    const on = isActive(item.href)
                    const color = on ? "var(--accent)" : "var(--text)"
                    const Icon = item.icon
                    return (
                        <Link key={item.href} href={item.href} aria-current={on ? "page" : undefined}
                            style={{
                                flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                                gap: 2, padding: "7px 0 6px", borderRadius: 999, textDecoration: "none",
                                background: on ? "var(--accent-light)" : "transparent", transition: "background 0.2s",
                                minWidth: 0,
                            }}>
                            <Icon size={20} color={color} strokeWidth={on ? 2.4 : 2} aria-hidden="true" />
                            <span style={{ fontSize: 10.5, fontWeight: on ? 600 : 500, color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                                {item.label}
                            </span>
                        </Link>
                    )
                })}
                <button type="button" onClick={onMore} aria-label="More — open the full menu"
                    style={{
                        flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        gap: 2, padding: "7px 0 6px", borderRadius: 999, border: "none", background: "transparent", cursor: "pointer",
                    }}>
                    <Menu size={20} color="var(--text)" aria-hidden="true" />
                    <span style={{ fontSize: 10.5, fontWeight: 500, color: "var(--text)" }}>More</span>
                </button>
            </nav>
        </div>
    )
}
