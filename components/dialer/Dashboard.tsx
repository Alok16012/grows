"use client"

// Call performance: today's (or a range's) numbers per caller, the live board,
// calls by hour / day and the outcome mix.
import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, Phone, PhoneCall, PhoneIncoming, PhoneMissed, Timer, Trophy, AlertTriangle, Target } from "lucide-react"
import { fmtDur } from "@/lib/dialer"

type Row = { userId: string; name: string; dialed: number; connected: number; incoming: number; missed: number; talkSec: number; avgTalkSec: number; uniqueNumbers: number; firstCall: string | null; lastCall: string | null; positive: number; withOutcome: number; salesCalls: number; candidateCalls: number; employeeCalls: number; overdueFollowUps: number; score: number; days: number }
type Live = { userId: string; name: string; deviceName: string | null; state: "OFFLINE" | "ON_CALL" | "ACTIVE" | "IDLE"; onCallSince: string | null; callPhone: string | null; idleMin: number | null; lastSeenAt: string | null }
type Stats = { rows: Row[]; hourly: number[]; daily: { day: string; dialed: number; connected: number; talkMin: number }[]; outcomes: { key: string; label: string; n: number }[]; settings: { targetCalls: number; targetConnected: number; targetTalkMin: number; idleAfterMin: number }; team: boolean; canSeeTeam: boolean; live: Live[] | null }

const IST = 5.5 * 3600_000
function istMidnight(offsetDays = 0) { const n = new Date(Date.now() + IST); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + offsetDays) - IST) }
function rangeOf(p: string): [Date, Date] {
    const today = istMidnight()
    if (p === "yesterday") return [istMidnight(-1), today]
    if (p === "week") { const dow = (new Date(Date.now() + IST).getUTCDay() + 6) % 7; return [istMidnight(-dow), istMidnight(1)] }
    if (p === "month") { const n = new Date(Date.now() + IST); return [new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1) - IST), istMidnight(1)] }
    if (p === "30") return [istMidnight(-29), istMidnight(1)]
    return [today, istMidnight(1)]
}
const time = (s: string | null) => s ? new Date(s).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"
const pct = (a: number, b: number) => b ? Math.round(100 * a / b) : 0

