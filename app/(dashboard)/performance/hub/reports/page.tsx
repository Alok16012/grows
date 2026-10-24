"use client"
// My DWM Reports — today's daily, this week's and this month's report, plus history.
import { useCallback, useEffect, useState } from "react"
import type React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns"
import { CalendarDays, CalendarRange, Calendar, ClipboardList, Loader2, ArrowRight, Play } from "lucide-react"
import { OpenFromQuery } from "@/components/OpenFromQuery"
import { HubShell, useHubPerms } from "../_components/HubNav"
import {
    api, useHub, Card, CardHead, Loading, Empty, Pill, ScoreRing, PctText, qs, isoDay, periodLabel, fmtDate,
    REPORT_STATUS, FREQ_LABEL, filterCls, btnPrimary, btnGhost, btnSmall, thCls, tdCls,
    type ReportRow, type Frequency, type ReportStatus,
} from "../_components/shared"

const SLOTS: { freq: Frequency; title: string; icon: React.ReactNode; range: (d: Date) => [Date, Date] }[] = [
    { freq: "DAILY", title: "Today (daily)", icon: <CalendarDays size={16} />, range: d => [d, d] },
    { freq: "WEEKLY", title: "This week", icon: <CalendarRange size={16} />, range: d => [startOfWeek(d, { weekStartsOn: 1 }), endOfWeek(d, { weekStartsOn: 1 })] },
    { freq: "MONTHLY", title: "This month", icon: <Calendar size={16} />, range: d => [startOfMonth(d), endOfMonth(d)] },
]

