"use client"

// One page per area, with its old separate pages as tabs. Each tab is still its
// own route (old links and notification links keep working); this bar just
// joins them, and shows only the tabs the signed-in person may open — the same
// permissions the sidebar used for the separate links.
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { can } from "@/lib/can"

export type ModuleTab = { href: string; label: string; perms?: string[]; adminOnly?: boolean; also?: string[] }
export type ModuleGroup = { title: string; subtitle: string; tabs: ModuleTab[] }

export const MODULE_GROUPS = {
    access: {
        title: "Users & Access",
        subtitle: "Who can sign in, with which role, and how logins are used — all in one place.",
        tabs: [
            { href: "/admin/users", label: "Users", perms: ["users.view", "users.manage"] },
            { href: "/admin/employee-logins", label: "Employee logins", perms: ["users.manage"] },
            { href: "/admin/roles", label: "Roles", perms: ["roles.view"] },
            { href: "/employees/roles", label: "Role by designation", perms: ["employees.view"] },
            { href: "/admin/access", label: "Access review", perms: ["users.view", "users.manage", "audit.view"] },
            { href: "/admin/audit", label: "Audit log", perms: ["audit.view"] },
        ],
    },
    masters: {
        title: "Masters",
        subtitle: "Standard designations, departments and employment types used across the ERP.",
        tabs: [
            { href: "/employees/masters", label: "Designations & types", perms: ["employees.view"] },
            { href: "/departments", label: "Departments", adminOnly: true },
        ],
    },
    onboarding: {
        title: "Onboarding",
        subtitle: "Everyone joining — from the join link to their first site.",
        tabs: [
            { href: "/onboarding", label: "Joiners", perms: ["onboarding.view", "recruitment.view"] },
            { href: "/onboarding/checklist", label: "Checklist board", perms: ["onboarding.view", "recruitment.view"] },
            { href: "/onboarding/join-links", label: "Join links", perms: ["onboarding.view", "recruitment.view"] },
            { href: "/employees/new-joiners", label: "New joiner register", perms: ["employees.view"] },
        ],
    },
} satisfies Record<string, ModuleGroup>

export function ModuleTabs({ group }: { group: keyof typeof MODULE_GROUPS }) {
    const g: ModuleGroup = MODULE_GROUPS[group]
    const path = usePathname()
    const { data: session } = useSession()
    const isAdmin = (session?.user as any)?.role === "ADMIN"
    const visible = g.tabs.filter(t => t.adminOnly ? isAdmin : !t.perms || can(session, t.perms))
    // Longest matching href wins (so /onboarding doesn't light up on /onboarding/checklist).
    const active = [...g.tabs].sort((a, b) => b.href.length - a.href.length).find(t => path === t.href || path.startsWith(t.href + "/"))?.href
    return (
        <div className="space-y-3">
            <div>
                <h1 className="text-[24px] font-bold tracking-[-0.4px] text-[var(--text)]">{g.title}</h1>
                <p className="text-[13px] text-[var(--text3)] mt-0.5">{g.subtitle}</p>
            </div>
            {visible.length > 1 && (
                <nav className="flex gap-1 border-b border-[var(--border)] overflow-x-auto overflow-y-hidden" aria-label={g.title}>
                    {visible.map(t => {
                        const on = t.href === active
                        return (
                            <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}
                                className={`px-3.5 py-2.5 text-[13.5px] font-semibold border-b-2 whitespace-nowrap ${on ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text3)] hover:text-[var(--text)]"}`}>
                                {t.label}
                            </Link>
                        )
                    })}
                </nav>
            )}
        </div>
    )
}