export function Dashboard({ defaultView }: { defaultView: "team" | "mine" }) {
    const [preset, setPreset] = useState("today")
    const [view, setView] = useState(defaultView)
    const [d, setD] = useState<Stats | null>(null)
    const [err, setErr] = useState("")
    const load = useCallback(() => {
        const [from, to] = rangeOf(preset)
        fetch(`/api/dialer/stats?${new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), view })}`).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j?.error); setD(j); setErr("") }).catch(e => setErr(e.message || "Couldn't load"))
    }, [preset, view])
    useEffect(() => { load() }, [load])
    // Live board refreshes every 20 s while open.
    useEffect(() => { if (preset !== "today") return; const t = setInterval(load, 20_000); return () => clearInterval(t) }, [load, preset])
    const tot = useMemo(() => (d?.rows ?? []).reduce((a, r) => ({ dialed: a.dialed + r.dialed, connected: a.connected + r.connected, incoming: a.incoming + r.incoming, missed: a.missed + r.missed, talkSec: a.talkSec + r.talkSec, positive: a.positive + r.positive, overdue: a.overdue + r.overdueFollowUps }), { dialed: 0, connected: 0, incoming: 0, missed: 0, talkSec: 0, positive: 0, overdue: 0 }), [d])
    if (err) return <div className="p-6 text-[13px] text-red-600">{err}</div>
    if (!d) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[var(--text3)]" /></div>
    const s = d.settings, days = d.rows[0]?.days ?? 1, people = Math.max(1, d.rows.length)
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
                {[["today", "Today"], ["yesterday", "Yesterday"], ["week", "This week"], ["month", "This month"], ["30", "Last 30 days"]].map(([k, l]) => (
                    <button key={k} onClick={() => setPreset(k)} className={`h-8 px-3 rounded-full text-[12.5px] font-semibold border ${preset === k ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "bg-white border-[var(--border)] text-[var(--text2)]"}`}>{l}</button>
                ))}
                {d.canSeeTeam && <div className="ml-auto flex rounded-full border border-[var(--border)] overflow-hidden text-[12.5px] font-semibold">
                    {(["team", "mine"] as const).map(v => <button key={v} onClick={() => setView(v)} className={`h-8 px-3 ${view === v ? "bg-gray-900 text-white" : "bg-white text-[var(--text2)]"}`}>{v === "team" ? "Team" : "Only me"}</button>)}
                </div>}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                <Tile icon={<Phone size={15} />} label="Calls dialled" value={tot.dialed} sub={`Target ${s.targetCalls * days * people}`} progress={pct(tot.dialed, s.targetCalls * days * people)} />
                <Tile icon={<PhoneCall size={15} />} label="Connected" value={tot.connected} sub={`${pct(tot.connected, tot.dialed)}% connect rate`} progress={pct(tot.connected, s.targetConnected * days * people)} />
                <Tile icon={<Timer size={15} />} label="Talk time" value={fmtDur(tot.talkSec)} sub={`Target ${s.targetTalkMin * days * people} min`} progress={pct(tot.talkSec / 60, s.targetTalkMin * days * people)} />
                <Tile icon={<PhoneIncoming size={15} />} label="Incoming answered" value={tot.incoming} sub={`${tot.missed} missed / rejected`} />
                <Tile icon={<Target size={15} />} label="Positive outcomes" value={tot.positive} sub="Interested, meeting, resolved" />
                <Tile icon={<AlertTriangle size={15} />} label="Overdue follow-ups" value={tot.overdue} sub="Leads + candidates, now" warn={tot.overdue > 0} />
            </div>

            {d.live && d.live.length > 0 && preset === "today" && (
                <Card title="Live now" right={<span className="text-[11.5px] text-[var(--text3)]">Refreshes every 20 s · idle = no call for {s.idleAfterMin}+ min</span>}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                        {d.live.map(l => {
                            const st = { ON_CALL: ["On a call", "bg-green-50 border-green-200 text-green-800", "bg-green-500"], ACTIVE: ["Active", "bg-blue-50 border-blue-200 text-blue-800", "bg-blue-500"], IDLE: ["Idle", "bg-amber-50 border-amber-200 text-amber-800", "bg-amber-500"], OFFLINE: ["Phone offline", "bg-gray-50 border-gray-200 text-gray-600", "bg-gray-400"] }[l.state]
                            return (
                                <div key={l.userId} className={`rounded-[10px] border px-3 py-2 ${st[1]}`}>
                                    <div className="flex items-center gap-2 text-[13px] font-semibold"><span className={`w-2 h-2 rounded-full ${st[2]} ${l.state === "ON_CALL" ? "animate-pulse" : ""}`} />{l.name}</div>
                                    <div className="text-[11.5px] mt-0.5">{st[0]}{l.state === "ON_CALL" && l.onCallSince ? ` · ${fmtDur((Date.now() - new Date(l.onCallSince).getTime()) / 1000)}` : ""}{(l.state === "IDLE" || l.state === "ACTIVE") && l.idleMin != null ? ` · last call ${l.idleMin} min ago` : ""}{l.state === "IDLE" && l.idleMin == null ? " · no call yet today" : ""}</div>
                                </div>
                            )
                        })}
                    </div>
                </Card>
            )}

            <Card title={d.team ? "Leaderboard" : "My numbers"} right={<span className="text-[11.5px] text-[var(--text3)]">Score = 40% calls + 30% connected + 30% talk time, against daily targets</span>}>
                {d.rows.length === 0 ? <p className="text-[13px] text-[var(--text3)] py-4">No calls yet. Calls appear here once a paired phone syncs.</p> : (
                    <div className="overflow-x-auto -mx-1">
                        <table className="w-full text-[12.5px] tabular-nums">
                            <thead><tr className="text-left text-[11px] uppercase text-[var(--text3)]">
                                {["#", "Caller", "Dialled", "Connected", "Talk", "Avg call", "Incoming", "Missed", "Positive", "First / last", "Overdue", "Score"].map(h => <th key={h} className="px-2 py-1.5 font-semibold whitespace-nowrap">{h}</th>)}
                            </tr></thead>
                            <tbody>
                                {d.rows.map((r, i) => (
                                    <tr key={r.userId} className="border-t border-[var(--border)]">
                                        <td className="px-2 py-2">{i < 3 && d.team && r.score > 0 ? <Trophy size={13} className={["text-amber-500", "text-gray-400", "text-amber-700"][i]} /> : i + 1}</td>
                                        <td className="px-2 py-2 font-semibold text-[var(--text)] whitespace-nowrap">{r.name}</td>
                                        <td className="px-2 py-2">{r.dialed}</td>
                                        <td className="px-2 py-2">{r.connected} <span className="text-[var(--text3)]">({pct(r.connected, r.dialed)}%)</span></td>
                                        <td className="px-2 py-2 whitespace-nowrap">{fmtDur(r.talkSec)}</td>
                                        <td className="px-2 py-2 whitespace-nowrap">{fmtDur(r.avgTalkSec)}</td>
                                        <td className="px-2 py-2">{r.incoming}</td>
                                        <td className="px-2 py-2">{r.missed}</td>
                                        <td className="px-2 py-2">{r.positive}</td>
                                        <td className="px-2 py-2 whitespace-nowrap text-[var(--text2)]">{time(r.firstCall)} – {time(r.lastCall)}</td>
                                        <td className={`px-2 py-2 ${r.overdueFollowUps ? "text-red-600 font-semibold" : ""}`}>{r.overdueFollowUps}</td>
                                        <td className="px-2 py-2 min-w-[110px]"><div className="flex items-center gap-2"><div className="h-1.5 flex-1 rounded-full bg-gray-100"><div className="h-1.5 rounded-full bg-[var(--accent)]" style={{ width: `${r.score}%` }} /></div><span className="font-semibold w-7 text-right">{r.score}</span></div></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <div className="grid lg:grid-cols-2 gap-4">
                <Card title="Calls dialled by hour">
                    <Bars data={d.hourly.map((n, h) => ({ label: `${h}`, value: n, tip: `${h}:00–${h + 1}:00 · ${n} calls` })).slice(
                        Math.min(8, d.hourly.findIndex(n => n > 0) === -1 ? 8 : d.hourly.findIndex(n => n > 0)),
                        Math.max(21, 24 - [...d.hourly].reverse().findIndex(n => n > 0) === 25 ? 21 : 24 - [...d.hourly].reverse().findIndex(n => n > 0)))} />
                </Card>
                {d.daily.length > 1 ? (
                    <Card title="Calls dialled by day">
                        <Bars data={d.daily.map(x => ({ label: x.day.slice(8), value: x.dialed, tip: `${new Date(x.day).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} · ${x.dialed} dialled, ${x.connected} connected, ${x.talkMin} min` }))} />
                    </Card>
                ) : (
                    <Card title="What happened on calls">
                        <Outcomes list={d.outcomes} />
                    </Card>
                )}
            </div>
            {d.daily.length > 1 && <Card title="What happened on calls"><Outcomes list={d.outcomes} /></Card>}
        </div>
    )
}

function Tile({ icon, label, value, sub, progress, warn }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string; progress?: number; warn?: boolean }) {
    return (
        <div className="rounded-[12px] border border-[var(--border)] bg-white p-3">
            <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--text3)]">{icon}{label}</div>
            <div className={`text-[22px] font-bold tabular-nums mt-1 ${warn ? "text-red-600" : "text-[var(--text)]"}`}>{value}</div>
            {sub && <div className="text-[11.5px] text-[var(--text3)]">{sub}</div>}
            {progress != null && <div className="h-1 mt-2 rounded-full bg-gray-100"><div className="h-1 rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, progress)}%` }} /></div>}
        </div>
    )
}
function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="rounded-[12px] border border-[var(--border)] bg-white p-4">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-3"><h3 className="text-[14px] font-bold text-[var(--text)]">{title}</h3>{right}</div>
            {children}
        </div>
    )
}
/** Single-series bars: one hue, rounded data end on the baseline, 2px gaps, hover tooltip. */
function Bars({ data }: { data: { label: string; value: number; tip: string }[] }) {
    const [hover, setHover] = useState<number | null>(null)
    const max = Math.max(1, ...data.map(x => x.value))
    return (
        <div>
            <div className="relative h-[150px] flex items-end gap-[2px] border-b border-[var(--border)]">
                {data.map((x, i) => (
                    <div key={i} className="flex-1 h-full flex items-end cursor-default" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                        <div className={`w-full rounded-t-[4px] bg-[var(--accent)] ${hover === i ? "" : "opacity-70"}`} style={{ height: `${(100 * x.value) / max}%`, minHeight: x.value ? 2 : 0 }} />
                    </div>
                ))}
                {hover != null && <div className="absolute -top-1 left-1/2 -translate-x-1/2 rounded-[6px] bg-gray-900 text-white text-[11.5px] px-2 py-1 whitespace-nowrap pointer-events-none">{data[hover].tip}</div>}
            </div>
            <div className="flex gap-[2px] mt-1">{data.map((x, i) => <div key={i} className="flex-1 text-center text-[10px] text-[var(--text3)]">{data.length > 16 && i % 2 ? "" : x.label}</div>)}</div>
        </div>
    )
}
function Outcomes({ list }: { list: { key: string; label: string; n: number }[] }) {
    const total = list.reduce((a, x) => a + x.n, 0)
    if (!total) return <p className="text-[13px] text-[var(--text3)] py-4">No outcomes noted yet. After each call, pick what happened.</p>
    return (
        <div className="space-y-2">
            {list.map(x => (
                <div key={x.key} className="text-[12.5px]">
                    <div className="flex justify-between"><span className="text-[var(--text2)]">{x.label}</span><span className="font-semibold tabular-nums text-[var(--text)]">{x.n} <span className="text-[var(--text3)] font-normal">({pct(x.n, total)}%)</span></span></div>
                    <div className="h-1.5 rounded-full bg-gray-100 mt-1"><div className="h-1.5 rounded-full bg-[var(--accent)]" style={{ width: `${pct(x.n, max(list))}%` }} /></div>
                </div>
            ))}
        </div>
    )
}
const max = (l: { n: number }[]) => Math.max(1, ...l.map(x => x.n))
