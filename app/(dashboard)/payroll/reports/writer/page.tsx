"use client"

import { useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { Download, Eye, Loader2, Columns3, CheckSquare, Square } from "lucide-react"
import { can } from "@/lib/can"
import { payrollYears, currentPayrollMonth, currentPayrollYear } from "../../_components/payroll-years"
import ReportsNav from "../_components/ReportsNav"
import { REPORT_COLUMNS, REPORT_GROUPS, type ReportGroup } from "@/lib/report-writer"

const loadXLSX = () => import("xlsx")
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const COLS_KEY = "growus.reportWriter.columns"
const DEFAULT_COLS = REPORT_COLUMNS.filter(c => c.preset).map(c => c.key)
const byKey = new Map(REPORT_COLUMNS.map(c => [c.key, c]))

type Site = { id: string; name: string }
type Row = Record<string, string | number>

const PRESETS: { label: string; keys: () => string[] }[] = [
    { label: "Default", keys: () => DEFAULT_COLS },
    {
        label: "Actual earnings",
        keys: () => REPORT_COLUMNS.filter(c => ["empCode", "empName", "surname", "designation", "site", "monthDays", "paidDays"].includes(c.key) || c.group === "actual").map(c => c.key),
    },
    {
        label: "Theoretical (TH)",
        keys: () => REPORT_COLUMNS.filter(c => ["empCode", "empName", "surname", "designation", "site"].includes(c.key) || c.group === "th").map(c => c.key),
    },
    {
        label: "Actual + TH",
        keys: () => REPORT_COLUMNS.filter(c => ["empCode", "empName", "surname", "designation", "site", "monthDays", "paidDays"].includes(c.key) || c.group === "actual" || c.group === "th").map(c => c.key),
    },
    { label: "Everything", keys: () => REPORT_COLUMNS.map(c => c.key) },
]

export default function ReportWriterPage() {
    const { data: session } = useSession()
    const [month, setMonth] = useState(currentPayrollMonth())
    const [year, setYear] = useState(currentPayrollYear())
    const [siteId, setSiteId] = useState("")
    const [sites, setSites] = useState<Site[]>([])
    const [cols, setCols] = useState<string[]>(DEFAULT_COLS)
    const [busy, setBusy] = useState<"preview" | "download" | null>(null)
    const [preview, setPreview] = useState<{ columns: string[]; rows: Row[]; total: number } | null>(null)

    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(COLS_KEY) || "null")
            if (Array.isArray(saved) && saved.length) setCols(saved.filter((k: string) => byKey.has(k)))
        } catch { /* first visit / storage blocked */ }
        fetch("/api/sites?isActive=true").then(r => r.json()).then(d => { if (Array.isArray(d)) setSites(d) }).catch(() => {})
    }, [])
    useEffect(() => { try { localStorage.setItem(COLS_KEY, JSON.stringify(cols)) } catch { /* ignore */ } }, [cols])
    useEffect(() => { setPreview(null) }, [month, year, siteId])

    // Ticked columns in catalogue order, so the sheet always reads the same way.
    const ordered = useMemo(() => REPORT_COLUMNS.filter(c => cols.includes(c.key)).map(c => c.key), [cols])
    const toggle = (k: string) => setCols(c => (c.includes(k) ? c.filter(x => x !== k) : [...c, k]))
    const toggleGroup = (g: ReportGroup, on: boolean) => {
        const keys = REPORT_COLUMNS.filter(c => c.group === g).map(c => c.key)
        setCols(c => (on ? Array.from(new Set([...c, ...keys])) : c.filter(k => !keys.includes(k))))
    }

    const siteLabel = siteId ? sites.find(s => s.id === siteId)?.name ?? "Site" : "All sites"
    const period = `${MONTHS[month - 1]} ${year}`

    const fetchRows = async () => {
        const qs = new URLSearchParams({ month: String(month), year: String(year), columns: ordered.join(",") })
        if (siteId) qs.set("siteId", siteId)
        const res = await fetch(`/api/payroll/reports/writer?${qs}`)
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(d?.error || "Could not build the report")
        return d as { columns: string[]; rows: Row[]; total: number }
    }

    const doPreview = async () => {
        if (!ordered.length) { toast.error("Tick at least one column."); return }
        setBusy("preview")
        try { setPreview(await fetchRows()) } catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
    }

    const doDownload = async () => {
        if (!ordered.length) { toast.error("Tick at least one column."); return }
        setBusy("download")
        try {
            const d = await fetchRows()
            if (!d.rows.length) { toast.error(`No payroll for ${period}${siteId ? ` at ${siteLabel}` : ""}.`); return }
            const XLSX = await loadXLSX()
            const header = d.columns.map(k => byKey.get(k)?.label ?? k)
            const body = d.rows.map((r, i) => [i + 1, ...d.columns.map(k => r[k] ?? "")])
            const totals = ["", ...d.columns.map((k, i) => {
                if (byKey.get(k)?.money) return Math.round(d.rows.reduce((s, r) => s + (Number(r[k]) || 0), 0) * 100) / 100
                return i === 0 ? "TOTAL" : ""
            })]
            const aoa = [
                [`Report Writer — ${period} — ${siteLabel}`],
                [`${d.rows.length} employees · generated ${new Date().toLocaleString("en-IN")}`],
                [],
                ["Sr", ...header],
                ...body,
                totals,
            ]
            const ws = XLSX.utils.aoa_to_sheet(aoa)
            ws["!cols"] = [{ wch: 5 }, ...d.columns.map(k => ({ wch: Math.max(10, (byKey.get(k)?.label.length ?? 8) + 2, k.startsWith("address") ? 40 : 0, k === "empName" ? 22 : 0) }))]
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, "Report")
            XLSX.writeFile(wb, `Report_${MONTHS[month - 1]}_${year}${siteId ? "_" + siteLabel.replace(/[^\w]+/g, "_") : ""}.xlsx`)
            toast.success(`Downloaded ${d.rows.length} rows`)
        } catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
    }

    if (session && !can(session, "payroll.view")) {
        return <div className="p-8 text-center text-sm text-[var(--text3)]">Access denied</div>
    }

    const card = "rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm"
    const sel = "h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--text)] outline-none"

    return (
        <div className="flex flex-col gap-5 p-4 pb-12 lg:p-0">
            <ReportsNav title="Report Writer" subtitle="Pick a month, tick the columns you need, download." />

            {/* Filters */}
            <div className={`${card} flex flex-wrap items-end gap-3 p-4`}>
                <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--text3)]">Month
                    <select className={sel} value={month} onChange={e => setMonth(Number(e.target.value))}>
                        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--text3)]">Year
                    <select className={sel} value={year} onChange={e => setYear(Number(e.target.value))}>
                        {payrollYears().map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </label>
                <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs font-semibold text-[var(--text3)]">Site
                    <select className={sel} value={siteId} onChange={e => setSiteId(e.target.value)}>
                        <option value="">All sites</option>
                        {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </label>
                <div className="flex gap-2">
                    <button onClick={doPreview} disabled={busy !== null}
                        className="flex h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--text2)] disabled:opacity-60">
                        {busy === "preview" ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />} Preview
                    </button>
                    <button onClick={doDownload} disabled={busy !== null}
                        className="flex h-10 items-center gap-2 rounded-lg bg-[#0b5cff] px-4 text-sm font-semibold text-white disabled:opacity-60">
                        {busy === "download" ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Download Excel
                    </button>
                </div>
            </div>

            {/* Columns */}
            <div className={card}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface2)] px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
                        <Columns3 size={15} className="text-[var(--accent)]" /> Columns
                        <span className="text-xs font-semibold text-[var(--text3)]">{ordered.length} of {REPORT_COLUMNS.length} ticked</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {PRESETS.map(p => (
                            <button key={p.label} onClick={() => setCols(p.keys())}
                                className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-semibold text-[var(--text2)] hover:border-[#0b5cff] hover:text-[#0b5cff]">
                                {p.label}
                            </button>
                        ))}
                        <button onClick={() => setCols([])} className="rounded-full px-3 py-1 text-xs font-semibold text-[var(--text3)] hover:text-red-600">Clear</button>
                    </div>
                </div>
                <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
                    {REPORT_GROUPS.map(g => {
                        const items = REPORT_COLUMNS.filter(c => c.group === g.id)
                        const on = items.filter(c => cols.includes(c.key)).length
                        const all = on === items.length
                        return (
                            <div key={g.id} className="rounded-xl border border-[var(--border)] p-3">
                                <button onClick={() => toggleGroup(g.id, !all)} className="mb-2 flex w-full items-center justify-between text-left">
                                    <span className="text-[13px] font-bold text-[var(--text)]">{g.label}</span>
                                    <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--text3)]">
                                        {all ? <CheckSquare size={13} className="text-[#0b5cff]" /> : <Square size={13} />} {on}/{items.length}
                                    </span>
                                </button>
                                <div className="flex flex-wrap gap-1.5">
                                    {items.map(c => {
                                        const ticked = cols.includes(c.key)
                                        return (
                                            <label key={c.key}
                                                className={`flex cursor-pointer select-none items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${ticked ? "border-[#c7dbff] bg-[#e8effe] text-[#0b5cff]" : "border-[var(--border)] text-[var(--text2)]"}`}>
                                                <input type="checkbox" className="h-3.5 w-3.5 accent-[#0b5cff]" checked={ticked} onChange={() => toggle(c.key)} />
                                                {c.label}
                                            </label>
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })}
                </div>
                <p className="m-0 border-t border-[var(--border)] px-4 py-2.5 text-[11.5px] text-[var(--text3)]">
                    <b>Actual</b> = paid after attendance. <b>TH</b> = the full-month salary structure the month was calculated on.
                    Bank, KYC and personal columns come out blank if your role can&apos;t see them. Your ticks are remembered on this device.
                </p>
            </div>

            {/* Preview */}
            {preview && (
                <div className={card}>
                    <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 text-sm font-bold text-[var(--text)]">
                        <span>{period} · {siteLabel}</span>
                        <span className="text-xs font-semibold text-[var(--text3)]">{preview.total} rows{preview.total > 50 ? " · first 50 shown" : ""}</span>
                    </div>
                    {preview.rows.length === 0 ? (
                        <p className="m-0 p-8 text-center text-sm text-[var(--text3)]">No payroll for this month{siteId ? " at this site" : ""}. Process it first.</p>
                    ) : (
                        <div className="max-h-[480px] overflow-auto">
                            <table className="w-full border-collapse text-xs">
                                <thead className="sticky top-0 bg-[var(--surface2)]">
                                    <tr>
                                        <th className="border-b border-[var(--border)] px-2 py-2 text-left font-bold text-[var(--text2)]">Sr</th>
                                        {preview.columns.map(k => (
                                            <th key={k} className={`whitespace-nowrap border-b border-[var(--border)] px-2 py-2 font-bold text-[var(--text2)] ${byKey.get(k)?.money ? "text-right" : "text-left"}`}>{byKey.get(k)?.label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {preview.rows.slice(0, 50).map((r, i) => (
                                        <tr key={i} className="border-b border-[var(--border)]">
                                            <td className="px-2 py-1.5 text-[var(--text3)]">{i + 1}</td>
                                            {preview.columns.map(k => (
                                                <td key={k} className={`whitespace-nowrap px-2 py-1.5 text-[var(--text)] ${byKey.get(k)?.money ? "text-right tabular-nums" : ""}`}>
                                                    {byKey.get(k)?.money ? Number(r[k] || 0).toLocaleString("en-IN") : String(r[k] ?? "")}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
