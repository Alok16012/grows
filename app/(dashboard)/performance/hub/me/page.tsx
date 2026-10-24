"use client"
// My Performance — my own monthly KRA/KPI scorecard.
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { Gauge, ArrowRight } from "lucide-react"
import { HubShell, useHubPerms } from "../_components/HubNav"
import { ScorecardView } from "../_components/ScorecardView"
import {
    api, useHub, Card, Loading, Empty, qs, filterCls, btnPrimary,
    type Scorecards, type ScoreRow, type EmployeeScorecard,
} from "../_components/shared"

export default function MyPerformancePage() {
    const { status } = useHubPerms()
    const { missing, fail } = useHub()
    const [month, setMonth] = useState(format(new Date(), "yyyy-MM"))
    const [approvedOnly, setApprovedOnly] = useState(false)
    const [me, setMe] = useState<ScoreRow | null>(null)
    const [card, setCard] = useState<EmployeeScorecard | null>(null)
    const [loading, setLoading] = useState(true)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            // The session doesn't carry the employee id: the scope=me row does.
            const s = await api<Scorecards>(`/scorecards${qs({ month, approvedOnly, scope: "me", format: "json" })}`)
            const row = s.rows?.[0] ?? null
            setMe(row)
            setCard(row ? await api<EmployeeScorecard>(`/scorecards/employee/${row.employee.id}${qs({ month, approvedOnly })}`) : null)
        } catch (e) { fail(e, "Could not load your scorecard") }
        finally { setLoading(false) }
    }, [month, approvedOnly, fail])

    useEffect(() => { if (status === "authenticated") load() }, [status, load])

    return (
        <HubShell title="My Performance" subtitle={me ? <span>{me.roleLabel || "Your scorecard"} · {format(new Date(month + "-01T00:00:00"), "MMMM yyyy")}</span> : "Your monthly KRA/KPI scorecard."}
            missing={missing}
            actions={<>
                <label className="inline-flex items-center gap-2 text-[13px] text-[var(--text2)] cursor-pointer select-none">
                    <input type="checkbox" className="accent-[var(--accent)] w-4 h-4" checked={approvedOnly} onChange={e => setApprovedOnly(e.target.checked)} /> Approved only
                </label>
                <input type="month" className={`${filterCls} !h-[38px] font-mono`} value={month} max={format(new Date(), "yyyy-MM")} onChange={e => e.target.value && setMonth(e.target.value)} aria-label="Month" />
            </>}>
            {loading ? <Card><Loading /></Card> : !card ? (
                <Card><Empty icon={<Gauge size={40} />} title="No scorecard for this month"
                    sub="Once you have a KPI template and file your daily, weekly and monthly reports, your scorecard builds up here."
                    action={<Link href="/performance/hub/reports" className={btnPrimary}>My DWM Reports <ArrowRight size={14} /></Link>} /></Card>
            ) : (<>
                {me && (me.pending > 0 || me.red > 0) && (
                    <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[12.5px] text-[var(--text2)]">
                        {me.pending > 0 && <span><b className="font-mono text-[var(--amber)]">{me.pending}</b> report{me.pending === 1 ? "" : "s"} waiting for approval</span>}
                        {me.red > 0 && <span><b className="font-mono text-red-600">{me.red}</b> RED KPI{me.red === 1 ? "" : "s"} this month</span>}
                    </div>
                )}
                <ScorecardView data={card} />
            </>)}
        </HubShell>
    )
}
