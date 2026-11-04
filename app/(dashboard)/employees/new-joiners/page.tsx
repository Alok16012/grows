"use client"

// New Joiners: the live alert lists in full (who needs a site, who was just
// deployed) and the New Joiner Deployment Register — the record of when each
// person joined, was added, and got their first site, and who did it — with
// each person's full site history and an Excel export.

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { UserPlus, MapPin, Clock, CheckCircle2, FileSpreadsheet, Loader2, History, X, Search, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { canAny } from "@/lib/can"
import { StatCard, statGridClass } from "@/components/StatCard"
import type { NewJoiner, RegisterRow, HistoryEvent } from "@/lib/new-joiners"
import { AssignSiteForm } from "@/components/new-joiners/AssignSiteForm"
import { fmtDate, daysText, joiningText, announceNewJoinersChanged, NEW_JOINERS_CHANGED } from "@/components/new-joiners/format"

type LiveData = { needsSite: NewJoiner[]; recentlyDeployed: NewJoiner[]; canAssign: boolean; windowDays: number; recentDays: number }
type Tab = "needs" | "recent" | "register"
type Site = { id: string; name: string }

const pad = (n: number) => String(n).padStart(2, "0")
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const monthStartKey = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01` }

const ACTION_LABEL: Record<string, string> = {
    "employee.create": "Added", "deployment.assign": "Site assigned", "deployment.move": "Moved",
    "deployment.relieve": "Relieved", "deployment.restore": "Posted back", "deployment.update": "Posting edited",
    "deployment.delete": "Posting deleted",
}
const ACTION_DOT: Record<string, string> = {
    "employee.create": "bg-[var(--accent)]", "deployment.assign": "bg-[#16a34a]", "deployment.move": "bg-[#0284c7]",
    "deployment.relieve": "bg-[var(--amber)]", "deployment.restore": "bg-[#16a34a]", "deployment.update": "bg-[var(--text3)]",
    "deployment.delete": "bg-[var(--red)]",
}

export default function NewJoinersPage() {
    const { data: session } = useSession()
    const [tab, setTab] = useState<Tab>("needs")
    const [live, setLive] = useState<LiveData | null>(null)
    const [denied, setDenied] = useState(false)
    const [assigning, setAssigning] = useState<string | null>(null)
    const [historyFor, setHistoryFor] = useState<{ id: string; name: string } | null>(null)

    const loadLive = useCallback(async () => {
        const r = await fetch("/api/new-joiners").catch(() => null)
        if (!r) { toast.error("Could not reach the server"); return }
        if (r.status === 403 || r.status === 401) { setDenied(true); return }
        if (r.ok) setLive(await r.json())
        else toast.error("Could not load new joiners")
    }, [])
    useEffect(() => { loadLive() }, [loadLive])
    useEffect(() => {
        const on = () => loadLive()
        window.addEventListener(NEW_JOINERS_CHANGED, on)
        return () => window.removeEventListener(NEW_JOINERS_CHANGED, on)
    }, [loadLive])

    if (denied) {
        return <div className="p-8 text-center text-[13px] text-[var(--text3)]">You don&apos;t have access to employee records.</div>
    }

    const needs = live?.needsSite ?? []
    const recent = live?.recentlyDeployed ?? []
    const longest = needs.reduce((m, j) => Math.max(m, j.joinsInDays ? 0 : j.daysWithoutSite ?? 0), 0)

    return (
        <div className="p-4 lg:p-0 space-y-5 pb-10">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-[22px] font-bold text-[var(--text)] tracking-[-0.3px] m-0">New Joiners</h1>
                    <p className="text-[12.5px] text-[var(--text3)] mt-0.5">
                        People who joined in the last {live?.windowDays ?? 30} days (or join soon) and where they are deployed. The record of every site assignment is kept in the register.
                    </p>
                </div>
                <button type="button" onClick={() => { setLive(null); loadLive() }} className="h-9 px-3 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] text-[12.5px] font-medium text-[var(--text2)] inline-flex items-center gap-1.5 hover:bg-[var(--surface2)]">
                    <RefreshCw size={14} /> Refresh
                </button>
            </div>

            <div className={statGridClass(3)}>
                <StatCard label="Need a site" value={live ? needs.length : "…"} tone="rose" icon={<MapPin size={18} />} sub={needs.length ? `Longest wait ${daysText(longest) || "today"}` : "Everyone is placed"} onClick={() => setTab("needs")} active={tab === "needs"} />
                <StatCard label={`Deployed · last ${live?.recentDays ?? 7} days`} value={live ? recent.length : "…"} tone="green" icon={<CheckCircle2 size={18} />} sub="New joiners who got a site" onClick={() => setTab("recent")} active={tab === "recent"} seed={1} />
                <StatCard label="Register" value="Records" tone="blue" icon={<History size={18} />} sub="Joining → site, with history" onClick={() => setTab("register")} active={tab === "register"} seed={2} />
            </div>

            <div role="tablist" aria-label="New joiners views" className="flex gap-1 border-b border-[var(--border)] overflow-x-auto no-scrollbar">
                {([["needs", `Needs a site${live ? ` (${needs.length})` : ""}`], ["recent", `Recently deployed${live ? ` (${recent.length})` : ""}`], ["register", "Register"]] as [Tab, string][]).map(([k, l]) => (
                    <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                        className={cn("px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors",
                            tab === k ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text3)] hover:text-[var(--text)]",
                            k === "needs" && needs.length > 0 && tab !== k && "text-[var(--red)]")}>
                        {l}
                    </button>
                ))}
            </div>

            {tab === "needs" && (
                <section aria-label="Needs a site" className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                    {!live ? <Loading /> : needs.length === 0 ? (
                        <Empty icon={<CheckCircle2 className="h-8 w-8 text-[#16a34a]" />} text="Every new joiner has a site." />
                    ) : needs.map(j => (
                        <div key={j.id} className="px-4 py-3 border-b border-[var(--border)] last:border-0">
                            <div className="flex flex-wrap items-start gap-3">
                                <span className="mt-[6px] h-2.5 w-2.5 rounded-full bg-[var(--red)] shrink-0 motion-safe:animate-pulse" aria-hidden="true" />
                                <div className="min-w-[220px] flex-1">
                                    <p className="text-[13.5px] font-semibold text-[var(--text)]">
                                        {j.name} <span className="font-normal text-[var(--text3)]">· {j.code}</span>
                                        {j.onboarding && <span className="ml-1.5 align-middle text-[9.5px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--amber-light)] text-[#92400e]">Onboarding</span>}
                                    </p>
                                    <p className="text-[12px] text-[var(--text2)] mt-0.5">
                                        {joiningText(j)}{j.designation ? ` · ${j.designation}` : ""}{j.department ? ` · ${j.department}` : ""}
                                    </p>
                                    <p className="text-[12px] font-medium text-[var(--red)] mt-0.5">
                                        No site yet · added {fmtDate(j.addedOn)}{j.addedBy ? ` by ${j.addedBy}` : ""}{j.addedFrom ? ` via ${j.addedFrom.source}` : ""}{j.daysWithoutSite ? ` · waiting ${daysText(j.daysWithoutSite)}` : ""}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 ml-auto">
                                    <button type="button" onClick={() => setHistoryFor({ id: j.id, name: j.name })} className="h-8 px-2.5 rounded-[8px] text-[12px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] inline-flex items-center gap-1"><History size={13} /> History</button>
                                    {live.canAssign && assigning !== j.id && (
                                        <button type="button" onClick={() => setAssigning(j.id)} className="h-8 px-3 rounded-[8px] text-[12px] font-semibold text-white bg-[var(--red)] hover:opacity-90 inline-flex items-center gap-1"><MapPin size={13} /> Assign site</button>
                                    )}
                                </div>
                            </div>
                            {assigning === j.id && (
                                <div className="mt-3 ml-0 sm:ml-[22px] rounded-[10px] border border-[var(--border)] bg-[var(--surface2)]/50 p-3">
                                    <AssignSiteForm joiner={j} onCancel={() => setAssigning(null)}
                                        onDone={site => { setAssigning(null); toast.success(`${j.name} assigned to ${site}`); announceNewJoinersChanged() }} />
                                </div>
                            )}
                        </div>
                    ))}
                    {live && !live.canAssign && needs.length > 0 && (
                        <p className="px-4 py-2.5 text-[11.5px] text-[var(--text3)] bg-[var(--surface2)]/50">Assigning a site needs the Sites permission. Ask HR or an Admin to place these people.</p>
                    )}
                </section>
            )}

            {tab === "recent" && (
                <section aria-label="Recently deployed" className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                    {!live ? <Loading /> : recent.length === 0 ? (
                        <Empty icon={<UserPlus className="h-8 w-8 text-[var(--text3)] opacity-40" />} text={`No new joiner was deployed in the last ${live.recentDays} days.`} />
                    ) : recent.map(j => (
                        <div key={j.id} className="px-4 py-3 border-b border-[var(--border)] last:border-0 flex flex-wrap items-start gap-3">
                            <span className="mt-[6px] h-2.5 w-2.5 rounded-full bg-[#16a34a] shrink-0" aria-hidden="true" />
                            <div className="min-w-[220px] flex-1">
                                <p className="text-[13.5px] font-semibold text-[var(--text)]">{j.name} <span className="font-normal text-[var(--text3)]">· {j.code}</span></p>
                                <p className="text-[12px] text-[var(--text2)] mt-0.5">{joiningText(j)}{j.designation ? ` · ${j.designation}` : ""}</p>
                                <p className="text-[12px] font-medium text-[#15803d] mt-0.5">
                                    New · {j.site!.name} from {fmtDate(j.site!.since)} · assigned {fmtDate(j.site!.assignedOn)}{j.site!.assignedBy ? ` by ${j.site!.assignedBy}` : ""}
                                </p>
                            </div>
                            <button type="button" onClick={() => setHistoryFor({ id: j.id, name: j.name })} className="h-8 px-2.5 rounded-[8px] text-[12px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] inline-flex items-center gap-1"><History size={13} /> History</button>
                        </div>
                    ))}
                </section>
            )}

            {tab === "register" && <Register canExport={canAny(session, ["employees.export", "reports.export"])} onHistory={setHistoryFor} />}

            {historyFor && <HistoryDialog who={historyFor} onClose={() => setHistoryFor(null)} />}
        </div>
    )
}

function Loading() {
    return <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-[var(--text3)]" /></div>
}
function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
    return <div className="p-10 text-center"><div className="flex justify-center mb-2">{icon}</div><p className="text-[13px] text-[var(--text3)]">{text}</p></div>
}

// ─── Register ────────────────────────────────────────────────────────────────

function Register({ canExport, onHistory }: { canExport: boolean; onHistory: (w: { id: string; name: string }) => void }) {
    const [from, setFrom] = useState(monthStartKey())
    const [to, setTo] = useState(keyOf(new Date()))
    const [siteId, setSiteId] = useState("")
    const [sites, setSites] = useState<Site[]>([])
    const [rows, setRows] = useState<RegisterRow[] | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [q, setQ] = useState("")
    const [exporting, setExporting] = useState(false)

    useEffect(() => {
        fetch("/api/sites").then(r => (r.ok ? r.json() : [])).then(d => setSites(Array.isArray(d) ? d : [])).catch(() => {})
    }, [])

    const query = useMemo(() => {
        const p = new URLSearchParams({ from, to })
        if (siteId) p.set("siteId", siteId)
        return p.toString()
    }, [from, to, siteId])

    const load = useCallback(async () => {
        setRows(null); setError(null)
        const r = await fetch(`/api/new-joiners/register?${query}`).catch(() => null)
        if (!r) { setError("Could not reach the server"); setRows([]); return }
        const d = await r.json().catch(() => ({}))
        if (!r.ok) { setError(d.error ?? "Could not load the register"); setRows([]); return }
        setRows(d.rows ?? [])
    }, [query])
    useEffect(() => { load() }, [load])
    useEffect(() => { window.addEventListener(NEW_JOINERS_CHANGED, load); return () => window.removeEventListener(NEW_JOINERS_CHANGED, load) }, [load])

    const shown = useMemo(() => {
        const s = q.trim().toLowerCase()
        return (rows ?? []).filter(r => !s || r.name.toLowerCase().includes(s) || r.code.toLowerCase().includes(s))
    }, [rows, q])
    const placed = shown.filter(r => r.firstSite)
    const waiting = shown.filter(r => !r.firstSite)
    const avg = placed.length ? placed.reduce((s, r) => s + (r.daysToAssign ?? 0), 0) / placed.length : null

    const exportXlsx = async () => {
        setExporting(true)
        try {
            const r = await fetch(`/api/new-joiners/register?${query}&format=xlsx`)
            if (!r.ok) { const d = await r.json().catch(() => ({})); toast.error(d.error ?? "Export failed"); return }
            const blob = await r.blob()
            const a = document.createElement("a")
            a.href = URL.createObjectURL(blob)
            a.download = `new_joiner_register_${from}_to_${to}.xlsx`
            a.click()
            setTimeout(() => URL.revokeObjectURL(a.href), 2000)
        } finally { setExporting(false) }
    }

    const input = "h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
    return (
        <section aria-label="New joiner register" className="space-y-3">
            <div className="flex flex-wrap items-end gap-2.5">
                <label className="block"><span className="block text-[10.5px] font-semibold text-[var(--text3)] uppercase tracking-wide mb-1">Joined from</span>
                    <input type="date" value={from} max={to} onChange={e => e.target.value && setFrom(e.target.value)} className={input} /></label>
                <label className="block"><span className="block text-[10.5px] font-semibold text-[var(--text3)] uppercase tracking-wide mb-1">To</span>
                    <input type="date" value={to} min={from} onChange={e => e.target.value && setTo(e.target.value)} className={input} /></label>
                <label className="block min-w-[160px]"><span className="block text-[10.5px] font-semibold text-[var(--text3)] uppercase tracking-wide mb-1">Site</span>
                    <select value={siteId} onChange={e => setSiteId(e.target.value)} className={cn(input, "w-full")}>
                        <option value="">All sites</option>
                        {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select></label>
                <label className="block flex-1 min-w-[160px]"><span className="block text-[10.5px] font-semibold text-[var(--text3)] uppercase tracking-wide mb-1">Search</span>
                    <span className="relative block"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Name or code" className={cn(input, "w-full pl-8")} /></span></label>
                {canExport && (
                    <button type="button" onClick={exportXlsx} disabled={exporting || !rows?.length} className="h-9 px-3 rounded-[9px] text-[12.5px] font-semibold text-white bg-[#16a34a] hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5">
                        {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Export Excel
                    </button>
                )}
            </div>

            {rows && !error && (
                <p className="text-[12px] text-[var(--text2)]">
                    <b>{shown.length}</b> joined · <b className="text-[#15803d]">{placed.length}</b> got a site{avg != null ? <> (average <b>{avg.toFixed(1)}</b> days)</> : null} · <b className="text-[var(--red)]">{waiting.length}</b> still waiting
                </p>
            )}

            <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] overflow-x-auto">
                {!rows ? <Loading /> : error ? <p role="alert" className="p-6 text-center text-[13px] text-[var(--red)]">{error}</p> : shown.length === 0 ? (
                    <Empty icon={<UserPlus className="h-8 w-8 text-[var(--text3)] opacity-40" />} text="Nobody joined in this period." />
                ) : (
                    <table className="w-full min-w-[980px] text-[12.5px]">
                        <thead className="bg-[var(--surface2)] text-[10.5px] uppercase tracking-wide text-[var(--text3)]">
                            <tr>
                                {["Employee", "Joining date", "Added", "First site", "Site assigned", "Time to site", "Current site", ""].map(h => <th key={h} className="text-left font-semibold px-3 py-2 whitespace-nowrap">{h}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map(r => (
                                <tr key={r.id} className={cn("border-t border-[var(--border)] align-top", !r.firstSite && "bg-[var(--red-light)]/50")}>
                                    <td className="px-3 py-2"><div className="font-semibold text-[var(--text)]">{r.name}</div><div className="text-[11px] text-[var(--text3)]">{r.code}{r.designation ? ` · ${r.designation}` : ""} · {r.status.replace("_", " ").toLowerCase()}</div></td>
                                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.joiningDate)}</td>
                                    <td className="px-3 py-2"><div className="whitespace-nowrap">{fmtDate(r.addedOn)}</div><div className="text-[11px] text-[var(--text3)]">{[r.addedBy, r.source ? `${r.source}${r.sourceInferred ? " (from data)" : ""}` : null].filter(Boolean).join(" · ") || "—"}</div></td>
                                    <td className="px-3 py-2">{r.firstSite ? <><div className="font-medium">{r.firstSite}</div><div className="text-[11px] text-[var(--text3)]">from {fmtDate(r.firstSiteFrom)}</div></> : <span className="font-semibold text-[var(--red)]">No site yet</span>}</td>
                                    <td className="px-3 py-2">{r.assignedOn ? <><div className="whitespace-nowrap">{fmtDate(r.assignedOn)}</div><div className="text-[11px] text-[var(--text3)]">{r.assignedBy ?? "—"}</div></> : "—"}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">{r.daysToAssign != null ? <span className="inline-flex items-center gap-1"><Clock size={12} className="text-[var(--text3)]" />{r.daysToAssign === 0 ? "Same day" : daysText(r.daysToAssign)}</span> : <span className="font-semibold text-[var(--red)]">Waiting {daysText(r.waitingDays) || "today"}</span>}</td>
                                    <td className="px-3 py-2">{r.currentSite ?? <span className="text-[var(--text3)]">—</span>}{r.siteChanges > 1 && <div className="text-[11px] text-[var(--text3)]">{r.siteChanges} postings</div>}</td>
                                    <td className="px-3 py-2 text-right"><button type="button" onClick={() => onHistory({ id: r.id, name: r.name })} className="h-7 px-2 rounded-[7px] text-[11.5px] font-medium text-[var(--accent)] hover:bg-[var(--surface2)] inline-flex items-center gap-1"><History size={12} /> History</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            <p className="text-[11px] text-[var(--text3)]">
                &quot;Time to site&quot; runs from the day the person was added to the day their first site was saved. People added before records were kept show their postings only, without the &quot;Added from&quot; source. Change or end a posting on the <Link href="/sites" className="text-[var(--accent)] hover:underline">Sites</Link> screen.
            </p>
        </section>
    )
}

// ─── One person's site history ───────────────────────────────────────────────

function HistoryDialog({ who, onClose }: { who: { id: string; name: string }; onClose: () => void }) {
    const [events, setEvents] = useState<HistoryEvent[] | null>(null)
    const [error, setError] = useState<string | null>(null)
    useEffect(() => {
        fetch(`/api/new-joiners/history/${who.id}`)
            .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error ?? "Could not load the history"); setEvents(d.events ?? []) })
            .catch(e => setError(e.message))
    }, [who.id])
    useEffect(() => {
        const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
        document.addEventListener("keydown", esc)
        return () => document.removeEventListener("keydown", esc)
    }, [onClose])
    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4" onClick={onClose}>
            <div role="dialog" aria-modal="true" aria-label={`Site history of ${who.name}`} onClick={e => e.stopPropagation()}
                className="w-full sm:max-w-[520px] max-h-[85vh] overflow-hidden rounded-t-[16px] sm:rounded-[16px] bg-[var(--surface)] shadow-2xl flex flex-col">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]">
                    <div><h2 className="text-[14.5px] font-semibold text-[var(--text)]">Site history</h2><p className="text-[12px] text-[var(--text3)]">{who.name}</p></div>
                    <button type="button" onClick={onClose} aria-label="Close" className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-[var(--surface2)]"><X size={16} /></button>
                </div>
                <div className="overflow-y-auto px-5 py-4">
                    {error ? <p role="alert" className="text-[13px] text-[var(--red)]">{error}</p> : !events ? <Loading /> : events.length === 0 ? (
                        <p className="text-[13px] text-[var(--text3)]">No site records yet.</p>
                    ) : (
                        <ol className="relative border-l border-[var(--border)] ml-1.5 space-y-4">
                            {events.map((e, i) => (
                                <li key={i} className="ml-4">
                                    <span className={cn("absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--surface)]", ACTION_DOT[e.action] ?? "bg-[var(--text3)]")} aria-hidden="true" />
                                    <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--text3)]">{ACTION_LABEL[e.action] ?? e.action} · {fmtDate(e.at)} {new Date(e.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
                                    <p className="text-[13px] text-[var(--text)] mt-0.5">{e.summary}</p>
                                    <p className="text-[11.5px] text-[var(--text3)] mt-0.5">
                                        {[e.by ? `By ${e.by}` : null, e.source ? `from ${e.source}` : null, e.from === "posting" ? "read from the posting (before records were kept)" : e.from === "employee" ? "read from the employee record (before records were kept)" : null].filter(Boolean).join(" · ") || "—"}
                                    </p>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            </div>
        </div>
    )
}
