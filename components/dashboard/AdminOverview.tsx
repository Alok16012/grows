"use client"

// The admin "Operations overview" dashboard: gradient KPI tiles, tinted
// panels, and the tables below them. Pure view — the page fetches
// /api/admin/stats and hands the payload in, so this can render any snapshot.

import { useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import {
    Users, CalendarCheck, ClipboardCheck, FileCheck, ChevronRight, ChevronDown,
    ArrowUpRight, ArrowDownRight, ArrowRight, AlertTriangle, BarChart3, BarChart2,
    Box, Bell, CalendarDays, UserPlus, LogOut, Wallet, Clock, Folder,
    ClipboardList, Send, CreditCard, Loader2, CheckCircle2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useCachedFetch } from "@/lib/useCachedFetch"

// ─── Palette ─────────────────────────────────────────────────────────────────
// Each panel gets a soft tint with a matching hairline and icon chip. Local to
// the dashboard; the rest of the app keeps its tokens.

type Tone = "blue" | "mint" | "rose" | "violet" | "amber" | "white"

const TONES: Record<Tone, { card: string; chip: string; icon: string }> = {
    blue:   { card: "bg-[linear-gradient(160deg,#f1f6ff_0%,#e8f0ff_100%)] border-[#d5e3ff]", chip: "bg-[#dce8ff]", icon: "text-[#1f5fff]" },
    mint:   { card: "bg-[linear-gradient(160deg,#effcf6_0%,#e3f8ee_100%)] border-[#c8eedb]", chip: "bg-[#d3f3e3]", icon: "text-[#1f5fff]" },
    rose:   { card: "bg-[linear-gradient(160deg,#fff4f3_0%,#ffe9e7_100%)] border-[#fbd3cf]", chip: "bg-[#ffe0dc]", icon: "text-[#1f5fff]" },
    violet: { card: "bg-[linear-gradient(160deg,#f7f3ff_0%,#efe8ff_100%)] border-[#e2d6ff]", chip: "bg-[#e7ddff]", icon: "text-[#1f5fff]" },
    amber:  { card: "bg-[linear-gradient(160deg,#fffaf0_0%,#fff3dc_100%)] border-[#fbe2ad]", chip: "bg-[#ffecc4]", icon: "text-[#1f5fff]" },
    white:  { card: "bg-white border-[var(--border)]", chip: "bg-[var(--accent-light)]", icon: "text-[var(--accent)]" },
}

function Panel({ tone, className, children }: { tone: Tone; className?: string; children: React.ReactNode }) {
    return <div className={cn("rounded-[16px] border p-5", TONES[tone].card, className)}>{children}</div>
}

function PanelHead({ tone, icon: Icon, title, hint, sub, action }: {
    tone: Tone; icon: React.ElementType; title: string; hint?: string; sub?: string; action?: React.ReactNode
}) {
    return (
        <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0">
                <div className={cn("h-10 w-10 rounded-[11px] flex items-center justify-center shrink-0", TONES[tone].chip)}>
                    <Icon size={19} className={TONES[tone].icon} />
                </div>
                <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold text-[var(--text)] leading-tight truncate">
                        {title} {hint && <span className="font-normal text-[var(--text2)]">({hint})</span>}
                    </h3>
                    {sub && <p className="text-[12px] text-[var(--text2)] mt-0.5 truncate">{sub}</p>}
                </div>
            </div>
            {action}
        </div>
    )
}

function HeadLink({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <Link href={href} className="shrink-0 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#1f5fff] hover:underline mt-2.5">
            {children} <ArrowRight size={14} />
        </Link>
    )
}

// ─── Gradient KPI tile ───────────────────────────────────────────────────────

function KpiTile({ href, gradient, dark, icon: Icon, label, value, children }: {
    href: string; gradient: string; dark?: boolean; icon: React.ElementType
    label: string; value: string; children: React.ReactNode
}) {
    return (
        <div
            style={{ background: gradient }}
            className={cn(
                "relative overflow-hidden rounded-[16px] p-5 min-h-[156px] flex flex-col group transition-transform hover:-translate-y-0.5",
                "shadow-[0_10px_24px_-12px_rgba(15,23,41,0.45)]",
                dark ? "text-[#1d1a0f]" : "text-white"
            )}
        >
            {/* Whole-tile link underneath; content above ignores the pointer so
                clicks fall through, except links in `children` (pointer-events-auto).
                Avoids nesting <a> inside <a>. */}
            <Link href={href} aria-label={label} className="absolute inset-0 rounded-[16px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70" />

            {/* soft light blooms, purely decorative */}
            <span aria-hidden className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-white/10" />
            <span aria-hidden className="pointer-events-none absolute right-16 -bottom-20 h-36 w-36 rounded-full bg-white/[0.07]" />

            <div className="relative pointer-events-none flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                    <div className={cn("h-11 w-11 rounded-[12px] flex items-center justify-center", dark ? "bg-white/45" : "bg-white/20")}>
                        <Icon size={20} />
                    </div>
                    <span className="text-[15px] font-medium">{label}</span>
                </div>
                <ChevronRight size={20} className="opacity-80 group-hover:translate-x-0.5 transition-transform" />
            </div>
            <div className="relative pointer-events-none text-[38px] font-bold leading-none tabular-nums tracking-[-0.02em] mb-3">{value}</div>
            <div className="relative pointer-events-none mt-auto text-[13px]">{children}</div>
        </div>
    )
}

// ─── Charts ──────────────────────────────────────────────────────────────────

type DonutSlice = { label: string; value: number; color: string }

function Donut({ slices, centerLabel }: { slices: DonutSlice[]; centerLabel: string }) {
    const sum = slices.reduce((s, x) => s + x.value, 0)
    const R = 39
    const C = 2 * Math.PI * R
    const nonzero = slices.filter(s => s.value > 0)
    let acc = 0
    return (
        <svg viewBox="0 0 100 100" className="w-[124px] h-[124px] shrink-0" role="img" aria-label={centerLabel}>
            <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(15,23,41,0.06)" strokeWidth="14" />
            <circle cx="50" cy="50" r="31" fill="#fff" />
            {sum > 0 && nonzero.map(s => {
                const len = (s.value / sum) * C
                const dash = nonzero.length === 1 ? C : Math.max(0.8, len - 1.2)
                const el = (
                    <circle key={s.label} cx="50" cy="50" r={R} fill="none" stroke={s.color} strokeWidth="14"
                        strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-acc}
                        transform="rotate(-90 50 50)">
                        <title>{`${s.label}: ${s.value} (${Math.round((s.value / sum) * 100)}%)`}</title>
                    </circle>
                )
                acc += len
                return el
            })}
            <text x="50" y="52" textAnchor="middle" style={{ fontSize: 17, fontWeight: 700, fill: "var(--text)" }}>
                {sum.toLocaleString("en-IN")}
            </text>
            <text x="50" y="62" textAnchor="middle" style={{ fontSize: 5.6, fill: "var(--text2)", letterSpacing: 0.4 }}>
                {centerLabel}
            </text>
        </svg>
    )
}

