"use client"

// My day as a caller: calls waiting for an outcome, then who to call (follow-ups due,
// new leads, new candidates). Works on a laptop (rings the paired phone) and in the phone app.
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, CheckCircle2, Loader2, Play, Smartphone } from "lucide-react"
import { CallButton, OutcomeForm } from "@/components/dialer/CallButton"
import { AutoDial, type DialItem } from "@/components/dialer/AutoDial"
import { fmtDur, TARGET_TYPES, type TargetType } from "@/lib/dialer"

type Q = {
    pendingOutcome: { id: string; phone: string; targetName: string | null; targetType: string; connected: boolean; durationSec: number; startedAt: string; outcome: string | null; notes: string | null }[]
    toCall: { type: TargetType; id: string; name: string; sub: string; phone: string; stage: string; due: string | null; why: string; lastOutcome: string | null }[]
    device: { deviceName: string | null; online: boolean; lastSyncAt: string | null } | null
}
const when = (s: string) => new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })

export function MyCalls() {
    const [q, setQ] = useState<Q | null>(null)
    const [open, setOpen] = useState<string | null>(null)
    const [filter, setFilter] = useState<"all" | TargetType>("all")
    const [auto, setAuto] = useState<DialItem[] | null>(null)
    const load = useCallback(() => fetch("/api/dialer/queue").then(r => r.json()).then(setQ).catch(() => {}), [])
    const finishAuto = useCallback((n: number) => { setAuto(null); if (n) toast.success(`Auto-dial finished — ${n} call(s) noted`); load() }, [load])
    useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t) }, [load])
    if (!q) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[var(--text3)]" /></div>
    const list = q.toCall.filter(x => filter === "all" || x.type === filter)
    return (
        <div className="space-y-4">
            {!q.device ? (
                <a href="/dialer?tab=phone" className="flex items-center gap-2 rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800"><Smartphone size={15} /> No phone paired. Pair your phone so calls dial from it and sync here →</a>
            ) : (
                <div className="flex items-center gap-2 text-[12.5px] text-[var(--text3)]"><span className={`w-2 h-2 rounded-full ${q.device.online ? "bg-green-500" : "bg-gray-400"}`} />{q.device.deviceName || "Your phone"} {q.device.online ? "is online" : "is offline — open the Growus Dialer app"}{q.device.lastSyncAt ? ` · last sync ${when(q.device.lastSyncAt)}` : ""}</div>
            )}

            {q.pendingOutcome.length > 0 && (
                <section className="rounded-[12px] border border-amber-200 bg-white">
                    <h3 className="px-4 pt-3 text-[14px] font-bold text-[var(--text)] flex items-center gap-1.5"><AlertTriangle size={15} className="text-amber-600" /> What happened? ({q.pendingOutcome.length})</h3>
                    <ul className="divide-y divide-[var(--border)]">
                        {q.pendingOutcome.map(c => (
                            <li key={c.id} className="px-4 py-2.5">
                                <button className="w-full flex items-center justify-between gap-2 text-left" onClick={() => setOpen(open === c.id ? null : c.id)}>
                                    <div className="min-w-0"><div className="text-[13px] font-semibold text-[var(--text)] truncate">{c.targetName || c.phone}</div><div className="text-[11.5px] text-[var(--text3)]">{TARGET_TYPES[c.targetType as TargetType] ?? c.targetType} · {when(c.startedAt)} · {fmtDur(c.durationSec)}</div></div>
                                    <span className="text-[12px] font-semibold text-[var(--accent)] shrink-0">{open === c.id ? "Close" : "Add outcome"}</span>
                                </button>
                                {open === c.id && <div className="mt-2"><OutcomeForm call={c} compact onSaved={() => { setOpen(null); load() }} /></div>}
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <section className="rounded-[12px] border border-[var(--border)] bg-white">
                <div className="px-4 pt-3 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                        <h3 className="text-[14px] font-bold text-[var(--text)]">To call ({list.length})</h3>
                        {list.length > 0 && !auto && <button onClick={() => setAuto(list.map(x => ({ type: x.type, id: x.id, name: x.name, sub: x.sub, phone: x.phone })))} className="h-7 px-2.5 rounded-full bg-green-600 text-white text-[11.5px] font-semibold inline-flex items-center gap-1" title="Call the list one after another; the next number dials itself after you save the outcome"><Play size={11} /> Start auto-dial</button>}
                    </div>
                    <div className="flex gap-1">
                        {(["all", "SALES_LEAD", "CANDIDATE"] as const).map(f => <button key={f} onClick={() => setFilter(f)} className={`h-7 px-2.5 rounded-full text-[11.5px] font-semibold border ${filter === f ? "bg-gray-900 text-white border-gray-900" : "bg-white border-[var(--border)] text-[var(--text2)]"}`}>{f === "all" ? "All" : f === "SALES_LEAD" ? "Sales leads" : "Candidates"}</button>)}
                    </div>
                </div>
                {list.length === 0 ? <p className="px-4 py-6 text-[13px] text-[var(--text3)] flex items-center gap-1.5"><CheckCircle2 size={15} className="text-green-600" /> Nothing due. New leads and candidates assigned to you show up here.</p> : (
                    <ul className="divide-y divide-[var(--border)] mt-2">
                        {list.map(x => {
                            const late = x.due && new Date(x.due) < new Date()
                            return (
                                <li key={x.type + x.id} className="px-4 py-2.5 flex items-center gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[13px] font-semibold text-[var(--text)] truncate">{x.name}</div>
                                        <div className="text-[11.5px] text-[var(--text3)] truncate">{x.type === "SALES_LEAD" ? "Sales" : "Candidate"}{x.sub ? ` · ${x.sub}` : ""}{x.lastOutcome ? ` · last: ${x.lastOutcome}` : ""}</div>
                                        <div className={`text-[11px] font-semibold ${late ? "text-red-600" : "text-[var(--text3)]"}`}>{x.why}{x.due ? ` · ${when(x.due)}` : ""}</div>
                                    </div>
                                    <CallButton phone={x.phone} targetType={x.type} targetId={x.id} name={x.name} label="Call" className="h-9 px-3 rounded-[9px] bg-green-600 text-white text-[12.5px] font-semibold inline-flex items-center gap-1.5 shrink-0" />
                                </li>
                            )
                        })}
                    </ul>
                )}
            </section>
            {auto && <AutoDial queue={auto} onFinish={finishAuto} onProgress={load} />}
        </div>
    )
}
