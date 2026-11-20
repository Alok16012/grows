"use client"

import { useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { Download, Loader2, Search, Wallet } from "lucide-react"
import { can } from "@/lib/can"
import { payrollYears, currentPayrollMonth, currentPayrollYear } from "../../_components/payroll-years"
import ReportsNav from "../_components/ReportsNav"

const loadXLSX = () => import("xlsx")
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const SHORT = MONTHS.map(m => m.slice(0, 3))
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN")
const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`

type Row = {
    employeeDbId: string; empCode: string; name: string; fatherName: string; designation: string; site: string
    month: number; year: number; advance: number; gross: number; net: number; status: string
}
type View = "detail" | "summary"

export default function AdvanceReportPage() {
    const { data: session } = useSession()
    const cm = currentPayrollMonth(), cy = currentPayrollYear()
    // Default: the financial year to date (April onwards).
    const [fromY, setFromY] = useState(cm >= 4 ? cy : cy - 1)
    const [fromM, setFromM] = useState(4)
    const [toY, setToY] = useState(cy)
    const [toM, setToM] = useState(cm)
    const [siteId, setSiteId] = useState("")
    const [sites, setSites] = useState<{ id: string; name: string }[]>([])
    const [rows, setRows] = useState<Row[]>([])
    const [loading, setLoading] = useState(false)
    const [view, setView] = useState<View>("summary")
    const [search, setSearch] = useState("")

    useEffect(() => { fetch("/api/sites").then(r => r.json()).then(d => { if (Array.isArray(d)) setSites(d) }).catch(() => {}) }, [])

    useEffect(() => {
        let off = false
        setLoading(true)
        const qs = new URLSearchParams({ from: ym(fromY, fromM), to: ym(toY, toM) })
        if (siteId) qs.set("siteId", siteId)
        fetch(`/api/payroll/reports/advance?${qs}`)
            .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d?.error || "Could not load"); return d })
            .then(d => { if (!off) setRows(d.rows ?? []) })
            .catch(e => { if (!off) { setRows([]); toast.error(e.message) } })
            .finally(() => { if (!off) setLoading(false) })
        return () => { off = true }
    }, [fromY, fromM, toY, toM, siteId])

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        return q ? rows.filter(r => `${r.name} ${r.empCode} ${r.designation} ${r.site}`.toLowerCase().includes(q)) : rows
    }, [rows, search])

    // One line per employee: months recovered and the total.
    const summary = useMemo(() => {
        const m = new Map<string, Row & { months: string[]; total: number }>()
        for (const r of filtered) {
            const s = m.get(r.employeeDbId) ?? { ...r, months: [], total: 0 }
            s.months.push(`${SHORT[r.month - 1]} ${r.year}: ${inr(r.advance)}`)
            s.total += r.advance
            m.set(r.employeeDbId, s)
        }
        return Array.from(m.values()).sort((a, b) => b.total - a.total || a.empCode.localeCompare(b.empCode))
    }, [filtered])

    const total = filtered.reduce((t, r) => t + r.advance, 0)
    const range = `${SHORT[fromM - 1]} ${fromY} – ${SHORT[toM - 1]} ${toY}`
    const siteLabel = siteId ? sites.find(s => s.id === siteId)?.name ?? "Site" : "All sites"

    const download = async () => {
        if (!filtered.length) { toast.error("Nothing to download."); return }
        const XLSX = await loadXLSX()
        const wb = XLSX.utils.book_new()
        const title = [`Advance Report — ${range} — ${siteLabel}`]
        const sum = [
            title, [`${summary.length} employees · total recovered ${Math.round(total)}`], [],
            ["Sr", "Emp Code", "Name", "Father Name", "Designation", "Site", "Months", "Total Advance Recovered"],
            ...summary.map((s, i) => [i + 1, s.empCode, s.name, s.fatherName, s.designation, s.site, s.months.join("; "), Math.round(s.total * 100) / 100]),
            ["", "TOTAL", "", "", "", "", "", Math.round(total * 100) / 100],
        ]
        const det = [
            title, [`${filtered.length} deductions`], [],
            ["Sr", "Month", "Emp Code", "Name", "Designation", "Site", "Gross", "Advance Deducted", "Net Paid", "Payroll Status"],
            ...filtered.map((r, i) => [i + 1, `${SHORT[r.month - 1]} ${r.year}`, r.empCode, r.name, r.designation, r.site, r.gross, r.advance, r.net, r.status === "DRAFT" ? "Draft" : r.status === "PAID" ? "Paid" : "Locked"]),
            ["", "TOTAL", "", "", "", "", "", Math.round(total * 100) / 100, "", ""],
        ]
        const ws1 = XLSX.utils.aoa_to_sheet(sum); ws1["!cols"] = [{ wch: 5 }, { wch: 12 }, { wch: 24 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 50 }, { wch: 14 }]
        const ws2 = XLSX.utils.aoa_to_sheet(det); ws2["!cols"] = [{ wch: 5 }, { wch: 10 }, { wch: 12 }, { wch: 24 }, { wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 12 }]
        XLSX.utils.book_append_sheet(wb, ws1, "Employee summary")
        XLSX.utils.book_append_sheet(wb, ws2, "Month-wise detail")
        XLSX.writeFile(wb, `Advance_Report_${ym(fromY, fromM)}_to_${ym(toY, toM)}.xlsx`)
        toast.success("Downloaded")
    }

    if (session && !can(session, "payroll.view")) return <div className="p-8 text-center text-sm text-[var(--text3)]">Access denied</div>

    const card = "rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm"
    const sel = "h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm font-semibold text-[var(--text)] outline-none"
    const years = payrollYears()
    const th = "whitespace-nowrap px-2 py-2 font-bold"
    const td = "whitespace-nowrap px-2 py-2"

    return (
        <div className="flex flex-col gap-5 p-4 pb-12 lg:p-0">
            <ReportsNav title="Advance Report" subtitle="Advance recovered through payroll, by month and by employee." />

            <div className={`${card} flex flex-wrap items-end gap-3 p-4`}>
                <div className="flex flex-col gap-1 text-xs font-semibold text-[var(--text3)]">From
                    <div className="flex gap-1">
                        <select aria-label="From month" className={sel} value={fromM} onChange={e => setFromM(Number(e.target.value))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
                        <select aria-label="From year" className={sel} value={fromY} onChange={e => setFromY(Number(e.target.value))}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
                    </div>
                </div>
                <div className="flex flex-col gap-1 text-xs font-semibold text-[var(--text3)]">To
                    <div className="flex gap-1">
                        <select aria-label="To month" className={sel} value={toM} onChange={e => setToM(Number(e.target.value))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
                        <select aria-label="To year" className={sel} value={toY} onChange={e => setToY(Number(e.target.value))}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
                    </div>
                </div>
                <label className="flex min-w-[170px] flex-1 flex-col gap-1 text-xs font-semibold text-[var(--text3)]">Site
                    <select className={sel} value={siteId} onChange={e => setSiteId(e.target.value)}>
                        <option value="">All sites</option>
                        {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </label>
                <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs font-semibold text-[var(--text3)]">Search
                    <span className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, code, site…" className={`${sel} w-full pl-8 font-normal`} />
                    </span>
                </label>
                <button onClick={download} disabled={loading || !filtered.length}
                    className="flex h-10 items-center gap-2 rounded-lg bg-[#0b5cff] px-4 text-sm font-semibold text-white disabled:opacity-50">
                    <Download size={15} /> Download Excel
                </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                    { label: "Total recovered", value: inr(total) },
                    { label: "Employees", value: String(summary.length) },
                    { label: "Deductions", value: String(filtered.length) },
                ].map(s => (
                    <div key={s.label} className={`${card} p-4`}>
                        <div className="text-xs font-semibold text-[var(--text3)]">{s.label}</div>
                        <div className="mt-1 text-xl font-bold text-[var(--text)]">{loading ? "…" : s.value}</div>
                    </div>
                ))}
            </div>

            <div className={card}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface2)] px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-[var(--text)]"><Wallet size={15} className="text-[var(--accent)]" /> {range} · {siteLabel}</div>
                    <div className="flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
                        {([["summary", "By employee"], ["detail", "Month-wise"]] as [View, string][]).map(([v, l]) => (
                            <button key={v} onClick={() => setView(v)}
                                className={`rounded-md px-3 py-1 text-xs font-semibold ${view === v ? "bg-[#0b5cff] text-white" : "text-[var(--text2)]"}`}>{l}</button>
                        ))}
                    </div>
                </div>
                {loading ? (
                    <div className="flex items-center justify-center gap-2 p-10 text-sm text-[var(--text3)]"><Loader2 size={16} className="animate-spin" /> Loading…</div>
                ) : !filtered.length ? (
                    <p className="m-0 p-10 text-center text-sm text-[var(--text3)]">No advance deducted in {range}{siteId ? " at this site" : ""}.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-[12.5px]">
                            {view === "summary" ? (
                                <>
                                    <thead className="bg-[var(--surface2)] text-left text-[var(--text2)]"><tr>
                                        <th className={th}>Emp Code</th><th className={th}>Name</th><th className={th}>Designation</th><th className={th}>Site</th>
                                        <th className={th}>Months recovered</th><th className={`${th} text-right`}>Total</th>
                                    </tr></thead>
                                    <tbody>
                                        {summary.map(s => (
                                            <tr key={s.employeeDbId} className="border-t border-[var(--border)]">
                                                <td className={`${td} font-semibold text-[var(--text)]`}>{s.empCode}</td>
                                                <td className={`${td} text-[var(--text)]`}>{s.name}</td>
                                                <td className={`${td} text-[var(--text2)]`}>{s.designation || "—"}</td>
                                                <td className={`${td} text-[var(--text2)]`}>{s.site || "—"}</td>
                                                <td className="px-2 py-2 text-[var(--text2)]">{s.months.join(" · ")}</td>
                                                <td className={`${td} text-right font-bold tabular-nums text-[var(--text)]`}>{inr(s.total)}</td>
                                            </tr>
                                        ))}
                                        <tr className="border-t-2 border-[var(--border)] bg-[var(--surface2)] font-bold"><td className={td} colSpan={5}>Total</td><td className={`${td} text-right tabular-nums`}>{inr(total)}</td></tr>
                                    </tbody>
                                </>
                            ) : (
                                <>
                                    <thead className="bg-[var(--surface2)] text-left text-[var(--text2)]"><tr>
                                        <th className={th}>Month</th><th className={th}>Emp Code</th><th className={th}>Name</th><th className={th}>Site</th>
                                        <th className={`${th} text-right`}>Gross</th><th className={`${th} text-right`}>Advance</th><th className={`${th} text-right`}>Net paid</th><th className={th}>Payroll</th>
                                    </tr></thead>
                                    <tbody>
                                        {filtered.map((r, i) => (
                                            <tr key={i} className="border-t border-[var(--border)]">
                                                <td className={`${td} text-[var(--text2)]`}>{SHORT[r.month - 1]} {r.year}</td>
                                                <td className={`${td} font-semibold text-[var(--text)]`}>{r.empCode}</td>
                                                <td className={`${td} text-[var(--text)]`}>{r.name}</td>
                                                <td className={`${td} text-[var(--text2)]`}>{r.site || "—"}</td>
                                                <td className={`${td} text-right tabular-nums text-[var(--text2)]`}>{inr(r.gross)}</td>
                                                <td className={`${td} text-right font-bold tabular-nums text-[var(--text)]`}>{inr(r.advance)}</td>
                                                <td className={`${td} text-right tabular-nums text-[var(--text2)]`}>{inr(r.net)}</td>
                                                <td className={td}>
                                                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${r.status === "DRAFT" ? "bg-[#fffbeb] text-[#b45309]" : "bg-[#dcfce7] text-[#15803d]"}`}>
                                                        {r.status === "DRAFT" ? "Draft" : r.status === "PAID" ? "Paid" : "Locked"}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                        <tr className="border-t-2 border-[var(--border)] bg-[var(--surface2)] font-bold"><td className={td} colSpan={5}>Total</td><td className={`${td} text-right tabular-nums`}>{inr(total)}</td><td colSpan={2} /></tr>
                                    </tbody>
                                </>
                            )}
                        </table>
                    </div>
                )}
                <p className="m-0 border-t border-[var(--border)] px-4 py-2.5 text-[11.5px] text-[var(--text3)]">
                    Taken from the Advance column of each month&apos;s payroll (entered with the attendance sheet). Draft months can still change until they are locked.
                </p>
            </div>
        </div>
    )
}