function DonutLegend({ slices }: { slices: DonutSlice[] }) {
    const sum = slices.reduce((s, x) => s + x.value, 0)
    return (
        <div className="space-y-2.5 min-w-0 flex-1">
            {slices.map(s => (
                <div key={s.label} className="flex items-center gap-2.5 text-[13px]">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="text-[var(--text)] truncate flex-1">{s.label}</span>
                    <span className="font-semibold text-[var(--text)] tabular-nums">{s.value.toLocaleString("en-IN")}</span>
                    <span className="text-[12px] text-[var(--text3)] tabular-nums w-10 text-right">
                        {sum > 0 ? Math.round((s.value / sum) * 100) : 0}%
                    </span>
                </div>
            ))}
        </div>
    )
}

const fmtK = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "K" : String(n))

/** Vertical bars with a 3-tick y-axis and dashed gridlines; the last bar is highlighted. */
function Bars({ data, height, gap, label, tick }: {
    data: { day: string; count: number }[]; height: number; gap: number
    label: (d: { day: string; count: number }) => string
    tick: React.ReactNode
}) {
    const max = Math.max(1, ...data.map(d => d.count))
    return (
        <div>
            <div className="flex gap-2">
                <div className="flex flex-col justify-between text-[11px] text-[var(--text2)] tabular-nums shrink-0 text-right w-7 -my-1.5" style={{ height }}>
                    <span>{fmtK(max)}</span>
                    <span>{fmtK(Math.round(max / 2))}</span>
                    <span>0</span>
                </div>
                <div className="relative flex-1 border-l border-b border-[rgba(15,23,41,0.12)]" style={{ height }}>
                    <div aria-hidden className="absolute inset-x-0 top-0 border-t border-dashed border-[rgba(15,23,41,0.08)]" />
                    <div aria-hidden className="absolute inset-x-0 top-1/2 border-t border-dashed border-[rgba(15,23,41,0.08)]" />
                    <div className="absolute inset-0 flex items-end px-1.5" style={{ gap }}>
                        {data.map((d, i) => (
                            <div
                                key={d.day}
                                title={label(d)}
                                style={{ height: `${Math.max(2, (d.count / max) * 100)}%` }}
                                className={cn(
                                    "flex-1 rounded-t-[3px] transition-all",
                                    i === data.length - 1 ? "bg-[#1f5fff]" : "bg-[#8fb2ff] hover:bg-[#6d98ff]"
                                )}
                            />
                        ))}
                    </div>
                </div>
            </div>
            <div className="pl-9 mt-2">{tick}</div>
        </div>
    )
}

function Meter({ pct, className }: { pct: number; className?: string }) {
    return (
        <div className={cn("h-[8px] rounded-full bg-[#dfe6f5] overflow-hidden", className)}>
            <div className="h-full rounded-full bg-[#1f5fff] transition-all" style={{ width: `${Math.max(pct > 0 ? 2 : 0, Math.min(100, pct))}%` }} />
        </div>
    )
}

/** Attendance % for display: "—" when nobody is expected, "<1%" rather than a misleading 0% once someone is present. */
function fmtAttPct(pct: number | null | undefined, present: number): string {
    if (pct === null || pct === undefined) return "—"
    return pct === 0 && present > 0 ? "<1%" : `${pct}%`
}

/** A % delta is noise on a tiny base; below this, show the absolute change instead. */
const MIN_DELTA_BASE = 20

/** Signed % with the display capped, so 21,567% reads ">999%". */
function fmtDeltaPct(pct: number): string {
    if (pct > 999) return ">999%"
    return `${pct >= 0 ? "+" : ""}${pct}%`
}

function Initials({ name }: { name: string }) {
    const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join("") || "?"
    return (
        <span className="h-8 w-8 rounded-full bg-[#dfe7f7] text-[#3b4b6b] text-[11px] font-semibold flex items-center justify-center shrink-0">{ini}</span>
    )
}

// ─── Recruitment scoreboard (per-HR) ─────────────────────────────────────────

const REC_COLS = [
    { key: "recruited", label: "Recruited" },
    { key: "interviewed", label: "Interviewed" },
    { key: "selected", label: "Selected" },
    { key: "onboarded", label: "Onboarded" },
]

