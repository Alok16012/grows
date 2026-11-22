"use client"

// Every synced call — mine, or the whole team's — with filters, outcome editing and download.
import { Fragment, useCallback, useEffect, useState } from "react"
import { ArrowDownLeft, ArrowUpRight, Download, Loader2, PhoneMissed } from "lucide-react"
import { CallButton, OutcomeForm, loadOutcomes } from "@/components/dialer/CallButton"
import { fmtDur, TARGET_TYPES, type Outcome, type TargetType } from "@/lib/dialer"

type C = { id: string; userId: string; userName: string; phone: string; direction: string; connected: boolean; startedAt: string; durationSec: number; targetType: string; targetId: string | null; targetName: string | null; outcome: string | null; notes: string | null; followUpAt: string | null }
const box = "h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white"
const DIR: Record<string, [React.ReactNode, string]> = {
    OUTGOING: [<ArrowUpRight key="o" size={13} />, "text-blue-600"], INCOMING: [<ArrowDownLeft key="i" size={13} />, "text-green-600"],
    MISSED: [<PhoneMissed key="m" size={13} />, "text-red-600"], REJECTED: [<PhoneMissed key="r" size={13} />, "text-red-400"],
}

export function CallLog({ canSeeTeam, canExport }: { canSeeTeam: boolean; canExport: boolean }) {
    const [view, setView] = useState(canSeeTeam ? "team" : "mine")
    const [f, setF] = useState({ from: "", to: "", direction: "", target: "", outcome: "", q: "" })
    const [d, setD] = useState<C[] | null>(null)
    const [open, setOpen] = useState<string | null>(null)
    const [outcomes, setOutcomes] = useState<Outcome[]>([])
    useEffect(() => { loadOutcomes().then(setOutcomes) }, [])
    const params = useCallback(() => {
        const p = new URLSearchParams({ view })
        if (f.from) p.set("from", new Date(f.from + "T00:00:00+05:30").toISOString())
        if (f.to) p.set("to", new Date(new Date(f.to + "T00:00:00+05:30").getTime() + 86400_000).toISOString())
        for (const k of ["direction", "target", "outcome", "q"] as const) if (f[k]) p.set(k, f[k])
        return p
    }, [view, f])
    const load = useCallback(() => { fetch(`/api/dialer/calls?${params()}`).then(r => r.json()).then(j => setD(j.calls ?? [])).catch(() => setD([])) }, [params])
    useEffect(() => { const t = setTimeout(load, f.q ? 300 : 0); return () => clearTimeout(t) }, [load, f.q])
    const label = (k: string | null) => k ? outcomes.find(o => o.key === k)?.label ?? k : null
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
                {canSeeTeam && <select className={box} value={view} onChange={e => setView(e.target.value)}><option value="team">Everyone</option><option value="mine">My calls</option></select>}
                <input type="date" className={box} value={f.from} onChange={e => setF({ ...f, from: e.target.value })} aria-label="From" />
                <input type="date" className={box} value={f.to} onChange={e => setF({ ...f, to: e.target.value })} aria-label="To" />
                <select className={box} value={f.direction} onChange={e => setF({ ...f, direction: e.target.value })}><option value="">All directions</option><option value="OUTGOING">Outgoing</option><option value="INCOMING">Incoming</option><option value="MISSED">Missed</option><option value="REJECTED">Rejected</option></select>
                <select className={box} value={f.target} onChange={e => setF({ ...f, target: e.target.value })}><option value="">Everyone called</option>{Object.entries(TARGET_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <select className={box} value={f.outcome} onChange={e => setF({ ...f, outcome: e.target.value })}><option value="">Any outcome</option><option value="pending">Outcome missing</option>{outcomes.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}</select>
                <input className={`${box} w-[180px]`} placeholder="Name, number or note" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} />
                {canExport && <a href={`/api/dialer/calls?${params()}&format=csv`} className="h-9 px-3 rounded-[9px] border border-[var(--border)] bg-white text-[12.5px] font-semibold inline-flex items-center gap-1.5 ml-auto"><Download size={13} /> Download</a>}
            </div>
            <div className="rounded-[12px] border border-[var(--border)] bg-white overflow-x-auto">
                {!d ? <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[var(--text3)]" /></div> : d.length === 0 ? <p className="p-6 text-[13px] text-[var(--text3)]">No calls match.</p> : (
                    <table className="w-full text-[12.5px]">
                        <thead><tr className="text-left text-[11px] uppercase text-[var(--text3)] border-b border-[var(--border)]">{["When", "Caller", "", "Name / number", "Talk", "Outcome", "Notes", ""].map((h, i) => <th key={i} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
                        <tbody>
                            {d.map(c => (
                                <Fragment key={c.id}>
                                    <tr className="border-b border-[var(--border)] hover:bg-gray-50 cursor-pointer" onClick={() => setOpen(open === c.id ? null : c.id)}>
                                        <td className="px-3 py-2 whitespace-nowrap tabular-nums text-[var(--text2)]">{new Date(c.startedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">{c.userName}</td>
                                        <td className={`px-1 py-2 ${DIR[c.direction]?.[1]}`} title={c.direction}>{DIR[c.direction]?.[0]}</td>
                                        <td className="px-3 py-2"><div className="font-semibold text-[var(--text)]">{c.targetName || c.phone}</div><div className="text-[11px] text-[var(--text3)]">{TARGET_TYPES[c.targetType as TargetType] ?? c.targetType}{c.targetName ? ` · ${c.phone}` : ""}</div></td>
                                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">{c.connected ? fmtDur(c.durationSec) : <span className="text-[var(--text3)]">Not connected</span>}</td>
                                        <td className="px-3 py-2">{label(c.outcome) ?? (c.connected && c.targetType !== "UNKNOWN" ? <span className="text-amber-700 font-semibold">Add</span> : "—")}</td>
                                        <td className="px-3 py-2 max-w-[260px] truncate text-[var(--text2)]">{c.notes}</td>
                                        <td className="px-3 py-2" onClick={e => e.stopPropagation()}><CallButton phone={c.phone} targetType={c.targetType as TargetType} targetId={c.targetId ?? undefined} name={c.targetName ?? undefined} /></td>
                                    </tr>
                                    {open === c.id && <tr key={c.id + "-o"} className="border-b border-[var(--border)] bg-gray-50"><td colSpan={8} className="px-3 py-3"><div className="max-w-[520px]"><OutcomeForm call={c} compact onSaved={() => { setOpen(null); load() }} /></div></td></tr>}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}
