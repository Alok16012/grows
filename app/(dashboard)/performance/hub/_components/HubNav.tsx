"use client"
// Performance Hub navigation + page shell used by every hub page.
//
//   My work         → My DWM Reports · Registers · My Performance  (everyone)
//   Team            → Review Queue · Team Dashboard                (performance.view, or anyone who reviews)
//   Administration  → KPI Designer · Register Designer · People & Roles (performance.manage)
import { useEffect, useState } from "react"
import type React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import {
    ArrowLeft, ClipboardList, Database, Gauge, Inbox, LayoutDashboard, Target, TableProperties, UserCog,
} from "lucide-react"
import { can } from "@/lib/can"
import { api, SetupNotice, type ReportRow } from "./shared"

/** Fired after a report is approved / returned so the queue badge refreshes. */
export const QUEUE_CHANGED = "perfhub:queue-changed"
export const queueChanged = () => window.dispatchEvent(new Event(QUEUE_CHANGED))

type NavItem = { href: string; label: string; icon: React.ReactNode; badge?: number }

export function useHubPerms() {
    const { data: session, status } = useSession()
    const canManage = can(session, "performance.manage")
    const canView = can(session, "performance.view") || canManage
    return { session, status, canManage, canView }
}

export function HubNav() {
    const pathname = usePathname()
    const { status, canManage, canView } = useHubPerms()
    const [queue, setQueue] = useState<number | null>(null)
    const [reviewer, setReviewer] = useState(false)

    useEffect(() => {
        if (status !== "authenticated") return
        let live = true
        const load = () => api<{ reports: ReportRow[]; reviewer?: boolean }>("/reports?scope=queue&status=SUBMITTED")
            .then(d => { if (live) { setQueue(d?.reports?.length ?? 0); setReviewer(!!d?.reviewer) } })
            .catch(() => { if (live) setQueue(0) })
        load()
        // Approve / return elsewhere on the page changes the count.
        window.addEventListener(QUEUE_CHANGED, load)
        return () => { live = false; window.removeEventListener(QUEUE_CHANGED, load) }
    }, [status])

    const groups: { title: string; items: NavItem[] }[] = [
        {
            title: "My work",
            items: [
                { href: "/performance/hub/reports", label: "My DWM Reports", icon: <ClipboardList size={14} /> },
                { href: "/performance/hub/registers", label: "Registers", icon: <Database size={14} /> },
                { href: "/performance/hub/me", label: "My Performance", icon: <Gauge size={14} /> },
            ],
        },
    ]
    if (canView || reviewer || (queue ?? 0) > 0) {
        groups.push({
            title: "Team",
            items: [
                { href: "/performance/hub/review", label: "Review Queue", icon: <Inbox size={14} />, badge: queue ?? undefined },
                { href: "/performance/hub/team", label: "Team Dashboard", icon: <LayoutDashboard size={14} /> },
            ],
        })
    }
    if (canManage) {
        groups.push({
            title: "Administration",
            items: [
                { href: "/performance/hub/designer", label: "KPI Designer", icon: <Target size={14} /> },
                { href: "/performance/hub/registers-designer", label: "Register Designer", icon: <TableProperties size={14} /> },
                { href: "/performance/hub/people", label: "People & Roles", icon: <UserCog size={14} /> },
            ],
        })
    }

    const active = (href: string) => pathname === href || pathname.startsWith(href + "/")

    return (
        <div className="z-tabs-wrap" style={{ marginBottom: 20 }}>
            {/* Up to 9 tabs in three groups: on laptop widths they wrap instead of
                hiding Administration behind a scrollbar-less horizontal scroll. */}
            <div className="z-tabs lg:!flex-wrap lg:!min-w-0 lg:!rounded-2xl" role="navigation" aria-label="Performance Hub">
                {groups.map((g, gi) => (
                    <div key={g.title} className="flex items-center gap-1">
                        {gi > 0 && <span className="w-px h-5 bg-[var(--border)] mx-1.5" aria-hidden />}
                        <span className="hidden md:inline px-2 text-[10px] font-semibold uppercase tracking-[0.6px] text-[var(--text3)]">{g.title}</span>
                        {g.items.map(it => (
                            <Link key={it.href} href={it.href} className={`z-tab ${active(it.href) ? "is-active" : ""}`} aria-current={active(it.href) ? "page" : undefined}>
                                {it.icon} {it.label}
                                {!!it.badge && (
                                    <span className={`ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold inline-flex items-center justify-center ${active(it.href) ? "bg-white/25 text-white" : "bg-[var(--amber-light)] text-[var(--amber)]"}`}>
                                        {it.badge}
                                    </span>
                                )}
                            </Link>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    )
}

/** Page frame: back link, title, actions, hub nav, then the body (or the setup notice on 503). */
export function HubShell({ title, subtitle, actions, missing, children, back }: {
    title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode
    missing?: boolean; children: React.ReactNode
    back?: { href: string; label: string }
}) {
    return (
        <div className="px-4 py-5 sm:px-7 sm:py-6 min-h-screen">
            <Link href={back?.href ?? "/performance"} className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text3)] hover:text-[var(--accent)] mb-2">
                <ArrowLeft size={13} /> {back?.label ?? "Performance reviews"}
            </Link>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
                <div className="min-w-0">
                    <h1 className="text-[24px] sm:text-[26px] font-bold text-[var(--text)] tracking-[-0.5px] leading-tight">{title}</h1>
                    {subtitle && <p className="text-[13.5px] text-[var(--text3)] mt-1">{subtitle}</p>}
                </div>
                {actions && !missing && <div className="page-actions">{actions}</div>}
            </div>
            <HubNav />
            {missing ? <SetupNotice /> : children}
        </div>
    )
}