function RecruitmentPanel() {
    const now = new Date()
    const [month, setMonth] = useState("ALL")
    const { data, loading } = useCachedFetch<any>(
        `/api/admin/recruitment-summary${month === "ALL" ? "" : `?month=${month}`}`
    )
    const monthOptions = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        return { val, label: d.toLocaleString("en-IN", { month: "short", year: "numeric" }) }
    })

    return (
        <Panel tone="mint" className="h-full flex flex-col p-0 overflow-hidden">
            <div className="px-5 pt-5">
                <PanelHead
                    tone="mint" icon={Users} title="Recruitment overview by HR" sub="Who recruited & onboarded how many"
                    action={
                        <div className="flex items-center gap-4 shrink-0">
                            <div className="relative">
                                <select
                                    value={month} onChange={e => setMonth(e.target.value)} aria-label="Recruitment period"
                                    className="appearance-none h-10 pl-3.5 pr-9 rounded-[10px] border border-[var(--border2)] bg-white text-[13px] text-[var(--text)] outline-none focus:ring-2 focus:ring-[#1f5fff]/25"
                                >
                                    <option value="ALL">All time</option>
                                    {monthOptions.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
                                </select>
                                <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text2)]" />
                            </div>
                            <Link href="/recruitment" className="hidden sm:inline-flex items-center gap-1.5 text-[13px] font-medium text-[#1f5fff] hover:underline">
                                View all <ArrowRight size={14} />
                            </Link>
                        </div>
                    }
                />
            </div>
            {loading ? (
                <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-[var(--text3)]" /></div>
            ) : !data?.rows?.length ? (
                <div className="flex-1 p-8 text-center flex flex-col items-center justify-center">
                    <Users className="h-8 w-8 text-[var(--text3)] mb-3" />
                    <p className="text-[13px] text-[var(--text2)]">No recruitment activity for this period.</p>
                </div>
            ) : (
                <div className="overflow-y-auto max-h-[380px] flex-1 px-5 pb-3">
                    <table className="w-full table-fixed text-[13px]">
                        <thead className="sticky top-0 z-10 bg-[#e9f9f1]">
                            <tr className="border-b border-[#c8eedb] text-[12px] text-[var(--text2)]">
                                <th className="w-[32%] text-left font-medium py-2.5">Recruiter</th>
                                {REC_COLS.map(c => <th key={c.key} className="text-center font-medium py-2.5">{c.label}</th>)}
                                <th className="w-[14%] text-right font-medium py-2.5">Conversion</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.rows.map((row: any) => (
                                <tr key={row.id} className="border-b border-[#d6f2e4] last:border-0">
                                    <td className="py-2.5">
                                        <span className="flex items-center gap-2.5 min-w-0">
                                            <Initials name={row.name || ""} />
                                            <span title={row.name} className="font-medium text-[var(--text)] truncate">{row.name}</span>
                                        </span>
                                    </td>
                                    {REC_COLS.map(c => (
                                        <td key={c.key} className={cn("text-center tabular-nums", row[c.key] > 0 ? "font-semibold text-[var(--text)]" : "text-[var(--text3)]")}>
                                            {row[c.key] || "—"}
                                        </td>
                                    ))}
                                    <td className="text-right">
                                        <span className={cn(
                                            "inline-block px-2.5 py-1 rounded-[8px] text-[12px] font-semibold tabular-nums",
                                            row.conversion >= 50 ? "bg-[#c9f2d9] text-[#157a3c]" : row.conversion >= 20 ? "bg-[#fdecc8] text-[#a15c07]" : "bg-white/70 text-[var(--text2)]"
                                        )}>{row.conversion}%</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-[#c8eedb] font-semibold text-[var(--text)]">
                                <td className="py-2.5">Total</td>
                                {REC_COLS.map(c => <td key={c.key} className="text-center tabular-nums">{data.totals[c.key] || "—"}</td>)}
                                <td className="text-right tabular-nums pr-2.5">
                                    {data.totals.recruited > 0 ? Math.round((data.totals.onboarded / data.totals.recruited) * 100) : 0}%
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </Panel>
    )
}

// ─── Employee expense summary ────────────────────────────────────────────────

const EXP_COLS = [
    { key: "TRAVEL",          label: "Travel",   color: "#3b82f6" },
    { key: "FUEL",            label: "Fuel",     color: "#ca8a04" },
    { key: "FOOD",            label: "Food",     color: "#f97316" },
    { key: "HOTEL",           label: "Hotel",    color: "#a855f7" },
    { key: "MATERIAL",        label: "Material", color: "#b45309" },
    { key: "MOBILE_RECHARGE", label: "Mobile",   color: "#0891b2" },
    { key: "OFFICE_SUPPLIES", label: "Office",   color: "#0d9488" },
    { key: "OTHER",           label: "Other",    color: "#6b7280" },
]

const fmtINR = (n: number) => (n > 0 ? "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 }) : "—")

function ExpensePanel() {
    const now = new Date()
    const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`)
    const { data, loading } = useCachedFetch<any>(`/api/expenses/team-summary?month=${month}`)
    const monthOptions = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        return { val, label: d.toLocaleString("en-IN", { month: "short", year: "numeric" }) }
    })

    return (
        <Panel tone="white" className="p-0 overflow-hidden">
            <div className="px-5 pt-5">
                <PanelHead
                    tone="white" icon={CreditCard} title="Employee expense summary" sub={data?.monthLabel}
                    action={
                        <div className="flex items-center gap-4 shrink-0">
                            <div className="relative">
                                <select
                                    value={month} onChange={e => setMonth(e.target.value)} aria-label="Expense month"
                                    className="appearance-none h-10 pl-3.5 pr-9 rounded-[10px] border border-[var(--border2)] bg-white text-[13px] text-[var(--text)] outline-none focus:ring-2 focus:ring-[#1f5fff]/25"
                                >
                                    {monthOptions.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
                                </select>
                                <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text2)]" />
                            </div>
                            <Link href="/expenses" className="hidden sm:inline-flex items-center gap-1.5 text-[13px] font-medium text-[#1f5fff] hover:underline">
                                View all <ArrowRight size={14} />
                            </Link>
                        </div>
                    }
                />
            </div>
            {loading ? (
                <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-[var(--text3)]" /></div>
            ) : !data?.rows?.length ? (
                <div className="p-8 text-center">
                    <CreditCard className="h-8 w-8 text-[var(--text3)] mx-auto mb-3" />
                    <p className="text-[13px] text-[var(--text2)]">No expenses submitted for this month.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-[12.5px]">
                        <thead>
                            <tr className="border-y border-[var(--border)] bg-[var(--surface2)] text-[12px]">
                                <th className="text-left font-semibold text-[var(--text2)] px-5 py-2.5 whitespace-nowrap">Employee</th>
                                <th className="text-left font-semibold text-[var(--text2)] px-2.5 py-2.5 whitespace-nowrap">Department</th>
                                {EXP_COLS.map(c => <th key={c.key} className="text-right font-semibold px-2.5 py-2.5 whitespace-nowrap" style={{ color: c.color }}>{c.label}</th>)}
                                <th className="text-right font-bold text-[var(--text)] px-5 py-2.5">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.rows.map((row: any) => (
                                <tr key={row.id} className="border-b border-[var(--border)] hover:bg-[var(--surface2)] transition-colors">
                                    <td className="px-5 py-2.5 whitespace-nowrap">
                                        <p className="font-semibold text-[var(--text)]">{row.name}</p>
                                        <p className="text-[11px] text-[var(--text3)]">{row.employeeId} · {row.designation}</p>
                                    </td>
                                    <td className="px-2.5 text-[var(--text2)] whitespace-nowrap">{row.department}</td>
                                    {EXP_COLS.map(c => (
                                        <td key={c.key} className="text-right px-2.5 tabular-nums" style={{ color: row[c.key] > 0 ? c.color : "var(--text3)", fontWeight: row[c.key] > 0 ? 600 : 400 }}>
                                            {fmtINR(row[c.key])}
                                        </td>
                                    ))}
                                    <td className="text-right px-5 font-bold text-[var(--text)] whitespace-nowrap tabular-nums">{fmtINR(row.total)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-[var(--border)] bg-[var(--surface2)] font-bold">
                                <td className="px-5 py-2.5 text-[var(--text)]" colSpan={2}>Total</td>
                                {EXP_COLS.map(c => (
                                    <td key={c.key} className="text-right px-2.5 tabular-nums" style={{ color: data.totals[c.key] > 0 ? c.color : "var(--text3)" }}>
                                        {fmtINR(data.totals[c.key])}
                                    </td>
                                ))}
                                <td className="text-right px-5 text-[var(--text)] tabular-nums">{fmtINR(data.totals.total)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </Panel>
    )
}

// ─── Main view ───────────────────────────────────────────────────────────────

const RANGES = [7, 14, 30] as const

const QUICK_ACTIONS = [
    { href: "/approvals", icon: ClipboardCheck, label: "Approve requests", sub: "Pending approvals", color: "#d97706", bg: "#fef3c7" },
    { href: "/attendance", icon: Clock, label: "Mark attendance", sub: "Take attendance", color: "#1f5fff", bg: "#e3ecff" },
    { href: "/employees", icon: UserPlus, label: "Add employee", sub: "Onboard new hire", color: "#0f766e", bg: "#d9f5ec" },
    { href: "/projects/create", icon: Folder, label: "Create project", sub: "Start new project", color: "#7c3aed", bg: "#efe8ff" },
    { href: "/assignments", icon: ClipboardList, label: "Manage assignments", sub: "Assign inspections", color: "#0891b2", bg: "#dff5fb" },
    { href: "/documents/send", icon: Send, label: "Send document", sub: "Issue letters", color: "#b45309", bg: "#fdeccf" },
    { href: "/reports", icon: BarChart2, label: "View reports", sub: "Analytics & reports", color: "#0d9488", bg: "#d6f3ef" },
    { href: "/admin/users", icon: Users, label: "System users", sub: "Access & roles", color: "#dc2626", bg: "#fde3e3" },
]

export function AdminOverview({ stats }: { stats: any }) {
    // The stats payload carries 30 days of inspection counts; shorter ranges
    // are slices of it, so switching needs no extra request.
    const [range, setRange] = useState<(typeof RANGES)[number]>(30)

    const att = stats.attendanceToday || { present: 0, absent: 0, onLeave: 0, pct: 0, attendancePct: null, expected: 0, notMarked: 0 }
    // attendance % = present ÷ expected, expected = active − on leave (computed server-side).
    const attExpected: number = att.expected ?? 0
    const attNotMarked: number = att.notMarked ?? Math.max(0, attExpected - att.present - att.absent)
    const attPct: number | null = attExpected > 0 ? att.pct : null
    const attPctLabel = fmtAttPct(attPct, att.present)
    const approvals = stats.approvals || { total: 0, leaves: 0, expenses: 0, documents: 0, inspections: 0 }
    const trend = stats.inspectionTrend || { days: [], completed30d: 0, deltaPct: null }
    const onboarding = stats.onboarding || { inProgress: 0, notStarted: 0, onHold: 0 }
    const exits = stats.exits || { pending: 0, clearancePending: 0 }
    const payroll = stats.payroll || { total: 0, processed: 0, pending: 0, pct: 0 }
    const alerts = stats.alerts || { contractsExpiring: 0, docExpiries: 0, lowAttendanceSites: 0 }
    const topSites: { siteId: string | null; name: string; present: number; absent: number; expected: number; notMarked: number; pct: number | null }[] = stats.topSites || []
    const week7: { day: string; count: number }[] = stats.attendanceTrend7d || []

    const inspToday = stats.inspectionsToday ?? 0
    const inspYesterday = stats.inspectionsYesterday ?? 0
    // Under MIN_DELTA_BASE yesterday a % swing is meaningless — show both counts instead.
    const inspDelta = inspYesterday >= MIN_DELTA_BASE ? Math.round(((inspToday - inspYesterday) / inspYesterday) * 100) : null

    const allDays: { day: string; count: number }[] = trend.days || []
    const days = allDays.slice(-range)
    const completed = range === 30 ? (trend.completed30d ?? 0) : days.reduce((s, d) => s + d.count, 0)
    const completedDelta: number | null = range === 30 ? trend.deltaPct : null
    // Previous-period count; on a small base the change is shown in absolute numbers.
    const completedPrev: number | null = range === 30 && typeof trend.previous30d === "number" ? trend.previous30d : null
    const completedSmallBase = completedPrev !== null && completedPrev < MIN_DELTA_BASE

    // One rule for the banner and the alert: mostly unmarked → "not marked yet";
    // otherwise under 75% → low attendance; otherwise nothing.
    const attNotMarkedYet = attExpected > 0 && attNotMarked > attExpected * 0.5
    const lowAttendance = !attNotMarkedYet && attPct !== null && attPct < 75
    // Wording only: "lower than usual" when today's check-ins are under 80% of
    // the previous six days' average.
    const prior = week7.slice(0, -1).filter(d => d.count > 0)
    const priorAvg = prior.length ? prior.reduce((s, d) => s + d.count, 0) / prior.length : 0
    const belowUsual = priorAvg > 0 && att.present < priorAvg * 0.8
    const pbs = stats.projectsByStatus || {}
    const projSlices: DonutSlice[] = [
        { label: "Active", value: pbs.ACTIVE ?? 0, color: "#16a34a" },
        { label: "Planning", value: pbs.PLANNING ?? 0, color: "#2f6bff" },
        { label: "On hold", value: pbs.ON_HOLD ?? 0, color: "#f59e0b" },
        { label: "Completed", value: pbs.COMPLETED ?? 0, color: "#9333ea" },
    ]

    // Each row links to the page that shows that alert's own records.
    const alertItems = [
        attNotMarkedYet ? { dot: "bg-[#f59e0b]", title: "Attendance not marked", text: `Not marked yet for ${attNotMarked.toLocaleString("en-IN")} of ${attExpected.toLocaleString("en-IN")} employees today.`, href: "/attendance" } : null,
        lowAttendance ? { dot: "bg-[#f59e0b]", title: "Low attendance today", text: `Only ${attPctLabel} attendance across all sites.`, href: "/attendance" } : null,
        inspToday > 0 ? { dot: "bg-[#1f5fff]", title: `${inspToday} inspection${inspToday === 1 ? "" : "s"} submitted today`, text: "Keep an eye on completion rates.", href: "/approvals?date=today" } : null,
        approvals.total > 0 ? { dot: "bg-[#9333ea]", title: `${approvals.total} approval${approvals.total === 1 ? "" : "s"} waiting`, text: "Leaves, expenses and inspections pending review.", href: "/approvals" } : null,
        alerts.lowAttendanceSites > 0 ? { dot: "bg-[#ef3b3b]", title: "Low attendance sites", text: `${alerts.lowAttendanceSites} site(s) are below 80% attendance today.`, href: "/attendance" } : null,
        alerts.docExpiries > 0 ? { dot: "bg-[#f59e0b]", title: "Document expiries", text: `${alerts.docExpiries} labour card(s) expire in the next 30 days.`, href: "/employees/master" } : null,
    ].filter((a): a is NonNullable<typeof a> => a !== null)

    // Each part opens the queue that owns it — /approvals only holds inspections.
    const approvalBits: { label: string; href?: string }[] = [
        { label: `${approvals.leaves} leaves`, href: "/leaves?status=PENDING" },
        { label: `${approvals.expenses} expenses`, href: "/expenses?status=PENDING" },
        { label: `${approvals.inspections} inspections`, href: "/approvals" },
        ...((approvals.documents ?? 0) > 0 ? [{ label: `${approvals.documents} documents` }] : []),
    ]

    return (
        <div className="p-4 lg:p-0 space-y-5">
            {/* ── Header ── */}
            <div className="hidden md:flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-[32px] font-bold text-[var(--text)] tracking-[-0.03em] leading-tight">Operations overview</h1>
                    <p className="text-[16px] text-[var(--text2)] mt-1">Your workforce and inspections, at a glance.</p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="flex items-center gap-2 text-[14.5px] text-[var(--text)] px-2">
                        <CalendarDays size={19} className="text-[var(--text2)]" />
                        {format(new Date(), "d MMM yyyy")}
                    </span>
                    <div className="relative">
                        <select
                            value={range} onChange={e => setRange(Number(e.target.value) as typeof range)} aria-label="Date range"
                            className="appearance-none h-12 pl-4 pr-10 rounded-[12px] border border-[var(--border2)] bg-white text-[14.5px] text-[var(--text)] outline-none focus:ring-2 focus:ring-[#1f5fff]/25 cursor-pointer"
                        >
                            {RANGES.map(r => <option key={r} value={r}>Last {r} days</option>)}
                        </select>
                        <ChevronDown size={17} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text2)]" />
                    </div>
                    <Link href="/reports" className="h-12 inline-flex items-center gap-2.5 px-5 rounded-[12px] text-white text-[14.5px] font-semibold bg-[linear-gradient(135deg,#2f6bff_0%,#1447e6_100%)] shadow-[0_8px_20px_-6px_rgba(31,95,255,0.6)] hover:brightness-110 transition">
                        <BarChart3 size={19} /> View reports
                    </Link>
                </div>
            </div>

            {/* ── KPI tiles ── */}
            <div className="hidden md:grid grid-cols-2 xl:grid-cols-4 gap-4">
                <KpiTile href="/employees" gradient="linear-gradient(135deg,#2f6bff 0%,#1240d8 100%)" icon={Users} label="Active employees"
                    value={(stats.activeEmployees ?? 0).toLocaleString("en-IN")}>
                    {(stats.newEmployees30d ?? 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-[#8cf5b8]">
                            <ArrowUpRight size={17} className="stroke-[2.5px]" />+{stats.newEmployees30d} last 30 days
                        </span>
                    ) : <span className="text-white/75">No new joiners in 30 days</span>}
                </KpiTile>

                <KpiTile href="/attendance" gradient="linear-gradient(135deg,#0f766e 0%,#0b4d4a 100%)" icon={CalendarCheck} label="Today's attendance"
                    value={attPctLabel}>
                    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-white/85">
                        <span>Present <b className="font-semibold text-[#8cc8ff] tabular-nums">{att.present.toLocaleString("en-IN")}</b></span>
                        <span aria-hidden>·</span>
                        <span>Absent <b className="font-semibold text-[#ff8f8f] tabular-nums">{att.absent.toLocaleString("en-IN")}</b></span>
                        <span aria-hidden>·</span>
                        <span>On leave <b className="font-semibold text-[#ffd54d] tabular-nums">{att.onLeave.toLocaleString("en-IN")}</b></span>
                        <span aria-hidden>·</span>
                        <span>Not marked <b className="font-semibold text-white tabular-nums">{attNotMarked.toLocaleString("en-IN")}</b></span>
                    </span>
                </KpiTile>

                <KpiTile href="/approvals" dark gradient="linear-gradient(135deg,#ffd84d 0%,#f7a823 100%)" icon={ClipboardCheck} label="Pending approvals"
                    value={String(approvals.total)}>
                    <span className="font-medium flex flex-wrap items-center gap-x-1.5">
                        {approvalBits.map((b, i) => (
                            <span key={b.label} className="inline-flex items-center gap-x-1.5">
                                {i > 0 && <span aria-hidden>·</span>}
                                {b.href
                                    ? <Link href={b.href} className="pointer-events-auto underline-offset-2 hover:underline">{b.label}</Link>
                                    : <span>{b.label}</span>}
                            </span>
                        ))}
                    </span>
                </KpiTile>

                <KpiTile href="/approvals?date=today" gradient="linear-gradient(135deg,#8b3cf6 0%,#5b21b6 100%)" icon={FileCheck} label="Inspections today"
                    value={String(inspToday)}>
                    {inspDelta === null ? (
                        <span className="text-white/85 tabular-nums">{inspToday.toLocaleString("en-IN")} today · {inspYesterday.toLocaleString("en-IN")} yesterday</span>
                    ) : (
                        <span className={cn(
                            "inline-flex items-center gap-1 h-8 px-3 rounded-full bg-white font-semibold",
                            inspDelta >= 0 ? "text-[#15803d]" : "text-[#dc2626]"
                        )}>
                            {inspDelta >= 0 ? <ArrowUpRight size={16} className="stroke-[2.5px]" /> : <ArrowDownRight size={16} className="stroke-[2.5px]" />}
                            {fmtDeltaPct(inspDelta)} vs yesterday
                        </span>
                    )}
                </KpiTile>
            </div>

            {/* ── Attendance banner: not marked yet, else low ── */}
            {(attNotMarkedYet || lowAttendance) && (
                <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-[#fbe0a6] bg-[#fff9ea] px-5 py-3">
                    <AlertTriangle size={24} className="text-[#f08c00] shrink-0" />
                    <p className="flex-1 min-w-[220px] text-[14px] text-[var(--text)]">
                        {attNotMarkedYet ? (
                            <>Attendance not marked yet for <b className="font-semibold">{attNotMarked.toLocaleString("en-IN")} of {attExpected.toLocaleString("en-IN")}</b> employees today.</>
                        ) : (
                            <>Today&apos;s attendance is {attPctLabel}, which is <b className="font-semibold">{belowUsual ? "lower than usual" : "below 75%"}</b>. Review attendance to identify any issues.</>
                        )}
                    </p>
                    <Link href="/attendance" className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[9px] border border-[var(--border2)] bg-white text-[12.5px] font-medium text-[var(--text)] hover:border-[#1f5fff] transition-colors">
                        {attNotMarkedYet ? "Mark attendance" : "View attendance"} <ChevronRight size={15} />
                    </Link>
                </div>
            )}

            {/* ── Inspection completion · Attendance breakdown ── */}
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.07fr)_minmax(0,1fr)] gap-4 items-stretch">
                <Panel tone="blue">
                    <PanelHead tone="blue" icon={BarChart3} title="Inspection completion" hint={`Last ${range} days`}
                        action={<HeadLink href="/reports">View report</HeadLink>} />
                    <div className="flex items-baseline flex-wrap gap-x-4 gap-y-2 mb-5">
                        <span className="text-[38px] font-bold text-[var(--text)] tabular-nums leading-none tracking-[-0.02em]">{completed.toLocaleString("en-IN")}</span>
                        <span className="text-[14px] text-[var(--text2)]">completed inspections</span>
                        {completedSmallBase ? (() => {
                            // Tiny previous period: the absolute change, with the base in brackets.
                            const diff = completed - (completedPrev ?? 0)
                            return (
                                <span className={cn(
                                    "inline-flex items-center gap-0.5 h-6 px-2 rounded-full text-[11.5px] font-semibold tabular-nums",
                                    diff >= 0 ? "bg-[#d3f3e3] text-[#157a3c]" : "bg-[#ffe0dc] text-[#c62828]"
                                )}>
                                    {diff >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                                    {diff >= 0 ? "+" : ""}{diff.toLocaleString("en-IN")} vs previous 30 days ({(completedPrev ?? 0).toLocaleString("en-IN")})
                                </span>
                            )
                        })() : completedDelta !== null && completedDelta !== undefined && (
                            <span className={cn(
                                "inline-flex items-center gap-0.5 h-6 px-2 rounded-full text-[11.5px] font-semibold",
                                completedDelta >= 0 ? "bg-[#d3f3e3] text-[#157a3c]" : "bg-[#ffe0dc] text-[#c62828]"
                            )}>
                                {completedDelta >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                                {fmtDeltaPct(completedDelta)} vs previous
                            </span>
                        )}
                    </div>
                    {days.length === 0 ? (
                        <p className="text-[13px] text-[var(--text2)] text-center py-10">No inspections submitted yet.</p>
                    ) : (
                        <Bars
                            data={days} height={112} gap={range === 30 ? 5 : 10}
                            label={d => `${format(new Date(d.day), "d MMM")}: ${d.count}`}
                            tick={
                                <div className="flex justify-between text-[11.5px] text-[var(--text2)]">
                                    {[0, 0.25, 0.5, 0.75, 1].map(f => {
                                        const d = days[Math.round(f * (days.length - 1))]
                                        return <span key={f}>{format(new Date(d.day), "MMM d")}</span>
                                    })}
                                </div>
                            }
                        />
                    )}
                </Panel>

                <Panel tone="mint" className="flex flex-col">
                    <PanelHead tone="mint" icon={Users} title="Today's attendance breakdown"
                        action={<HeadLink href="/attendance">View all sites</HeadLink>} />
                    <div className="flex items-center gap-4 mb-5 mt-1">
                        <Meter pct={attPct ?? 0} className="flex-1 bg-white/80" />
                        <span className="text-[18px] font-bold text-[var(--text)] tabular-nums">{attPctLabel}</span>
                    </div>
                    {topSites.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center py-8">
                            <CalendarCheck size={26} className="text-[var(--text3)] mb-2" />
                            <p className="text-[13px] text-[var(--text2)]">No employees expected today.</p>
                        </div>
                    ) : (
                        <div className="text-[13px]">
                            {/* Per site: present ÷ (deployed − on leave); "—" when nobody is expected there. */}
                            <div className="grid grid-cols-[1.5fr_0.65fr_0.65fr_0.8fr_1.4fr] gap-2 text-[12.5px] text-[var(--text2)] pb-2.5 border-b border-[#c8eedb]">
                                <span>Site</span>
                                <span className="text-center">Present</span>
                                <span className="text-center">Absent</span>
                                <span className="text-center">Not marked</span>
                                <span className="text-right">Attendance</span>
                            </div>
                            {topSites.map(s => (
                                <div key={s.siteId ?? s.name} className="grid grid-cols-[1.5fr_0.65fr_0.65fr_0.8fr_1.4fr] gap-2 items-center py-3 border-b border-[#d6f2e4] last:border-0">
                                    <span title={`${s.name} · ${s.expected} expected`} className="font-semibold text-[var(--text)] truncate">{s.name}</span>
                                    <span className="text-center font-semibold text-[#1f5fff] tabular-nums">{s.present}</span>
                                    <span className={cn("text-center tabular-nums", s.absent > 0 ? "font-semibold text-[#dc2626]" : "text-[var(--text2)]")}>{s.absent}</span>
                                    <span className={cn("text-center tabular-nums", (s.notMarked ?? 0) > 0 ? "font-semibold text-[#b45309]" : "text-[var(--text2)]")}>{s.notMarked ?? 0}</span>
                                    <span className="flex items-center gap-3 justify-end">
                                        <Meter pct={s.pct ?? 0} className="w-[72px] bg-white/80" />
                                        <span className="font-medium text-[var(--text)] tabular-nums w-10 text-right">{fmtAttPct(s.pct, s.present)}</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </Panel>
            </div>

            {/* ── Projects donut · weekly trend ── */}
            {/* The "Attendance split" donut was dropped: it repeated the KPI tile. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                <Panel tone="violet">
                    <PanelHead tone="violet" icon={Box} title="Projects by status" />
                    {projSlices.every(s => s.value === 0) ? (
                        <p className="text-[13px] text-[var(--text2)] text-center py-10">No projects yet.</p>
                    ) : (
                        <div className="flex items-center gap-5">
                            <Donut centerLabel="PROJECTS" slices={projSlices} />
                            <DonutLegend slices={projSlices} />
                        </div>
                    )}
                </Panel>

                <Panel tone="blue" className="flex flex-col">
                    <PanelHead tone="blue" icon={BarChart3} title="Attendance" hint="Last 7 days" sub="Employees checked in per day" />
                    {week7.length === 0 ? (
                        <p className="text-[13px] text-[var(--text2)] text-center py-10">No attendance data yet.</p>
                    ) : (
                        <div className="mt-auto">
                            <Bars
                                data={week7} height={80} gap={12}
                                label={d => `${format(new Date(d.day), "EEE, d MMM")}: ${d.count}`}
                                tick={
                                    <div className="flex gap-[12px] px-1.5">
                                        {week7.map(d => (
                                            <span key={d.day} className="flex-1 text-center text-[11.5px] text-[var(--text2)]">{format(new Date(d.day), "EEE")}</span>
                                        ))}
                                    </div>
                                }
                            />
                        </div>
                    )}
                </Panel>
            </div>

            {/* ── Recruitment · Alerts ── */}
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] gap-4 items-stretch">
                <RecruitmentPanel />

                <Panel tone="amber" className="flex flex-col">
                    {/* No "View all": alerts span attendance, inspections and approvals; each row links to its own page. */}
                    <PanelHead tone="amber" icon={Bell} title="Alerts & important" />
                    {alertItems.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
                            <CheckCircle2 size={28} className="text-[#16a34a] mb-2" />
                            <p className="text-[13.5px] font-semibold text-[var(--text)]">All clear</p>
                            <p className="text-[12.5px] text-[var(--text2)] mt-0.5">No expiries or low-attendance alerts.</p>
                        </div>
                    ) : (
                        <div className="space-y-2.5">
                            {alertItems.map(a => (
                                <Link key={a.title} href={a.href}
                                    className="flex items-center gap-3.5 rounded-[12px] bg-white/80 border border-[#f7e6bf] px-4 py-3 hover:bg-white hover:shadow-sm transition-all group">
                                    <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", a.dot)} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[13.5px] font-semibold text-[var(--text)] leading-tight">{a.title}</span>
                                        <span className="block text-[12px] text-[var(--text2)] mt-0.5 truncate">{a.text}</span>
                                    </span>
                                    <ChevronRight size={16} className="text-[var(--text3)] group-hover:text-[var(--text)] shrink-0" />
                                </Link>
                            ))}
                        </div>
                    )}
                </Panel>
            </div>

            {/* ── Pipelines ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                    { href: "/onboarding", icon: UserPlus, tone: "blue" as Tone, title: "Onboarding pipeline", big: String(onboarding.inProgress), bigSub: "In progress", link: "View pipeline",
                      rows: [["Yet to start", onboarding.notStarted], ["On hold", onboarding.onHold]] },
                    { href: "/exit", icon: LogOut, tone: "amber" as Tone, title: "Exits pending", big: String(exits.pending), bigSub: "Open requests", link: "View details",
                      rows: [["Clearances pending", exits.clearancePending]] },
                    { href: "/payroll", icon: Wallet, tone: "violet" as Tone, title: "Payroll status", big: `${payroll.pct}%`, bigSub: `Processed · ${format(new Date(), "MMM yyyy")}`, link: "View payroll",
                      rows: [["Processed", payroll.processed], ["Pending", payroll.pending]] },
                ].map(p => (
                    <Panel key={p.title} tone={p.tone} className="flex flex-col">
                        <PanelHead tone={p.tone} icon={p.icon} title={p.title} />
                        <div className="text-[30px] font-bold text-[var(--text)] leading-none tabular-nums">{p.big}</div>
                        <p className="text-[12px] text-[var(--text2)] mt-1 mb-3">{p.bigSub}</p>
                        <div className="space-y-1.5 text-[12.5px] text-[var(--text2)] mb-4">
                            {p.rows.map(([k, v]) => (
                                <div key={k as string} className="flex justify-between">
                                    <span>{k}</span><span className="font-semibold text-[var(--text)] tabular-nums">{Number(v).toLocaleString("en-IN")}</span>
                                </div>
                            ))}
                        </div>
                        <Link href={p.href} className="mt-auto inline-flex items-center gap-1.5 text-[13px] font-medium text-[#1f5fff] hover:underline">
                            {p.link} <ArrowRight size={14} />
                        </Link>
                    </Panel>
                ))}
            </div>

            {/* ── Recent submissions · Quick actions ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
                <Panel tone="white" className="p-0 overflow-hidden flex flex-col">
                    <div className="px-5 pt-5">
                        <PanelHead tone="white" icon={FileCheck} title="Recent submissions" action={<HeadLink href="/approvals">View all</HeadLink>} />
                    </div>
                    {(stats.recentInspections || []).length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center py-10">
                            <FileCheck size={26} className="text-[var(--text3)] mb-2" />
                            <p className="text-[13px] text-[var(--text2)]">No submissions yet</p>
                            <p className="text-[12px] text-[var(--text3)] mt-0.5">Inspector submissions will appear here.</p>
                        </div>
                    ) : (
                        <div>
                            <div className="grid grid-cols-[1.4fr_1fr_0.8fr_0.8fr] gap-2 px-5 py-2.5 text-[12px] text-[var(--text2)] border-y border-[var(--border)] bg-[var(--surface2)]">
                                <span>Project</span><span>Inspector</span><span>Status</span><span className="text-right">Date</span>
                            </div>
                            <div className="divide-y divide-[var(--border)]">
                                {(stats.recentInspections || []).map((i: any) => (
                                    <Link key={i.id} href={`/approvals/${i.id}`} className="grid grid-cols-[1.4fr_1fr_0.8fr_0.8fr] gap-2 items-center px-5 py-3 hover:bg-[var(--surface2)] transition-colors">
                                        <span className="text-[13px] font-medium text-[var(--text)] truncate">{i.projectName}</span>
                                        <span className="text-[12.5px] text-[var(--text2)] truncate">{i.inspectorName}</span>
                                        <span>
                                            <span className={cn(
                                                "inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold uppercase",
                                                i.status === "pending" ? "bg-[var(--amber-light)] text-[var(--amber)]" :
                                                    i.status === "approved" ? "bg-[var(--success-light)] text-[var(--success)]" :
                                                        "bg-[var(--red-light)] text-[var(--red)]"
                                            )}>{i.status}</span>
                                        </span>
                                        <span className="text-right text-[11.5px] text-[var(--text3)] tabular-nums">{i.submittedAt ? format(new Date(i.submittedAt), "MMM d, HH:mm") : "—"}</span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}
                </Panel>

                <Panel tone="white" className="flex flex-col">
                    <PanelHead tone="white" icon={ClipboardList} title="Quick actions" />
                    <div className="grid grid-cols-2 auto-rows-fr gap-3 flex-1">
                        {QUICK_ACTIONS.map(({ href, icon: Icon, label, sub, color, bg }) => (
                            <Link key={label} href={href} className="flex items-center gap-3 p-3 rounded-[12px] bg-[var(--surface2)] hover:bg-white hover:shadow-[0_4px_14px_rgba(15,23,41,0.08)] transition-all">
                                <div className="w-10 h-10 rounded-[11px] flex items-center justify-center shrink-0" style={{ backgroundColor: bg }}>
                                    <Icon size={18} style={{ color }} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[13px] font-semibold text-[var(--text)] leading-tight truncate">{label}</p>
                                    <p className="text-[11.5px] text-[var(--text2)] mt-0.5 truncate">{sub}</p>
                                </div>
                            </Link>
                        ))}
                    </div>
                </Panel>
            </div>

            <ExpensePanel />
        </div>
    )
}
