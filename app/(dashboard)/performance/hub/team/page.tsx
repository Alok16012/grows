"use client"
// Team Dashboard — monthly KRA/KPI scorecards of everyone reporting to me.
import { useCallback, useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { Users, Gauge, CalendarCheck, Inbox, AlertTriangle, TrendingDown, Download, LayoutDashboard, ExternalLink } from "lucide-react"
import Link from "next/link"
import { StatCard, statGridClass, type StatTone } from "@/components/StatCard"
import { HubShell, useHubPerms } from "../_components/HubNav"
import { ScorecardView } from "../_components/ScorecardView"
import {
    api, useHub, Card, CardHead, Loading, Empty, Drawer, PctText, qs, fullName, pctColor, HUB,
    btnGhost, btnSmall, filterCls, thCls, tdCls,
    type Scorecards, type ScoreRow, type EmployeeScorecard,
} from "../_components/shared"

const toneFor = (p: number | null | undefined): StatTone => p === null || p === undefined ? "slate" : p >= 90 ? "green" : p >= 70 ? "amber" : "rose"

export default function TeamDashboardPage() {
    const { status } = useHubPerms()
    const { missing, fail } = useHub()
    const [month, setMonth] = useState(format(new Date(), "yyyy-MM"))
    const [approvedOnly, setApprovedOnly] = useState(false)
    const [data, setData] = useState<Scorecards | null>(null)
    const [loading, setLoading] = useState(true)
    const [drill, setDrill] = useState<ScoreRow | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        try { setData(await api<Scorecards>(`/scorecards${qs({ month, approvedOnly, scope: "team", format: "json" })}`)) }
        catch (e) { fail(e, "Could not load scorecards") }
        finally { setLoading(false) }
    }, [month, approvedOnly, fail])

    useEffect(() => { if (status === "authenticated") load() }, [status, load])

    // One column per KRA title, in the order they first appear.
    const kraCols = useMemo(() => {
        const seen: string[] = []
        for (const r of data?.rows ?? []) for (const k of r.kras) if (!seen.includes(k.title)) seen.push(k.title)
        return seen
    }, [data])

    const s = data?.summary
    const csvHref = `${HUB}/scorecards${qs({ month, approvedOnly, scope: "team", format: "csv" })}`

    return (
        <HubShell title="Team Dashboard" subtitle="Monthly KRA/KPI performance of everyone reporting to you." missing={missing}
            actions={<>
                <label className="inline-flex items-center gap-2 text-[13px] text-[var(--text2)] cursor-pointer select-none">
                    <input type="checkbox" className="accent-[var(--accent)] w-4 h-4" checked={approvedOnly} onChange={e => setApprovedOnly(e.target.checked)} /> Approved only
                </label>
                <input type="month" className={`${filterCls} !h-[38px] font-mono`} value={month} max={format(new Date(), "yyyy-MM")} onChange={e => e.target.value && setMonth(e.target.value)} aria-label="Month" />
                <a className={btnGhost} href={csvHref} download><Download size={14} /> Export CSV</a>
            </>}>
            {loading && !data ? <Card><Loading /></Card> : !data ? null : (<>
                <div className={`${statGridClass(6)} mb-5`}>
                    <StatCard label="Employees" value={s?.employees ?? 0} tone="blue" icon={<Users />} seed={0} />
                    <StatCard label="Avg score" value={s?.avgScore === null || s?.avgScore === undefined ? "—" : `${Math.round(s.avgScore)}%`} tone={toneFor(s?.avgScore)} icon={<Gauge />} seed={1} />
                    <StatCard label="Avg compliance" value={s?.avgCompliance === null || s?.avgCompliance === undefined ? "—" : `${Math.round(s.avgCompliance)}%`} tone={toneFor(s?.avgCompliance)} icon={<CalendarCheck />} seed={2} />
                    <StatCard label="Pending review" value={s?.pendingReview ?? 0} tone={(s?.pendingReview ?? 0) > 0 ? "amber" : "teal"} icon={<Inbox />} seed={3} />
                    <StatCard label="Red KPIs" value={s?.redKpis ?? 0} tone={(s?.redKpis ?? 0) > 0 ? "rose" : "teal"} icon={<AlertTriangle />} seed={4} />
                    <StatCard label="Below 70%" value={s?.below70 ?? 0} tone={(s?.below70 ?? 0) > 0 ? "rose" : "teal"} icon={<TrendingDown />} seed={5} />
                </div>

                <Card>
                    <CardHead title="Scorecards" sub={`${format(new Date(month + "-01T00:00:00"), "MMMM yyyy")}${approvedOnly ? " · approved reports only" : ""}`}
                        right={loading ? <span className="text-[11.5px] text-[var(--text3)]">Updating…</span> : undefined} />
                    {data.rows.length === 0 ? (
                        <Empty icon={<LayoutDashboard size={40} />} title="No scorecards for this month" sub="People you review appear here once they have reports." />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[13px]">
                                <thead><tr>
                                    <th className={thCls}>Employee</th>
                                    <th className={thCls}>Role</th>
                                    {kraCols.map(t => <th key={t} className={`${thCls} text-right max-w-[120px] truncate`} title={t}>{t}</th>)}
                                    <th className={`${thCls} min-w-[140px]`}>Overall</th>
                                    <th className={`${thCls} text-center`}>Grade</th>
                                    <th className={`${thCls} text-right`}>Compliance</th>
                                    <th className={`${thCls} text-right`}>Red</th>
                                    <th className={`${thCls} text-right`}>Pending</th>
                                </tr></thead>
                                <tbody className="divide-y divide-[var(--border)]">
                                    {data.rows.map(r => (
                                        <tr key={r.employee.id} className="hover:bg-[var(--surface2)]/60 cursor-pointer" onClick={() => setDrill(r)}>
                                            <td className={tdCls}>
                                                <p className="font-semibold text-[var(--text)] whitespace-nowrap">{fullName(r.employee)}</p>
                                                <p className="text-[11.5px] text-[var(--text3)] whitespace-nowrap"><span className="font-mono">{r.employee.employeeId}</span>{r.employee.designation ? ` · ${r.employee.designation}` : ""}</p>
                                            </td>
                                            <td className={`${tdCls} text-[12.5px] text-[var(--text2)]`}>{r.roleLabel || "—"}</td>
                                            {kraCols.map(t => {
                                                const k = r.kras.find(x => x.title === t)
                                                return <td key={t} className={`${tdCls} text-right`}>{k ? <PctText value={k.pct} /> : <span className="text-[var(--text3)]">—</span>}</td>
                                            })}
                                            <td className={tdCls}>
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 h-1.5 rounded-full bg-[var(--surface2)] overflow-hidden min-w-[60px]">
                                                        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, r.overall ?? 0))}%`, background: pctColor(r.overall) }} />
                                                    </div>
                                                    <PctText value={r.overall} className="text-[12.5px] w-[40px] text-right" />
                                                </div>
                                            </td>
                                            <td className={`${tdCls} text-center font-semibold whitespace-nowrap text-[12px]`} style={{ color: pctColor(r.overall) }}>{r.grade || "—"}</td>
                                            <td className={`${tdCls} text-right`}><PctText value={r.compliance} /></td>
                                            <td className={`${tdCls} text-right font-mono ${r.red ? "text-red-600 font-semibold" : "text-[var(--text3)]"}`}>{r.red}</td>
                                            <td className={`${tdCls} text-right font-mono ${r.pending ? "text-[var(--amber)] font-semibold" : "text-[var(--text3)]"}`}>{r.pending}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </>)}

            {drill && <DrillDrawer row={drill} month={month} onClose={() => setDrill(null)} fail={fail} />}
        </HubShell>
    )
}

function DrillDrawer({ row, month, onClose, fail }: { row: ScoreRow; month: string; onClose: () => void; fail: (e: unknown, f?: string) => void }) {
    const [data, setData] = useState<EmployeeScorecard | null>(null)
    const [loading, setLoading] = useState(true)
    useEffect(() => {
        let live = true
        setLoading(true)
        api<EmployeeScorecard>(`/scorecards/employee/${row.employee.id}${qs({ month })}`)
            .then(d => { if (live) setData(d) })
            .catch(e => fail(e, "Could not load scorecard"))
            .finally(() => { if (live) setLoading(false) })
        return () => { live = false }
    }, [row.employee.id, month, fail])

    return (
        <Drawer width="max-w-3xl" onClose={onClose}
            header={<>
                <h2 className="text-[16px] font-semibold text-[var(--text)]">{fullName(row.employee)}</h2>
                <p className="text-[12px] text-[var(--text3)]"><span className="font-mono">{row.employee.employeeId}</span>{row.employee.designation ? ` · ${row.employee.designation}` : ""}{row.roleLabel ? ` · ${row.roleLabel}` : ""} · {format(new Date(month + "-01T00:00:00"), "MMMM yyyy")}</p>
            </>}
            footer={row.pending > 0 ? (
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] text-[var(--amber)] font-medium">{row.pending} report{row.pending === 1 ? "" : "s"} waiting for review</span>
                    <Link href="/performance/hub/review" className={btnSmall}>Review Queue <ExternalLink size={12} /></Link>
                </div>
            ) : undefined}>
            <div className="p-5">{loading ? <Loading /> : data ? <ScorecardView data={data} /> : null}</div>
        </Drawer>
    )
}