export default function MyReportsPage() {
    const router = useRouter()
    const { status } = useHubPerms()
    const { missing, fail } = useHub()
    const [current, setCurrent] = useState<ReportRow[]>([])
    const [history, setHistory] = useState<ReportRow[]>([])
    const [loading, setLoading] = useState(true)
    const [histLoading, setHistLoading] = useState(true)
    const [freq, setFreq] = useState<"" | Frequency>("")
    const [st, setSt] = useState<"" | ReportStatus>("")
    const [starting, setStarting] = useState<Frequency | null>(null)
    const today = isoDay(new Date())

    const loadCurrent = useCallback(async () => {
        setLoading(true)
        try {
            const from = isoDay(new Date(Math.min(startOfWeek(new Date(), { weekStartsOn: 1 }).getTime(), startOfMonth(new Date()).getTime())))
            setCurrent((await api<{ reports: ReportRow[] }>(`/reports${qs({ scope: "mine", from })}`)).reports ?? [])
        } catch (e) { fail(e, "Could not load reports") }
        finally { setLoading(false) }
    }, [fail])

    const loadHistory = useCallback(async () => {
        setHistLoading(true)
        try { setHistory((await api<{ reports: ReportRow[] }>(`/reports${qs({ scope: "mine", frequency: freq, status: st })}`)).reports ?? []) }
        catch (e) { fail(e, "Could not load reports") }
        finally { setHistLoading(false) }
    }, [freq, st, fail])

    useEffect(() => { if (status === "authenticated") loadCurrent() }, [status, loadCurrent])
    useEffect(() => { if (status === "authenticated") loadHistory() }, [status, loadHistory])

    const findCurrent = (f: Frequency) => current.find(r => r.frequency === f && isoDay(r.periodStart) <= today && isoDay(r.periodEnd) >= today) ?? null

    async function start(f: Frequency) {
        setStarting(f)
        try {
            const d = await api<{ report: { id: string } }>("/reports", { method: "POST", body: { frequency: f } })
            router.push(`/performance/hub/reports/${d.report.id}`)
        } catch (e) { fail(e); setStarting(null) }
    }

    return (
        <HubShell title="My DWM Reports" subtitle="Your daily, weekly and monthly KPI reports." missing={missing}>
            <OpenFromQuery ready={status === "authenticated"} onOpen={id => router.push(`/performance/hub/reports/${id}`)} />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                {SLOTS.map(s => {
                    const r = findCurrent(s.freq)
                    const [a, b] = s.range(new Date())
                    const period = s.freq === "DAILY" ? format(a, "EEE, dd MMM yyyy") : s.freq === "MONTHLY" ? format(a, "MMMM yyyy") : `${format(a, "dd MMM")} – ${format(b, "dd MMM yyyy")}`
                    return (
                        <Card key={s.freq} className="p-4 flex flex-col">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="flex items-center gap-2 text-[14px] font-semibold text-[var(--text)]"><span className="text-[var(--accent)]">{s.icon}</span>{s.title}</p>
                                    <p className="text-[12px] text-[var(--text3)] mt-0.5">{period}</p>
                                </div>
                                {loading ? <Loader2 size={18} className="animate-spin text-[var(--text3)]" /> : <ScoreRing score={r?.score ?? null} size={58} />}
                            </div>
                            <div className="flex items-center gap-2 mt-3 min-h-[22px]">
                                {r ? (<>
                                    <Pill tone={REPORT_STATUS[r.status]} />
                                    <span className="text-[12px] text-[var(--text2)]"><span className="font-mono">{r.kpiWithValues}/{r.kpiTotal}</span> KPIs</span>
                                    {r.redCount > 0 && <span className="text-[12px] font-semibold text-red-600">{r.redCount} RED</span>}
                                </>) : !loading && <span className="text-[12px] text-[var(--text3)]">Not started</span>}
                            </div>
                            <div className="mt-auto pt-4">
                                {r ? (
                                    <Link href={`/performance/hub/reports/${r.id}`} className={`${r.status === "DRAFT" || r.status === "RETURNED" ? btnPrimary : btnGhost} w-full`}>
                                        {r.status === "DRAFT" ? "Continue" : r.status === "RETURNED" ? "Fix & resubmit" : "Open"} <ArrowRight size={14} />
                                    </Link>
                                ) : (
                                    <button className={`${btnPrimary} w-full`} onClick={() => start(s.freq)} disabled={loading || !!starting}>
                                        {starting === s.freq ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Start
                                    </button>
                                )}
                            </div>
                        </Card>
                    )
                })}
            </div>

            <Card>
                <CardHead title="History" right={<>
                    <select className={filterCls} value={freq} onChange={e => setFreq(e.target.value as Frequency | "")} aria-label="Frequency">
                        <option value="">All frequencies</option>
                        {(Object.keys(FREQ_LABEL) as Frequency[]).map(f => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
                    </select>
                    <select className={filterCls} value={st} onChange={e => setSt(e.target.value as ReportStatus | "")} aria-label="Status">
                        <option value="">All statuses</option>
                        {(Object.keys(REPORT_STATUS) as ReportStatus[]).map(s => <option key={s} value={s}>{REPORT_STATUS[s].label}</option>)}
                    </select>
                </>} />
                {histLoading ? <Loading /> : history.length === 0 ? (
                    <Empty icon={<ClipboardList size={40} />} title="No reports yet" sub="Start today's daily report above." />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead><tr>
                                <th className={thCls}>Period</th><th className={thCls}>Frequency</th><th className={thCls}>Template</th>
                                <th className={thCls}>Status</th><th className={`${thCls} text-right`}>KPIs</th><th className={`${thCls} text-right`}>RED</th>
                                <th className={`${thCls} text-right`}>Score</th><th className={thCls}>Submitted</th><th className={thCls} />
                            </tr></thead>
                            <tbody className="divide-y divide-[var(--border)]">
                                {history.map(r => (
                                    <tr key={r.id} className="hover:bg-[var(--surface2)]/60 cursor-pointer" onClick={() => router.push(`/performance/hub/reports/${r.id}`)}>
                                        <td className={`${tdCls} font-mono text-[12.5px] whitespace-nowrap`}>{periodLabel(r)}</td>
                                        <td className={tdCls}>{FREQ_LABEL[r.frequency]}</td>
                                        <td className={`${tdCls} text-[var(--text2)]`}>{r.template.name} <span className="font-mono text-[var(--text3)]">v{r.template.version}</span></td>
                                        <td className={tdCls}><Pill tone={REPORT_STATUS[r.status]} /></td>
                                        <td className={`${tdCls} text-right font-mono`}>{r.kpiWithValues}/{r.kpiTotal}</td>
                                        <td className={`${tdCls} text-right font-mono ${r.redCount ? "text-red-600 font-semibold" : "text-[var(--text3)]"}`}>{r.redCount}</td>
                                        <td className={`${tdCls} text-right`}><PctText value={r.score} /></td>
                                        <td className={`${tdCls} text-[12px] text-[var(--text2)]`}>{fmtDate(r.submittedAt)}</td>
                                        <td className={`${tdCls} text-right`}><span className={btnSmall}>Open</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </HubShell>
    )
}
