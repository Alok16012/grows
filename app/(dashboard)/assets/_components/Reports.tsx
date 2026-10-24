"use client"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { format, subMonths, startOfMonth } from "date-fns"
import { Loader2, FileBarChart2, Download, Play } from "lucide-react"
import { StockItem, api, qs, readError, useApiError, Card, Empty, Label, selectCls, inputCls, btnPrimary, btnGhost, thCls } from "./shared"

const REPORTS: { id: string; label: string }[] = [
    { id: "employee-wise", label: "Employee-wise issued assets" },
    { id: "asset-wise", label: "Asset-wise distribution" },
    { id: "pending-approvals", label: "Pending approvals" },
    { id: "approved-not-issued", label: "Approved but not issued" },
    { id: "partially-fulfilled", label: "Partially fulfilled requests" },
    { id: "monthly", label: "Monthly distribution" },
    { id: "exit-clearance", label: "Exit clearance (assets to recover)" },
    { id: "size-wise", label: "Size-wise requirement" },
    { id: "returns-lost", label: "Returns, lost & damaged" },
]

type Column = string | { key: string; label?: string }
type ReportData = { columns: Column[]; rows: (Record<string, unknown> | unknown[])[] }

const colKey = (c: Column) => typeof c === "string" ? c : c.key
const colLabel = (c: Column) => typeof c === "string" ? c : (c.label ?? c.key)
function cell(row: ReportData["rows"][number], c: Column, idx: number): unknown {
    return Array.isArray(row) ? row[idx] : (row as Record<string, unknown>)[colKey(c)]
}
function show(v: unknown) {
    if (v === null || v === undefined || v === "") return "—"
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return format(new Date(v), "dd MMM yyyy")
    if (typeof v === "object") return JSON.stringify(v)
    return String(v)
}

const PALETTE = ["#2f6bff", "#14b8a6", "#f59e0b", "#8b5cf6", "#ef4444", "#0ea5e9", "#22c55e", "#64748b"]

