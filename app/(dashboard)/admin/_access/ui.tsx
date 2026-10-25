"use client"
// Shared pieces of the Role & User Manager screens (Roles, Role editor, Users,
// Create / Edit user, Audit log).

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, ShieldAlert } from "lucide-react"
import { SCOPE_INFO, type DataScope } from "@/lib/permission-catalogue"

export {
    api, ApiError, qs, Card, CardHead, Loading, Empty, Modal, Label, inputCls, filterCls,
    btnPrimary, btnGhost, btnDanger, btnSmall, btnIcon, thCls, tdCls, fmtDate,
} from "../../performance/hub/_components/shared"

export type RoleCard = {
    id: string; name: string; description: string | null; color: string; isActive: boolean; isSystem: boolean
    scope: DataScope | null; legacy: boolean; permissions: string[]; permissionCount: number
    users: number; activeUsers: number; updatedAt: string | null
}

export function PageHead({ title, sub, back, right }: { title: React.ReactNode; sub?: React.ReactNode; back?: { href: string; label: string }; right?: React.ReactNode }) {
    return (
        <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
                {back && (
                    <Link href={back.href} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[var(--accent)] hover:underline mb-1.5">
                        <ArrowLeft size={13} /> {back.label}
                    </Link>
                )}
                <h1 className="text-[26px] font-bold tracking-[-0.02em] text-[var(--text)] leading-tight">{title}</h1>
                {sub && <p className="text-[13.5px] text-[var(--text2)] mt-1">{sub}</p>}
            </div>
            {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
        </div>
    )
}

/** White number card; `warn` tints it amber (e.g. "Without a role"). */
export function Stat({ label, value, warn, onClick, active }: { label: string; value: number | string | null | undefined; warn?: boolean; onClick?: () => void; active?: boolean }) {
    const Tag = onClick ? "button" : "div"
    return (
        <Tag
            {...(onClick ? { type: "button" as const, onClick } : {})}
            className={`text-left rounded-2xl border px-4 py-3.5 transition-colors ${warn
                ? "bg-[#fff8ee] border-[#f6d9a8]"
                : "bg-[var(--surface)] border-[var(--border)]"} ${onClick ? "hover:border-[var(--accent)]" : ""} ${active ? "ring-2 ring-[var(--accent)]" : ""}`}
        >
            <p className={`text-[12.5px] ${warn ? "text-[#b45309]" : "text-[var(--text2)]"}`}>{label}</p>
            <p className={`text-[26px] font-bold leading-tight mt-0.5 tabular-nums ${warn ? "text-[#b45309]" : "text-[var(--text)]"}`}>
                {value === null || value === undefined ? "—" : typeof value === "number" ? value.toLocaleString("en-IN") : value}
            </p>
        </Tag>
    )
}

export function ScopeBadge({ scope }: { scope: DataScope | null }) {
    return (
        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface2)] px-2.5 py-0.5 text-[11.5px] text-[var(--text2)] whitespace-nowrap">
            Scope: <b className="font-semibold text-[var(--accent-text)]">{scope ? SCOPE_INFO[scope].label : "All (not set)"}</b>
        </span>
    )
}

export function RoleChip({ role }: { role: { name: string; color: string; off?: boolean } | null }) {
    if (!role) return <span className="inline-flex rounded-full bg-[#fff1e0] px-2.5 py-0.5 text-[11.5px] font-semibold text-[#b45309] whitespace-nowrap">No role</span>
    return (
        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap"
            style={{ background: `${role.color}1a`, color: role.color }}
            title={role.off ? "This role is switched off" : undefined}>
            {role.name}{role.off ? " (off)" : ""}
        </span>
    )
}

export function StatusChip({ active }: { active: boolean }) {
    return active
        ? <span className="inline-flex rounded-full bg-[var(--success-light)] px-2.5 py-0.5 text-[11.5px] font-semibold text-[var(--success)]">Active</span>
        : <span className="inline-flex rounded-full bg-[var(--surface2)] px-2.5 py-0.5 text-[11.5px] font-semibold text-[var(--text2)]">Disabled</span>
}

export function NotSetUp() {
    return (
        <div className="rounded-2xl border border-[#f6d9a8] bg-[#fff8ee] p-4 flex gap-3">
            <ShieldAlert size={18} className="text-[#b45309] shrink-0 mt-0.5" />
            <div className="text-[13px] text-[#7c4a03]">
                <p className="font-semibold">Role manager tables are not installed yet</p>
                <p className="mt-0.5">Run <code className="font-mono">scripts/role-manager.sql</code> on the database. Until then roles keep working as before, but changes cannot be saved or audited.</p>
            </div>
        </div>
    )
}

export function NoAccess({ what, perm }: { what: string; perm: string }) {
    return (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center">
            <p className="text-[15px] font-semibold text-[var(--text)]">You don&apos;t have access to {what}</p>
            <p className="text-[13px] text-[var(--text2)] mt-1">Ask an admin for the <code className="font-mono">{perm}</code> permission.</p>
        </div>
    )
}

/** "98•••• 4410" — enough to recognise a number in a list, not to copy it. */
export function maskMobile(m: string | null | undefined) {
    if (!m) return "—"
    const d = m.replace(/\D/g, "")
    if (d.length < 6) return m
    return `${d.slice(0, 2)}•••• ${d.slice(-4)}`
}

/** "Today, 9:12" · "Yesterday" · "2 days ago" · "3 months ago" · "Never". */
export function ago(iso: string | null | undefined) {
    if (!iso) return "Never"
    const t = new Date(iso)
    const now = new Date()
    const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(t.toDateString()).getTime()) / 86_400_000)
    if (days <= 0) return `Today, ${t.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`
    if (days === 1) return "Yesterday"
    if (days < 30) return `${days} days ago`
    const months = Math.floor(days / 30)
    if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`
    const years = Math.floor(months / 12)
    return `${years} year${years === 1 ? "" : "s"} ago`
}

export function initials(name: string) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join("") || "?"
}

/** Multi-select list of sites with a search box. */
export function SitePicker({ sites, value, onChange }: { sites: { id: string; name: string }[]; value: string[]; onChange: (v: string[]) => void }) {
    const [q, setQ] = useState("")
    const shown = sites.filter(s => s.name.toLowerCase().includes(q.trim().toLowerCase()))
    const set = new Set(value)
    return (
        <div className="rounded-xl border border-[var(--border)]">
            <input className="w-full px-3 py-2 text-[13px] border-b border-[var(--border)] rounded-t-xl outline-none" placeholder="Search sites" value={q} onChange={e => setQ(e.target.value)} />
            <div className="max-h-48 overflow-y-auto p-1">
                {shown.map(s => (
                    <label key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--surface2)] text-[13px] text-[var(--text)] cursor-pointer">
                        <input type="checkbox" checked={set.has(s.id)} className="accent-[var(--accent)]"
                            onChange={e => onChange(e.target.checked ? [...value, s.id] : value.filter(x => x !== s.id))} />
                        {s.name}
                    </label>
                ))}
                {shown.length === 0 && <p className="px-2 py-3 text-[12.5px] text-[var(--text3)]">No sites match.</p>}
            </div>
            <p className="px-3 py-1.5 text-[11.5px] text-[var(--text3)] border-t border-[var(--border)]">{value.length} selected</p>
        </div>
    )
}
