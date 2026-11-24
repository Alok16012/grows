"use client"

import { useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { Loader2, Printer, Search, UserMinus } from "lucide-react"
import { canAny } from "@/lib/can"
import { payrollYears, currentPayrollMonth, currentPayrollYear } from "../../_components/payroll-years"
import ReportsNav from "../_components/ReportsNav"

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const BATCH = 5

type Leaver = {
    id: string; employeeId: string; name: string; designation: string; status: string
    doj: string | null; dol: string | null; site: string
    exit: { type: string; status: string; paidAt: string | null; paidAmount: number | null } | null
}
type Line = { key: string; label: string; amount: number; note: string; kind: "earning" | "deduction"; excluded?: boolean }
type Statement = {
    employee: { employeeId: string; name: string; designation: string; department: string; fatherName: string; site: string; uan: string; esicNo: string; doj: string | null; dol: string | null }
    exitType: string
    paid: { at: string; amount: number | null } | null
    settlement: { monthlyGross: number; basicDa: number; lines: Line[]; earnings: number; deductions: number; net: number; warnings: string[] } | null
}

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—")
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN")

// Rupees in words, Indian grouping (lakh / crore), for the net line.
function inWords(n: number): string {
    n = Math.round(Math.abs(n))
    if (n === 0) return "Zero"
    const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
    const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
    const two = (x: number) => (x < 20 ? a[x] : `${b[Math.floor(x / 10)]}${x % 10 ? " " + a[x % 10] : ""}`)
    const three = (x: number) => (x >= 100 ? `${a[Math.floor(x / 100)]} Hundred${x % 100 ? " " + two(x % 100) : ""}` : two(x))
    const parts: string[] = []
    const crore = Math.floor(n / 1e7); n %= 1e7
    const lakh = Math.floor(n / 1e5); n %= 1e5
    const thousand = Math.floor(n / 1000); n %= 1000
    if (crore) parts.push(`${three(crore)} Crore`)
    if (lakh) parts.push(`${two(lakh)} Lakh`)
    if (thousand) parts.push(`${two(thousand)} Thousand`)
    if (n) parts.push(three(n))
    return parts.join(" ")
}

function service(doj: string | null, dol: string | null) {
    if (!doj || !dol) return "—"
    const days = Math.max(0, Math.floor((new Date(dol).getTime() - new Date(doj).getTime()) / 86_400_000))
    const y = Math.floor(days / 365.25), m = Math.floor((days - y * 365.25) / 30.44)
    return `${y} yr ${m} mo`
}

function statementHtml(st: Statement, esc: (v: unknown) => string) {
    const e = st.employee, s = st.settlement
    if (!s) return `<section class="page"><h1>Full &amp; Final Settlement</h1><p>${esc(e.name)} (${esc(e.employeeId)}) — could not be worked out.</p></section>`
    const live = s.lines.filter(l => !l.excluded)
    const row = (l: Line) => `<tr><td>${esc(l.label)}<div class="n">${esc(l.note)}</div></td><td class="r">${inr(l.amount)}</td></tr>`
    const earn = live.filter(l => l.kind === "earning"), ded = live.filter(l => l.kind === "deduction")
    const info = (k: string, v: string) => `<td class="k">${k}</td><td>${esc(v) || "—"}</td>`
    return `<section class="page">
      <h1>Full &amp; Final Settlement Statement</h1>
      <table class="info">
        <tr>${info("Employee", e.name)}${info("Emp Code", e.employeeId)}</tr>
        <tr>${info("Father Name", e.fatherName)}${info("Designation", e.designation)}</tr>
        <tr>${info("Department", e.department)}${info("Site", e.site)}</tr>
        <tr>${info("Date of Joining", fmtDate(e.doj))}${info("Date of Leaving", fmtDate(e.dol))}</tr>
        <tr>${info("Service", service(e.doj, e.dol))}${info("Exit Type", st.exitType.replace(/_/g, " "))}</tr>
        <tr>${info("UAN", e.uan)}${info("ESIC No", e.esicNo)}</tr>
        <tr>${info("Monthly Gross", inr(s.monthlyGross))}${info("Basic + DA", inr(s.basicDa))}</tr>
      </table>
      <h2>Earnings</h2>
      <table>${earn.map(row).join("") || '<tr><td class="n">None</td><td></td></tr>'}<tr class="t"><td>Total earnings</td><td class="r">${inr(s.earnings)}</td></tr></table>
      <h2>Deductions</h2>
      <table>${ded.map(row).join("") || '<tr><td class="n">None</td><td></td></tr>'}<tr class="t"><td>Total deductions</td><td class="r">${inr(s.deductions)}</td></tr></table>
      <table class="net"><tr class="t"><td>Net ${s.net >= 0 ? "payable to employee" : "recoverable from employee"}</td><td class="r">${inr(Math.abs(s.net))}</td></tr></table>
      <div class="words">Rupees ${inWords(s.net)} only</div>
      ${st.paid ? `<div class="meta">Paid ${st.paid.amount != null ? inr(st.paid.amount) : ""} on ${fmtDate(st.paid.at)}</div>` : ""}
      <p class="decl">I have received the above amount in full and final settlement of all my dues, and I have no further claim on the company.</p>
      <div class="sig"><span>Prepared by (HR)</span><span>Approved by</span><span>Employee signature</span></div>
    </section>`
}

const PRINT_CSS = `body{font-family:system-ui,-apple-system,sans-serif;color:#0f1729;margin:0}
.page{max-width:760px;margin:0 auto;padding:28px 24px;page-break-after:always;break-after:page}
.page:last-child{page-break-after:auto;break-after:auto}
h1{font-size:19px;margin:0 0 12px;text-align:center;letter-spacing:.3px}
h2{font-size:12px;margin:18px 0 0;text-transform:uppercase;letter-spacing:.6px;color:#5b6478}
table{width:100%;border-collapse:collapse;margin-top:8px}
td{padding:6px 4px;border-bottom:1px solid #e6eaf5;font-size:12.5px;vertical-align:top}
.info td{border:1px solid #e6eaf5;padding:5px 8px}.info .k{color:#5b6478;width:18%;background:#f7f9fd;font-weight:600}
.r{text-align:right;white-space:nowrap}.n{color:#98a1b5;font-size:10.5px}
.t td{font-weight:700;font-size:14px;border-bottom:0}.net{margin-top:14px;border-top:2px solid #0f1729}
.words{font-size:12px;font-style:italic;color:#334155;margin-top:2px}
.meta{color:#5b6478;font-size:12px;margin-top:6px}.decl{font-size:11.5px;color:#334155;margin-top:28px}
.sig{display:flex;justify-content:space-between;margin-top:56px;font-size:11.5px;color:#5b6478}
.sig span{border-top:1px solid #98a1b5;padding-top:4px;min-width:150px;text-align:center}
@media print{.page{padding:0 8px}}`

export default function FnfReportPage() {
    const { data: session } = useSession()
    const [month, setMonth] = useState(currentPayrollMonth())
    const [year, setYear] = useState(currentPayrollYear())
    const [siteId, setSiteId] = useState("")
    const [sites, setSites] = useState<{ id: string; name: string }[]>([])
    const [rows, setRows] = useState<Leaver[]>([])
    const [loading, setLoading] = useState(false)
    const [search, setSearch] = useState("")
    const [picked, setPicked] = useState<Set<string>>(new Set())
    const [printing, setPrinting] = useState<{ done: number; total: number } | null>(null)

    useEffect(() => {
        fetch("/api/sites").then(r => r.json()).then(d => { if (Array.isArray(d)) setSites(d) }).catch(() => {})
    }, [])

    useEffect(() => {
        let off = false
        setLoading(true); setPicked(new Set())
        const qs = new URLSearchParams({ month: String(month), year: String(year) })
        if (siteId) qs.set("siteId", siteId)
        fetch(`/api/payroll/reports/fnf?${qs}`)
            .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d?.error || "Could not load leavers"); return d })
            .then(d => { if (!off) setRows(d.employees ?? []) })
            .catch(e => { if (!off) { setRows([]); toast.error(e.message) } })
            .finally(() => { if (!off) setLoading(false) })
        return () => { off = true }
    }, [month, year, siteId])

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        return q ? rows.filter(r => `${r.name} ${r.employeeId} ${r.designation} ${r.site}`.toLowerCase().includes(q)) : rows
    }, [rows, search])
    const allPicked = filtered.length > 0 && filtered.every(r => picked.has(r.id))
    const toggleAll = () => setPicked(p => {
        const n = new Set(p)
        if (allPicked) filtered.forEach(r => n.delete(r.id)); else filtered.forEach(r => n.add(r.id))
        return n
    })
    const toggle = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })

    const print = async (ids: string[]) => {
        if (!ids.length) { toast.error("Tick at least one employee."); return }
        // Open the window inside the click, before any await, or the browser blocks it.
        const w = window.open("", "_blank")
        if (!w) { toast.error("Allow pop-ups for this site to print."); return }
        w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Preparing…</title></head><body style="font-family:system-ui;padding:40px;color:#5b6478">Preparing ${ids.length} statement(s)…</body></html>`)
        setPrinting({ done: 0, total: ids.length })
        try {
            const out: Statement[] = []
            for (let i = 0; i < ids.length; i += BATCH) {
                const res = await fetch("/api/payroll/reports/fnf", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ employeeIds: ids.slice(i, i + BATCH) }),
                })
                const d = await res.json().catch(() => ({}))
                if (!res.ok) throw new Error(d?.error || "Could not work out the settlements")
                out.push(...(d.statements ?? []))
                setPrinting({ done: Math.min(i + BATCH, ids.length), total: ids.length })
            }
            const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!))
            const title = out.length === 1 ? `FNF — ${out[0].employee.name}` : `FNF — ${MONTHS[month - 1]} ${year} (${out.length})`
            w.document.open()
            w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>${out.map(s => statementHtml(s, esc)).join("")}<script>window.onload=()=>window.print()</script></body></html>`)
            w.document.close()
        } catch (e: any) {
            w.close(); toast.error(e.message)
        } finally { setPrinting(null) }
    }

    if (session && !canAny(session, ["exit.view", "payroll.view"])) {
        return <div className="p-8 text-center text-sm text-[var(--text3)]">Access denied</div>
    }

    const card = "rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm"
    const sel = "h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--text)] outline-none"
    const pickedIds = filtered.filter(r => picked.has(r.id)).map(r => r.id)

    return (
        <div className="flex flex-col gap-5 p-4 pb-12 lg:p-0">
            <ReportsNav title="FNF Settlement" subtitle="Employees who left in a month — print one, several or all statements." />

            <div className={`${card} flex flex-wrap items-end gap-3 p-4`}>
                <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--text3)]">Month of leaving
                    <select className={sel} value={month} onChange={e => setMonth(Number(e.target.value))}>
                        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--text3)]">Year
                    <select className={sel} value={year} onChange={e => setYear(Number(e.target.value))}>
                        {payrollYears().map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </label>
                <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs font-semibold text-[var(--text3)]">Site
                    <select className={sel} value={siteId} onChange={e => setSiteId(e.target.value)}>
                        <option value="">All sites</option>
                        {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </label>
                <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs font-semibold text-[var(--text3)]">Search
                    <span className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, code, designation…"
                            className={`${sel} w-full pl-8 font-normal`} />
                    </span>
                </label>
            </div>

            <div className={card}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface2)] px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
                        <UserMinus size={15} className="text-[var(--accent)]" /> {MONTHS[month - 1]} {year}
                        <span className="text-xs font-semibold text-[var(--text3)]">{loading ? "loading…" : `${filtered.length} leaver(s)`}{pickedIds.length ? ` · ${pickedIds.length} ticked` : ""}</span>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => print(pickedIds)} disabled={!!printing || !pickedIds.length}
                            className="flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] font-semibold text-[var(--text2)] disabled:opacity-50">
                            <Printer size={14} /> Print selected{pickedIds.length ? ` (${pickedIds.length})` : ""}
                        </button>
                        <button onClick={() => print(filtered.map(r => r.id))} disabled={!!printing || !filtered.length}
                            className="flex h-9 items-center gap-2 rounded-lg bg-[#3d6ff5] px-3 text-[13px] font-semibold text-white disabled:opacity-50">
                            {printing ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                            {printing ? `Preparing ${printing.done}/${printing.total}…` : `Print all (${filtered.length})`}
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center gap-2 p-10 text-sm text-[var(--text3)]"><Loader2 size={16} className="animate-spin" /> Loading…</div>
                ) : filtered.length === 0 ? (
                    <p className="m-0 p-10 text-center text-sm text-[var(--text3)]">Nobody with a leaving date in {MONTHS[month - 1]} {year}{siteId ? " at this site" : ""}.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-[12.5px]">
                            <thead className="bg-[var(--surface2)] text-left text-[var(--text2)]">
                                <tr>
                                    <th className="w-10 px-3 py-2"><input type="checkbox" className="accent-[#3d6ff5]" checked={allPicked} onChange={toggleAll} aria-label="Tick all" /></th>
                                    <th className="px-2 py-2 font-bold">Emp Code</th>
                                    <th className="px-2 py-2 font-bold">Name</th>
                                    <th className="px-2 py-2 font-bold">Designation</th>
                                    <th className="px-2 py-2 font-bold">Site</th>
                                    <th className="px-2 py-2 font-bold">DOJ</th>
                                    <th className="px-2 py-2 font-bold">Leaving date</th>
                                    <th className="px-2 py-2 font-bold">F&amp;F</th>
                                    <th className="px-2 py-2" />
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(r => (
                                    <tr key={r.id} className="border-t border-[var(--border)] hover:bg-[var(--surface2)]">
                                        <td className="px-3 py-2"><input type="checkbox" className="accent-[#3d6ff5]" checked={picked.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Tick ${r.name}`} /></td>
                                        <td className="whitespace-nowrap px-2 py-2 font-semibold text-[var(--text)]">{r.employeeId}</td>
                                        <td className="whitespace-nowrap px-2 py-2 text-[var(--text)]">{r.name}</td>
                                        <td className="px-2 py-2 text-[var(--text2)]">{r.designation || "—"}</td>
                                        <td className="px-2 py-2 text-[var(--text2)]">{r.site || "—"}</td>
                                        <td className="whitespace-nowrap px-2 py-2 text-[var(--text2)]">{fmtDate(r.doj)}</td>
                                        <td className="whitespace-nowrap px-2 py-2 text-[var(--text2)]">{fmtDate(r.dol)}</td>
                                        <td className="whitespace-nowrap px-2 py-2">
                                            {r.exit?.paidAt
                                                ? <span className="rounded-full bg-[#dcfce7] px-2 py-0.5 text-[10.5px] font-bold text-[#15803d]">Paid</span>
                                                : <span className="rounded-full bg-[var(--surface2)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--text3)]">Not recorded</span>}
                                        </td>
                                        <td className="px-2 py-2 text-right">
                                            <button onClick={() => print([r.id])} disabled={!!printing}
                                                className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11.5px] font-semibold text-[var(--text2)] hover:border-[#3d6ff5] hover:text-[#3d6ff5] disabled:opacity-50">
                                                <Printer size={12} /> Print
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <p className="m-0 border-t border-[var(--border)] px-4 py-2.5 text-[11.5px] text-[var(--text3)]">
                    Worked out from the salary in force in the leaving month, leave balance, service (gratuity), open advances, unpaid claims and unreturned assets.
                    The leaving month&apos;s salary shows as zero if payroll already locked it. To add or remove lines for someone, use their Exit record.
                </p>
            </div>
        </div>
    )
}