export function ReportsTab() {
    const onError = useApiError()
    const [type, setType] = useState(REPORTS[0].id)
    const [from, setFrom] = useState(format(startOfMonth(subMonths(new Date(), 2)), "yyyy-MM-dd"))
    const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"))
    const [data, setData] = useState<ReportData | null>(null)
    const [loading, setLoading] = useState(false)
    const [exporting, setExporting] = useState(false)

    async function generate() {
        setLoading(true)
        try { setData(await api<ReportData>(`/api/assets/reports?${qs({ type, from, to, format: "json" })}`)) }
        catch (e) { onError(e, "Couldn't generate the report") }
        finally { setLoading(false) }
    }

    async function exportCsv() {
        setExporting(true)
        try {
            const res = await fetch(`/api/assets/reports?${qs({ type, from, to, format: "csv" })}`)
            if (!res.ok) { toast.error(await readError(res)); return }
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url; a.download = `assets-${type}-${from || "start"}-to-${to || "today"}.csv`
            document.body.appendChild(a); a.click(); a.remove()
            setTimeout(() => URL.revokeObjectURL(url), 1000)
        } catch { toast.error("Export failed") }
        finally { setExporting(false) }
    }

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <MonthlyChart />
                <CategoryDonut />
            </div>

            <Card>
                <div className="p-4 border-b border-[var(--border)] grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_auto] gap-3 items-end">
                    <div>
                        <Label>Report</Label>
                        <select value={type} onChange={e => { setType(e.target.value); setData(null) }} className={selectCls()}>
                            {REPORTS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                        </select>
                    </div>
                    <div><Label>From</Label><input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls()} /></div>
                    <div><Label>To</Label><input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls()} /></div>
                    <div className="flex gap-2">
                        <button className={btnPrimary} onClick={generate} disabled={loading}>{loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}Generate</button>
                        <button className={btnGhost} onClick={exportCsv} disabled={exporting}>{exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}CSV</button>
                    </div>
                </div>
                {!data ? (
                    <Empty icon={<FileBarChart2 size={36} />} title="Pick a report and press Generate" />
                ) : data.rows.length === 0 ? (
                    <Empty icon={<FileBarChart2 size={36} />} title="No rows for this period" />
                ) : (
                    <div className="overflow-x-auto max-h-[560px]">
                        <table className="w-full text-[12.5px]">
                            <thead className="bg-[var(--surface2)] sticky top-0">
                                <tr>{data.columns.map((c, i) => <th key={i} className={thCls}>{colLabel(c)}</th>)}</tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]">
                                {data.rows.map((r, ri) => (
                                    <tr key={ri} className="hover:bg-[var(--surface2)]/50">
                                        {data.columns.map((c, ci) => {
                                            const v = cell(r, c, ci)
                                            return <td key={ci} className={`px-4 py-2.5 ${typeof v === "number" ? "text-right tabular-nums" : "text-[var(--text)]"}`}>{show(v)}</td>
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <p className="px-4 py-2 text-[11.5px] text-[var(--text3)] border-t border-[var(--border)]">{data.rows.length} row{data.rows.length === 1 ? "" : "s"}</p>
                    </div>
                )}
            </Card>
        </div>
    )
}

function MonthlyChart() {
    const [points, setPoints] = useState<{ label: string; value: number }[] | null>(null)
    useEffect(() => {
        const from = format(startOfMonth(subMonths(new Date(), 5)), "yyyy-MM-dd")
        api<ReportData>(`/api/assets/reports?${qs({ type: "monthly", from, to: format(new Date(), "yyyy-MM-dd"), format: "json" })}`)
            .then(d => {
                // First column = month label, first numeric column after it = units issued.
                const cols = d.columns ?? []
                const pts = (d.rows ?? []).map(r => {
                    const label = show(cell(r, cols[0], 0))
                    let value = 0
                    for (let i = 1; i < cols.length; i++) {
                        const v = cell(r, cols[i], i)
                        if (typeof v === "number") { value = v; break }
                    }
                    return { label, value }
                })
                setPoints(pts)
            })
            .catch(() => setPoints([]))
    }, [])
    return (
        <Card className="p-5">
            <h3 className="text-[14px] font-semibold text-[var(--text)] mb-3">Monthly distribution</h3>
            {!points ? <div className="h-[200px] flex items-center justify-center"><Loader2 size={20} className="animate-spin text-[var(--accent)]" /></div>
                : points.length === 0 ? <p className="h-[200px] flex items-center justify-center text-[13px] text-[var(--text3)]">No issues in the last 6 months</p>
                    : (
                        <div className="h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={points} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                    <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                                    <Tooltip cursor={{ fill: "rgba(47,107,255,0.06)" }} />
                                    <Bar dataKey="value" name="Units" fill="#2f6bff" radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
        </Card>
    )
}

function CategoryDonut() {
    const [items, setItems] = useState<StockItem[] | null>(null)
    useEffect(() => {
        api<{ items: StockItem[] }>("/api/assets/stock").then(d => setItems(d.items ?? [])).catch(() => setItems([]))
    }, [])
    const data = useMemo(() => {
        const m = new Map<string, number>()
        for (const s of items ?? []) m.set(s.category, (m.get(s.category) ?? 0) + s.available)
        return Array.from(m, ([name, value]) => ({ name, value })).filter(x => x.value > 0).sort((a, b) => b.value - a.value)
    }, [items])
    const total = data.reduce((s, x) => s + x.value, 0)
    return (
        <Card className="p-5">
            <h3 className="text-[14px] font-semibold text-[var(--text)] mb-3">Stock by category</h3>
            {!items ? <div className="h-[200px] flex items-center justify-center"><Loader2 size={20} className="animate-spin text-[var(--accent)]" /></div>
                : data.length === 0 ? <p className="h-[200px] flex items-center justify-center text-[13px] text-[var(--text3)]">No stock on hand</p>
                    : (
                        <div className="flex items-center gap-4 h-[200px]">
                            <div className="relative w-[180px] h-[180px] shrink-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="none">
                                            {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <span className="text-[20px] font-bold text-[var(--text)] tabular-nums">{total.toLocaleString("en-IN")}</span>
                                    <span className="text-[11px] text-[var(--text3)]">available</span>
                                </div>
                            </div>
                            <ul className="flex-1 min-w-0 space-y-1.5 text-[12.5px]">
                                {data.map((x, i) => (
                                    <li key={x.name} className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                                        <span className="flex-1 truncate text-[var(--text2)]">{x.name}</span>
                                        <span className="tabular-nums font-semibold text-[var(--text)]">{x.value}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
        </Card>
    )
}
