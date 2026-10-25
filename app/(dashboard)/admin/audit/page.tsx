"use client"
// Audit log — every change to roles, users and access, plus sign-ins, refusals,
// payroll locks and sensitive exports. Entries can't be edited or deleted.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, ChevronLeft, ChevronRight, Minus, Plus, ScrollText, Search } from "lucide-react"
import { liveSearchParam } from "@/lib/utils"
import { api, ApiError, Loading, Empty, inputCls, btnGhost, PageHead, NotSetUp, NoAccess } from "../_access/ui"

type Row = {
    id: string; at: string; actorId: string | null; actorName: string | null; action: string; targetType: string
    targetId: string | null; targetName: string | null; summary: string | null; before: unknown; after: unknown
    ip: string | null; batchId: string | null
}
type Payload = {
    rows: Row[]; total: number; page: number; pageSize: number; totalPages: number
    alerts: { actorId: string; actorName: string; count: number; at: string }[]
    canExport: boolean
}

const GROUPS: [string, string][] = [["", "All"], ["roles", "Roles"], ["users", "Users"], ["signins", "Sign-ins"], ["refused", "Refused"], ["payroll", "Payroll and exports"]]

const IST_MS = 5.5 * 60 * 60 * 1000
const istDate = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10)

function tone(action: string) {
    if (action === "permission.denied" || action === "auth.loginFailed") return "bg-[#fee2e2] text-[#b91c1c]"
    if (action.startsWith("export.")) return "bg-[#fef3c7] text-[#92400e]"
    if (action.startsWith("payroll.")) return "bg-[#dcfce7] text-[#15803d]"
    if (action.startsWith("role.")) return "bg-[#e0e7ff] text-[#3730a3]"
    if (action.startsWith("user.")) return "bg-[#e0f2fe] text-[#075985]"
    return "bg-[var(--surface2)] text-[var(--text2)]"
}

