"use client"

// Expense Claims → Report. Pick a period and filters; download one Excel
// workbook: Summary, By Employee, By Category, By Site, By Month and every line
// in Details (employee code, site, approval, payment, policy flags).
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { Download, Loader2, X } from "lucide-react"
import { EXPENSE_CATEGORY_GROUPS } from "@/lib/expense-categories"

type Line = {
    expenseNo: string; title: string; claimDate: string; lineDate: string | null; line: number
    category: string; categoryLabel: string; amount: number; kms: number | null; vehicleType: string | null; receipt: boolean
    employee: string; employeeCode: string; designation: string; department: string; site: string; status: string
    submittedOn: string; approvedBy: string; approvedOn: string; rejectionReason: string
    paidOn: string; paymentMode: string; transactionId: string; policyFlags: string
}

const STATUSES = [["ALL", "All (except drafts)"], ["SUBMITTED", "Awaiting approval"], ["APPROVED", "Approved — not paid"], ["PAID", "Paid"], ["REJECTED", "Rejected"]] as const
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const monthRange = (offset: number) => { const n = new Date(); const a = new Date(n.getFullYear(), n.getMonth() + offset, 1); const b = new Date(n.getFullYear(), n.getMonth() + offset + 1, 0); return [ymd(a), ymd(b)] as const }
const box = "h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white w-full"

