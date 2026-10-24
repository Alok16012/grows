"use client"
// Review Queue — submitted DWM reports waiting for my approval, by employee.
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Inbox, CheckCircle2, Loader2, ArrowRight } from "lucide-react"
import { OpenFromQuery } from "@/components/OpenFromQuery"
import { HubShell, useHubPerms, queueChanged } from "../_components/HubNav"
import {
    api, useHub, Card, CardHead, Loading, Empty, PctText, qs, periodLabel, fmtDate, fullName,
    FREQ_LABEL, filterCls, btnSmall, btnSuccess, thCls, tdCls,
    type ReportRow, type Frequency, type EmpLite,
} from "../_components/shared"

export default function ReviewQueuePage() {
    const router = useRouter()
    const { status } = useHubPerms()
    const { missing, fail } = useHub()
    const [rows, setRows] = useState<ReportRow[]>([])
    const [loading, setLoading] = useState(true)
    const [freq, setFreq] = useState<"" | Frequency>("")
    const [busy, setBusy] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        try { setRows((await api<{ reports: ReportRow[] }>(`/reports${qs({ scope: "queue", status: "SUBMITTED", frequency: freq })}`)).reports ?? []) }
        catch (e) { fail(e, "Could not load the review queue") }
        finally { setLoading(false) }
    }, [freq, fail])

    useEffect(() => { if (status === "authenticated") load() }, [status, load])

    const groups = useMemo(() => {
        const m = new Map<string, { employee: EmpLite; reports: ReportRow[] }>()
        for (const r of rows) {
            const g = m.get(r.employee.id) ?? { employee: r.employee, reports: [] }
            g.reports.push(r)
            m.set(r.employee.id, g)
        }
        return Array.from(m.values()).sort((a, b) => fullName(a.employee).localeCompare(fullName(b.employee)))
    }, [rows])

    async function approve(ids: string[]) {
        const reds = rows.filter(r => ids.includes(r.id) && r.redCount > 0).length
        if (ids.length > 1 && !confirm(`Approve ${ids.length} reports${reds ? ` (${reds} with RED KPIs)` : ""}?`)) return
        setBusy(ids.length > 1 ? ids.join(",") : ids[0])
        let ok = 0
        for (const id of ids) {
            try { await api(`/reports/${id}`, { method: "PATCH", body: { action: "APPROVE" } }); ok++ }
            catch (e) { fail(e) ; break }
        }
        if (ok) { toast.success(`${ok} report${ok === 1 ? "" : "s"} approved`); queueChanged() }
        setBusy(null)
        load()
    }

    const open = (id: string) => router.push(`/performance/hub/reports/${id}?from=review`)

    return (
        <HubShell title="Review Queue" subtitle="Daily, weekly and monthly reports waiting for your approval." missing={missing}
            actions={
                <select className={filterCls} value={freq} onChange={e => setFreq(e.target.value as Frequency | "")} aria-label="Frequency">
                    <option value="">All frequencies</option>
                    {(Object.keys(FREQ_LABEL) as Frequency[]).map(f => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
                </select>
            }>
            <OpenFromQuery ready={status === "authenticated"} onOpen={open} />
            {loading ? <Card><Loading /></Card> : groups.length === 0 ? (
                <Card><Empty icon={<Inbox size={40} />} title="Nothing to review" sub="Submitted reports from the people you review will appear here." /></Card>
            ) : (
                <div className="space-y-4">
                    {groups.map(g => {
                        const ids = g.reports.map(r => r.id)
                        return (
                            <Card key={g.employee.id}>
                                <CardHead
                                    title={fullName(g.employee)}
                                    sub={<span><span className="font-mono">{g.employee.employeeId}</span> · {g.reports.length} report{g.reports.length === 1 ? "" : "s"} waiting</span>}
                                    right={g.reports.length > 1 ? (
                                        <button className={btnSuccess + " !py-1.5 !px-3 !text-[12px]"} onClick={() => approve(ids)} disabled={!!busy}>
                                            {busy === ids.join(",") ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Approve all
                                        </button>
                                    ) : undefined}
                                />
                                <div className="overflow-x-auto">
                                    <table className="w-full text-[13px]">
                                        <thead><tr>
                                            <th className={thCls}>Report</th><th className={thCls}>Template</th>
                                            <th className={`${thCls} text-right`}>KPIs</th><th className={`${thCls} text-right`}>RED</th>
                                            <th className={`${thCls} text-right`}>Score</th><th className={thCls}>Submitted</th><th className={`${thCls} text-right`}>Actions</th>
                                        </tr></thead>
                                        <tbody className="divide-y divide-[var(--border)]">
                                            {g.reports.map(r => (
                                                <tr key={r.id} className="hover:bg-[var(--surface2)]/60">
                                                    <td className={tdCls}>
                                                        <button className="text-left" onClick={() => open(r.id)}>
                                                            <span className="font-semibold text-[var(--text)] hover:text-[var(--accent)]">{FREQ_LABEL[r.frequency]}</span>
                                                            <span className="font-mono text-[12px] text-[var(--text2)] ml-2">{periodLabel(r)}</span>
                                                        </button>
                                                    </td>
                                                    <td className={`${tdCls} text-[var(--text2)]`}>{r.template.name} <span className="font-mono text-[var(--text3)]">v{r.template.version}</span></td>
                                                    <td className={`${tdCls} text-right font-mono`}>{r.kpiWithValues}/{r.kpiTotal}</td>
                                                    <td className={`${tdCls} text-right font-mono ${r.redCount ? "text-red-600 font-semibold" : "text-[var(--text3)]"}`}>{r.redCount}</td>
                                                    <td className={`${tdCls} text-right`}><PctText value={r.score} /></td>
                                                    <td className={`${tdCls} text-[12px] text-[var(--text2)]`}>{fmtDate(r.submittedAt, "dd MMM, HH:mm")}</td>
                                                    <td className={`${tdCls} text-right whitespace-nowrap`}>
                                                        <button className={btnSmall} onClick={() => open(r.id)}>Open <ArrowRight size={12} /></button>
                                                        <button className={`${btnSmall} ml-1.5 hover:!text-[var(--success)] hover:!border-[var(--success-border)]`} disabled={!!busy}
                                                            title={r.redCount ? "Has RED KPIs — open it to check the remarks" : "Approve"} onClick={() => approve([r.id])}>
                                                            {busy === r.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Approve
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        )
                    })}
                </div>
            )}
        </HubShell>
    )
}
