"use client"
// One employee's monthly scorecard: overall + KRA cards with each KPI's roll-up.
import { ScoreRing, PctText, RagPill, KRA_COLORS, Card, CardHead, fmtNum, toNum, pctColor, thCls, tdCls, type EmployeeScorecard } from "./shared"

const ROLLUP_SHORT: Record<string, string> = { AVG: "Avg", SUM: "Sum", LAST: "Last", MIN: "Min", MAX: "Max" }

/** periodValues is loosely typed by the API: accept numbers or {value|actual} objects. */
function periodNums(v: unknown): (number | null)[] {
    if (!Array.isArray(v)) return []
    return v.map(x => {
        if (x === null || x === undefined) return null
        if (typeof x === "number" || typeof x === "string") return toNum(x)
        if (typeof x === "object") {
            const o = x as Record<string, unknown>
            return toNum(o.value ?? o.actual ?? o.achievementPct ?? null)
        }
        return null
    })
}

function MiniBars({ values }: { values: (number | null)[] }) {
    if (values.length === 0) return <span className="text-[var(--text3)]">—</span>
    const max = Math.max(1, ...values.map(v => v ?? 0))
    return (
        <span className="inline-flex items-end gap-[2px] h-5" title={values.map(v => v === null ? "—" : fmtNum(v)).join(" · ")}>
            {values.slice(-31).map((v, i) => (
                <span key={i} className="w-[4px] rounded-[1px]" style={{ height: v === null ? 2 : Math.max(2, (v / max) * 20), background: v === null ? "var(--border)" : "var(--accent)", opacity: v === null ? 1 : 0.75 }} />
            ))}
        </span>
    )
}

export function ScorecardView({ data }: { data: EmployeeScorecard }) {
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
                <Card className="p-3 flex items-center gap-3">
                    <ScoreRing score={data.overall} size={60} />
                    <div><p className="text-[10.5px] uppercase tracking-[0.5px] text-[var(--text3)]">Overall</p><PctText value={data.overall} className="text-[18px]" /></div>
                </Card>
                <Card className="p-3">
                    <p className="text-[10.5px] uppercase tracking-[0.5px] text-[var(--text3)]">Grade</p>
                    <p className="text-[16px] sm:text-[18px] font-bold mt-1 leading-tight" style={{ color: pctColor(data.overall) }}>{data.grade || "—"}</p>
                </Card>
                <Card className="p-3">
                    <p className="text-[10.5px] uppercase tracking-[0.5px] text-[var(--text3)]">Compliance</p>
                    <p className="text-[24px] font-bold font-mono mt-1" style={{ color: pctColor(data.compliance) }}>{data.compliance === null ? "—" : `${Math.round(data.compliance)}%`}</p>
                    <p className="text-[10.5px] text-[var(--text3)]">reports filed on time</p>
                </Card>
            </div>
            {data.kras.length === 0 && <p className="text-[13px] text-[var(--text3)] text-center py-6">No KPI data for this month.</p>}
            {data.kras.map((k, i) => (
                <Card key={k.title + i}>
                    <CardHead accent={KRA_COLORS[i % KRA_COLORS.length]} title={k.title}
                        sub={<span>Weight <span className="font-mono">{fmtNum(k.weight)}</span></span>}
                        right={<PctText value={k.pct} className="text-[15px]" />} />
                    <div className="overflow-x-auto">
                        <table className="w-full text-[12.5px]">
                            <thead><tr>
                                <th className={thCls}>KPI</th><th className={thCls}>Target</th><th className={`${thCls} text-right`}>Value</th>
                                <th className={`${thCls} text-right`}>Achv.</th><th className={thCls}>RAG</th><th className={thCls}>Trend</th>
                            </tr></thead>
                            <tbody className="divide-y divide-[var(--border)]">
                                {k.kpis.map((p, j) => (
                                    <tr key={p.name + j}>
                                        <td className={tdCls}><span className="font-medium text-[var(--text)]">{p.name}</span></td>
                                        <td className={`${tdCls} font-mono text-[var(--text2)] whitespace-nowrap`}>{p.targetLabel || fmtNum(toNum(p.target))}</td>
                                        <td className={`${tdCls} text-right font-mono whitespace-nowrap`}>
                                            {fmtNum(p.value)} <span className="text-[10px] text-[var(--text3)] font-sans">{ROLLUP_SHORT[p.rollup] ?? p.rollup}</span>
                                        </td>
                                        <td className={`${tdCls} text-right`}><PctText value={p.achievementPct} /></td>
                                        <td className={tdCls}><RagPill rag={p.rag} /></td>
                                        <td className={tdCls}><MiniBars values={periodNums(p.periodValues)} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            ))}
        </div>
    )
}