export default function ExpenseReport({ onClose }: { onClose: () => void }) {
    const [period, setPeriod] = useState<"this" | "last" | "custom">("this")
    const [from, setFrom] = useState(monthRange(0)[0])
    const [to, setTo] = useState(monthRange(0)[1])
    const [status, setStatus] = useState("ALL")
    const [siteId, setSiteId] = useState("ALL")
    const [category, setCategory] = useState("ALL")
    const [sites, setSites] = useState<{ id: string; name: string }[]>([])
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        fetch("/api/sites").then(r => r.ok ? r.json() : []).then(d => {
            const l = Array.isArray(d) ? d : d?.sites ?? []
            setSites(l.map((s: any) => ({ id: s.id, name: s.name })).sort((a: any, b: any) => a.name.localeCompare(b.name)))
        }).catch(() => {})
        const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
        document.addEventListener("keydown", k)
        return () => document.removeEventListener("keydown", k)
    }, [onClose])
    useEffect(() => {
        if (period === "custom") return
        const [a, b] = monthRange(period === "this" ? 0 : -1); setFrom(a); setTo(b)
    }, [period])

    async function download() {
        if (!from || !to || from > to) { toast.error("Pick a valid date range"); return }
        setBusy(true)
        try {
            const qs = new URLSearchParams({ from, to, status, siteId, category })
            const r = await fetch(`/api/expenses/report?${qs}`)
            const d = await r.json()
            if (!r.ok) throw new Error(d?.error || "Could not build the report")
            const lines: Line[] = d.lines ?? []
            if (!lines.length) { toast.info("No expense lines for these filters"); return }
            await buildWorkbook(lines, { from, to, status: STATUSES.find(s => s[0] === status)?.[1] ?? status, site: sites.find(s => s.id === siteId)?.name ?? "All sites", category: category === "ALL" ? "All categories" : EXPENSE_CATEGORY_GROUPS.flatMap(g => g.items).find(i => i[0] === category)?.[1] ?? category })
            toast.success(`Expense report downloaded — ${lines.length} line(s)`)
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }

    return createPortal(
        <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4">
            <div role="dialog" aria-modal="true" aria-label="Expense report" className="w-full max-w-lg bg-white rounded-[14px] border border-[var(--border)] shadow-xl">
                <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-[var(--border)]">
                    <div>
                        <h3 className="text-[15px] font-semibold text-[var(--text)]">Expense report</h3>
                        <p className="text-[12px] text-[var(--text3)]">Excel with Summary, By Employee, By Category, By Site, By Month and every line.</p>
                    </div>
                    <button onClick={onClose} aria-label="Close" className="p-1 text-[var(--text3)]"><X size={18} /></button>
                </div>
                <div className="p-5 space-y-3">
                    <div className="flex gap-1.5">
                        {([["this", "This month"], ["last", "Last month"], ["custom", "Date range"]] as const).map(([k, l]) => (
                            <button key={k} onClick={() => setPeriod(k)} className={`h-8 px-3 rounded-full text-[12.5px] font-semibold border ${period === k ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "bg-white text-[var(--text2)] border-[var(--border)]"}`}>{l}</button>
                        ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <label className="text-[11px] font-semibold text-[var(--text3)] uppercase">From<input type="date" value={from} onChange={e => { setPeriod("custom"); setFrom(e.target.value) }} className={box} /></label>
                        <label className="text-[11px] font-semibold text-[var(--text3)] uppercase">To<input type="date" value={to} onChange={e => { setPeriod("custom"); setTo(e.target.value) }} className={box} /></label>
                    </div>
                    <label className="block text-[11px] font-semibold text-[var(--text3)] uppercase">Status
                        <select value={status} onChange={e => setStatus(e.target.value)} className={box}>{STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        <label className="text-[11px] font-semibold text-[var(--text3)] uppercase">Site
                            <select value={siteId} onChange={e => setSiteId(e.target.value)} className={box}><option value="ALL">All sites</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                        </label>
                        <label className="text-[11px] font-semibold text-[var(--text3)] uppercase">Category
                            <select value={category} onChange={e => setCategory(e.target.value)} className={box}>
                                <option value="ALL">All categories</option>
                                {EXPENSE_CATEGORY_GROUPS.map(g => <optgroup key={g.group} label={g.group}>{g.items.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</optgroup>)}
                            </select>
                        </label>
                    </div>
                </div>
                <div className="flex justify-end gap-2 px-5 py-3 border-t border-[var(--border)]">
                    <button onClick={onClose} className="h-9 px-4 rounded-[9px] border border-[var(--border)] text-[13px] font-medium text-[var(--text2)]">Close</button>
                    <button onClick={download} disabled={busy} className="h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download Excel
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    )
}

// ── Workbook ─────────────────────────────────────────────────────────────────
const NAVY = "FF0A1F4F", BAND = "FFF4F6FB", BORDER = "FFD5DAE4"
const STATUS_LABEL: Record<string, string> = { SUBMITTED: "Awaiting approval", APPROVED: "Approved — not paid", PAID: "Paid", REJECTED: "Rejected", DRAFT: "Draft" }

async function buildWorkbook(lines: Line[], f: { from: string; to: string; status: string; site: string; category: string }) {
    const mod: any = await import("exceljs")
    const ExcelJS = mod.default ?? mod
    const wb = new ExcelJS.Workbook()
    const sub = `Period ${f.from} to ${f.to}  |  ${f.status}  |  ${f.site}  |  ${f.category}  |  Generated ${new Date().toLocaleDateString("en-IN")}`

    type Col = { header: string; key: string; width: number; money?: boolean; total?: boolean }
    const sheet = (name: string, title: string, cols: Col[], rows: Record<string, any>[], totals = true) => {
        const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 4 }] })
        ws.mergeCells(1, 1, 1, cols.length); ws.getCell(1, 1).value = title
        ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } }
        ws.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }
        ws.getRow(1).height = 26
        ws.mergeCells(2, 1, 2, cols.length); ws.getCell(2, 1).value = sub
        ws.getCell(2, 1).font = { size: 10, color: { argb: "FF6B7280" } }
        cols.forEach((c, i) => {
            const cell = ws.getCell(4, i + 1); cell.value = c.header
            cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }
            cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }
            ws.getColumn(i + 1).width = c.width
        })
        ws.getRow(4).height = 28
        rows.forEach((r, n) => {
            const row = ws.getRow(5 + n)
            cols.forEach((c, i) => {
                const cell = row.getCell(i + 1); cell.value = r[c.key] ?? ""
                if (c.money) cell.numFmt = "₹#,##0.00"
                cell.border = { top: { style: "thin", color: { argb: BORDER } }, bottom: { style: "thin", color: { argb: BORDER } } }
                if (n % 2) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } }
            })
        })
        if (totals && rows.length) {
            const tr = ws.getRow(5 + rows.length)
            tr.getCell(1).value = "Total"
            cols.forEach((c, i) => {
                if (c.total) {
                    const L = ws.getColumn(i + 1).letter
                    tr.getCell(i + 1).value = { formula: `SUM(${L}5:${L}${4 + rows.length})` }
                    if (c.money) tr.getCell(i + 1).numFmt = "₹#,##0.00"
                }
            })
            tr.font = { bold: true }
            tr.eachCell((c: any) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8ECF5" } } })
        }
        ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + rows.length, column: cols.length } }
        return ws
    }
    const group = <T,>(key: (l: Line) => string, extra?: (ls: Line[]) => T) => {
        const m = new Map<string, Line[]>()
        for (const l of lines) { const k = key(l); m.set(k, [...(m.get(k) ?? []), l]) }
        return Array.from(m.entries()).map(([k, ls]) => ({
            key: k, ls,
            claims: new Set(ls.map(l => l.expenseNo)).size,
            amount: ls.reduce((s, l) => s + l.amount, 0),
            pending: ls.filter(l => l.status === "SUBMITTED").reduce((s, l) => s + l.amount, 0),
            approved: ls.filter(l => l.status === "APPROVED").reduce((s, l) => s + l.amount, 0),
            paid: ls.filter(l => l.status === "PAID").reduce((s, l) => s + l.amount, 0),
            rejected: ls.filter(l => l.status === "REJECTED").reduce((s, l) => s + l.amount, 0),
            noReceipt: ls.filter(l => !l.receipt && l.category !== "TRAVEL").length,
            flagged: new Set(ls.filter(l => l.policyFlags).map(l => l.expenseNo)).size,
            ...(extra ? { extra: extra(ls) } : {}),
        })).sort((a, b) => b.amount - a.amount)
    }
    const money = (h: string, k: string): Col => ({ header: h, key: k, width: 16, money: true, total: true })
    const statusCols: Col[] = [money("Total (₹)", "amount"), money("Awaiting approval", "pending"), money("Approved — not paid", "approved"), money("Paid", "paid"), money("Rejected", "rejected")]

    // Summary
    const byStatus = group(l => l.status)
    sheet("Summary", "EXPENSE REPORT — SUMMARY", [
        { header: "Status", key: "status", width: 26 }, { header: "Claims", key: "claims", width: 10, total: true },
        { header: "Lines", key: "lines", width: 10, total: true }, money("Amount (₹)", "amount"),
    ], byStatus.map(g => ({ status: STATUS_LABEL[g.key] ?? g.key, claims: g.claims, lines: g.ls.length, amount: g.amount })))

    const byEmp = group(l => `${l.employeeCode}|${l.employee}`)
    sheet("By Employee", "BY EMPLOYEE", [
        { header: "Emp Code", key: "code", width: 12 }, { header: "Employee", key: "name", width: 26 }, { header: "Department", key: "dept", width: 18 },
        { header: "Claims", key: "claims", width: 9, total: true }, ...statusCols,
        { header: "Lines without receipt", key: "noReceipt", width: 14, total: true }, { header: "Claims with policy flags", key: "flagged", width: 14, total: true },
    ], byEmp.map(g => ({ code: g.ls[0].employeeCode, name: g.ls[0].employee, dept: g.ls[0].department, claims: g.claims, amount: g.amount, pending: g.pending, approved: g.approved, paid: g.paid, rejected: g.rejected, noReceipt: g.noReceipt, flagged: g.flagged })))

    const byCat = group(l => l.categoryLabel)
    sheet("By Category", "BY CATEGORY", [
        { header: "Category", key: "cat", width: 30 }, { header: "Claims", key: "claims", width: 9, total: true }, { header: "Lines", key: "lines", width: 9, total: true },
        ...statusCols, { header: "Km (travel)", key: "kms", width: 12, total: true },
    ], byCat.map(g => ({ cat: g.key, claims: g.claims, lines: g.ls.length, amount: g.amount, pending: g.pending, approved: g.approved, paid: g.paid, rejected: g.rejected, kms: g.ls.reduce((s, l) => s + (l.kms ?? 0), 0) || "" })))

    const bySite = group(l => l.site || "(no site)")
    sheet("By Site", "BY SITE", [
        { header: "Site", key: "site", width: 28 }, { header: "Claims", key: "claims", width: 9, total: true }, { header: "Employees", key: "people", width: 11 }, ...statusCols,
    ], bySite.map(g => ({ site: g.key, claims: g.claims, people: new Set(g.ls.map(l => l.employeeCode || l.employee)).size, amount: g.amount, pending: g.pending, approved: g.approved, paid: g.paid, rejected: g.rejected })))

    const byMonth = group(l => (l.lineDate ?? l.claimDate).slice(0, 7))
    sheet("By Month", "BY MONTH", [
        { header: "Month", key: "m", width: 12 }, { header: "Claims", key: "claims", width: 9, total: true }, ...statusCols,
    ], byMonth.sort((a, b) => a.key.localeCompare(b.key)).map(g => ({ m: g.key, claims: g.claims, amount: g.amount, pending: g.pending, approved: g.approved, paid: g.paid, rejected: g.rejected })))

    sheet("Details", "EVERY EXPENSE LINE", [
        { header: "Expense No", key: "expenseNo", width: 12 }, { header: "Line", key: "line", width: 6 }, { header: "Date", key: "date", width: 11 },
        { header: "Emp Code", key: "employeeCode", width: 12 }, { header: "Employee", key: "employee", width: 22 }, { header: "Department", key: "department", width: 16 },
        { header: "Site", key: "site", width: 20 }, { header: "Title", key: "title", width: 26 }, { header: "Category", key: "categoryLabel", width: 24 },
        { header: "Amount (₹)", key: "amount", width: 14, money: true, total: true }, { header: "Km", key: "kms", width: 8 }, { header: "Vehicle", key: "vehicleType", width: 8 },
        { header: "Receipt", key: "receipt", width: 9 }, { header: "Status", key: "statusLabel", width: 18 }, { header: "Submitted", key: "submittedOn", width: 11 },
        { header: "Approved by", key: "approvedBy", width: 18 }, { header: "Approved on", key: "approvedOn", width: 11 }, { header: "Rejection reason", key: "rejectionReason", width: 24 },
        { header: "Paid on", key: "paidOn", width: 11 }, { header: "Payment mode", key: "paymentMode", width: 12 }, { header: "UTR / Ref", key: "transactionId", width: 18 },
        { header: "Policy flags", key: "policyFlags", width: 50 },
    ], lines.map(l => ({ ...l, date: l.lineDate ?? l.claimDate, receipt: l.category === "TRAVEL" ? "km" : l.receipt ? "Yes" : "No", statusLabel: STATUS_LABEL[l.status] ?? l.status })))

    const buf = await wb.xlsx.writeBuffer()
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }))
    a.download = `Expense_Report_${f.from}_to_${f.to}.xlsx`
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