export default function AuditPage() {
    const today = useMemo(() => new Date(), [])
    // Default: this month so far.
    const [from, setFrom] = useState(() => `${istDate(today).slice(0, 8)}01`)
    const [to, setTo] = useState(() => istDate(today))
    const [group, setGroup] = useState("")
    const [qInput, setQInput] = useState("")
    const [q, setQ] = useState("")
    const [target, setTarget] = useState<string | null>(null)
    const [actor, setActor] = useState<string | null>(null)
    const [page, setPage] = useState(1)
    const [data, setData] = useState<Payload | null>(null)
    const [loading, setLoading] = useState(true)
    const [forbidden, setForbidden] = useState(false)
    const [notSetUp, setNotSetUp] = useState(false)
    const [open, setOpen] = useState<Set<string>>(new Set())
    const latest = useRef(0)

    // ?target=<id> from a user's "View audit history".
    useEffect(() => {
        const t = liveSearchParam("target")
        if (t) { setTarget(t); setFrom("") }
    }, [])

    useEffect(() => {
        const t = setTimeout(() => { setQ(qInput.trim()); setPage(1) }, 300)
        return () => clearTimeout(t)
    }, [qInput])

    const query = useMemo(() => {
        const p = new URLSearchParams({ page: String(page) })
        if (from) p.set("from", from)
        if (to) p.set("to", to)
        if (group) p.set("group", group)
        if (q) p.set("q", q)
        if (target) p.set("target", target)
        if (actor) p.set("actor", actor)
        return p.toString()
    }, [from, to, group, q, target, actor, page])

    const load = useCallback(async () => {
        const id = ++latest.current
        setLoading(true)
        try {
            const d = await api<Payload>(`/api/admin/audit?${query}`)
            if (id === latest.current) setData(d)
        } catch (e) {
            if (e instanceof ApiError && e.status === 403) setForbidden(true)
            else if (e instanceof ApiError && e.status === 503) setNotSetUp(true)
            else toast.error(e instanceof Error ? e.message : "Couldn't load the audit log")
        } finally {
            if (id === latest.current) setLoading(false)
        }
    }, [query])
    useEffect(() => { load() }, [load])

    const toggle = (id: string) => setOpen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

    if (forbidden) return <div className="p-4 lg:p-0"><NoAccess what="the Audit log" perm="audit.view" /></div>

    const rows = data?.rows ?? []
    return (
        <div className="flex flex-col gap-5 p-4 lg:p-0">
            <PageHead
                title="Audit log"
                sub="Every change to roles, users and access. Entries can't be edited or deleted."
                right={data?.canExport && <a href={`/api/admin/audit?${query}&format=xlsx`} className={btnGhost}>Export to Excel</a>}
            />

            {notSetUp && <NotSetUp />}

            {data?.alerts.map(a => (
                <div key={a.actorId} className="flex items-center gap-2.5 rounded-2xl border border-[#fecaca] bg-[#fff5f5] px-4 py-3 text-[13px] text-[#b91c1c]">
                    <AlertTriangle size={16} className="shrink-0" />
                    <span><b>{a.actorName}</b> was refused {a.count} times in 5 minutes.</span>
                    <button className="underline font-medium" onClick={() => { setActor(a.actorId); setGroup("refused"); setPage(1) }}>Show entries</button>
                </div>
            ))}

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 p-3 border-b border-[var(--border)]">
                    <label className="flex items-center gap-1.5 text-[12.5px] text-[var(--text2)]">From
                        <input type="date" value={from} max={to || undefined} onChange={e => { setFrom(e.target.value); setPage(1) }} className={inputCls("bg-[var(--surface)] h-10 w-[150px]")} />
                    </label>
                    <label className="flex items-center gap-1.5 text-[12.5px] text-[var(--text2)]">To
                        <input type="date" value={to} min={from || undefined} onChange={e => { setTo(e.target.value); setPage(1) }} className={inputCls("bg-[var(--surface)] h-10 w-[150px]")} />
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                        {GROUPS.map(([v, l]) => (
                            <button key={v} type="button" onClick={() => { setGroup(v); setPage(1) }} aria-pressed={group === v}
                                className={`h-10 rounded-xl border px-3.5 text-[12.5px] ${group === v ? "border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent-text)] font-semibold" : "border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)]"}`}>{l}</button>
                        ))}
                    </div>
                    <div className="relative flex-1 min-w-[180px]">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                        <input value={qInput} onChange={e => setQInput(e.target.value)} placeholder="Who, target or change" aria-label="Search the audit log" className={inputCls("pl-9 h-10 bg-[var(--surface)]")} />
                    </div>
                </div>

                {(target || actor) && (
                    <div className="flex flex-wrap gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--surface2)] text-[12.5px] text-[var(--text2)]">
                        {target && <Chip label="One user or role" onClear={() => setTarget(null)} />}
                        {actor && <Chip label="One person's actions" onClear={() => setActor(null)} />}
                    </div>
                )}

                {!data ? <Loading /> : rows.length === 0 ? (
                    <Empty icon={<ScrollText size={36} />} title="Nothing in this range" sub="Widen the dates or clear a filter." />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[900px] text-[13px]">
                            <thead>
                                <tr className="bg-[var(--surface2)] text-[11.5px] text-[var(--text2)]">
                                    <th className="text-left px-4 py-2.5 font-semibold">When</th>
                                    <th className="text-left px-3 py-2.5 font-semibold">Who</th>
                                    <th className="text-left px-3 py-2.5 font-semibold">Action</th>
                                    <th className="text-left px-3 py-2.5 font-semibold">What changed</th>
                                    <th className="text-left px-3 py-2.5 font-semibold">IP address</th>
                                    <th className="w-12" />
                                </tr>
                            </thead>
                            <tbody className={loading ? "opacity-60" : ""}>
                                {rows.map(r => {
                                    const expandable = r.before != null || r.after != null
                                    const isOpen = open.has(r.id)
                                    return (
                                        <Fragment key={r.id}>
                                            <tr className="border-t border-[var(--border)] align-top">
                                                <td className="px-4 py-3 text-[var(--text2)] whitespace-nowrap">{new Date(r.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</td>
                                                <td className="px-3 py-3 text-[var(--text)]">{r.actorName ?? "—"}</td>
                                                <td className="px-3 py-3"><span className={`inline-flex rounded-md px-2 py-0.5 font-mono text-[11.5px] ${tone(r.action)}`}>{r.action}</span></td>
                                                <td className="px-3 py-3 text-[var(--text)]">{r.summary ?? r.targetName ?? "—"}{r.batchId && <span className="ml-1.5 text-[11px] text-[var(--text3)]">batch</span>}</td>
                                                <td className="px-3 py-3 text-[var(--text2)] font-mono text-[12px]">{maskIp(r.ip)}</td>
                                                <td className="px-2 py-2">
                                                    {expandable && (
                                                        <button type="button" onClick={() => toggle(r.id)} aria-label={isOpen ? "Hide details" : "Show before and after"} aria-expanded={isOpen}
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text2)] hover:border-[var(--accent)] hover:text-[var(--accent)]">
                                                            {isOpen ? <Minus size={14} /> : <Plus size={14} />}
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                            {isOpen && (
                                                <tr>
                                                    <td colSpan={6} className="px-4 pb-4">
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                            <Pane tone="before" value={r.before} other={r.after} />
                                                            <Pane tone="after" value={r.after} other={r.before} />
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {data && data.total > 0 && (
                    <div className="flex items-center justify-between gap-2 px-3 py-3 border-t border-[var(--border)] text-[12.5px] text-[var(--text2)]">
                        <span>{data.total.toLocaleString("en-IN")} entries</span>
                        <div className="flex items-center gap-1.5">
                            <button className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(p => p - 1)} aria-label="Previous page"><ChevronLeft size={14} /></button>
                            <span className="px-2 tabular-nums">Page {data.page} of {data.totalPages}</span>
                            <button className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] disabled:opacity-40" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)} aria-label="Next page"><ChevronRight size={14} /></button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1">
            {label}<button onClick={onClear} aria-label={`Clear ${label}`} className="text-[var(--text3)] hover:text-[var(--text)]">×</button>
        </span>
    )
}

// "103.x.x.21" — enough to tell offices apart, not a full address in a screenshot.
function maskIp(ip: string | null) {
    if (!ip) return "—"
    const p = ip.split(".")
    return p.length === 4 ? `${p[0]}.x.x.${p[3]}` : ip
}

// Before / after as "key: value" lines; lines that changed are bold. For a
// list (permissions, sites) only what was removed / added is shown.
function Pane({ tone, value, other }: { tone: "before" | "after"; value: unknown; other: unknown }) {
    const before = tone === "before"
    const mine = asRecord(value)
    const theirs = asRecord(other)
    const lines: [string, string, boolean][] = Object.entries(mine).map(([k, v]) => {
        const o = theirs[k]
        if (Array.isArray(v) && Array.isArray(o)) {
            const diff = v.filter(x => !o.includes(x))
            if (diff.length === 0) return [k, `${before ? "nothing removed" : "nothing added"}  (${v.length} in total)`, false]
            return [k, `${before ? "−" : "+"} ${diff.join(", ")}  (${v.length} in total)`, true]
        }
        return [k, fmt(v), fmt(v) !== fmt(o)]
    })
    return (
        <div className={`rounded-xl border p-3 ${before ? "border-[#fecaca] bg-[#fff5f5]" : "border-[var(--success-border)] bg-[#f0fdf4]"}`}>
            <p className={`text-[12px] font-semibold mb-1.5 ${before ? "text-[#b91c1c]" : "text-[var(--success)]"}`}>{before ? "Before" : "After"}</p>
            {lines.length === 0 ? <p className="text-[12px] text-[var(--text3)]">—</p> : (
                <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-5 text-[var(--text)]">
                    {lines.map(([k, v, changed]) => (
                        <span key={k} className={changed ? "font-semibold" : "text-[var(--text2)]"}>{k}: {v}{"\n"}</span>
                    ))}
                </pre>
            )}
        </div>
    )
}

function asRecord(v: unknown): Record<string, unknown> {
    if (v === null || v === undefined) return {}
    if (typeof v !== "object" || Array.isArray(v)) return { value: v }
    return v as Record<string, unknown>
}

function fmt(v: unknown): string {
    if (v === null || v === undefined || v === "") return "—"
    if (Array.isArray(v)) return v.length ? v.join(", ") : "none"
    if (typeof v === "object") return JSON.stringify(v)
    return String(v)
}
