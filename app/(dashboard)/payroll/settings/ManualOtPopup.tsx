"use client"

// Manual OT for one site's employees (Calculation Settings → OT Rule by Site).
// Two options, one tab each:
//   Rate per hour   — a ₹/hour OT rate per employee, kept until changed. Part of
//                     the settings: Apply here, then Save on the settings page.
//   Monthly amount  — the ₹ OT for a payroll month per employee. Saved here
//                     straight away; draft payroll for those people recalculates.
// Both can be typed or bulk-uploaded with the Excel template (matched by Emp Code).
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { Download, Loader2, Search, Upload, X } from "lucide-react"
import type { PayrollRules } from "@/lib/payroll-rules"

type Ot = PayrollRules["ot"]
type Emp = { id: string; code: string; name: string; status: string; ownRate: number | null; amount: number | null }
type YM = { month: number; year: number }
export type ManualTab = "rate" | "amount"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const ymLabel = (p: YM) => `${MONTHS[p.month - 1]} ${p.year}`
const box: React.CSSProperties = { height: 34, padding: "0 9px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12.5, background: "var(--surface)", color: "var(--text)", outline: "none" }
const ghost: React.CSSProperties = { height: 34, padding: "0 12px", display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text2)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }
const primary: React.CSSProperties = { height: 34, padding: "0 18px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }
const th: React.CSSProperties = { padding: "8px 10px", fontSize: 11, fontWeight: 700, color: "var(--text2)", textAlign: "left", borderBottom: "1px solid var(--border)", background: "var(--surface)", position: "sticky", top: 0, zIndex: 1 }
const td: React.CSSProperties = { padding: "5px 10px", fontSize: 12.5, borderBottom: "1px solid var(--border)" }

const toNum = (s: string): number | null => { if (s.trim() === "") return null; const n = Number(s); return Number.isFinite(n) && n >= 0 ? n : null }

export default function ManualOtPopup({ site, ot, ruleKind, onChange, onClose }: {
    site: { id: string; name: string }; ot: Ot; ruleKind: string | null
    onChange: (patch: Partial<Ot>) => void; onClose: () => void
}) {
    const [tab, setTab] = useState<ManualTab>(ruleKind === "MANUAL_AMOUNT" ? "amount" : "rate")
    const [emps, setEmps] = useState<Emp[] | null>(null)
    const [allowed, setAllowed] = useState<YM[]>([])
    const [period, setPeriod] = useState<YM | null>(null)
    const [q, setQ] = useState("")
    const [rates, setRates] = useState<Record<string, string>>({})
    const [amounts, setAmounts] = useState<Record<string, string>>({})
    const [busy, setBusy] = useState(false)
    const fileRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
        document.addEventListener("keydown", k)
        return () => document.removeEventListener("keydown", k)
    }, [onClose])

    const load = useCallback(async (p: YM | null) => {
        setEmps(null)
        try {
            const qs = new URLSearchParams({ siteId: site.id, ...(p ? { month: String(p.month), year: String(p.year) } : {}) })
            const r = await fetch(`/api/payroll/manual-ot?${qs}`)
            const d = await r.json()
            if (!r.ok) throw new Error(d?.error || "Could not load employees")
            const list: Emp[] = d.employees ?? []
            setEmps(list)
            const win: YM[] = d.window?.allowed ?? []
            setAllowed(win)
            if (!p && win[0]) { setPeriod(win[0]); return load(win[0]) }
            setAmounts(Object.fromEntries(list.map(e => [e.id, e.amount != null ? String(e.amount) : ""])))
        } catch (e: any) { toast.error(e.message); setEmps([]) }
    }, [site.id])
    useEffect(() => { load(null) }, [load])
    useEffect(() => {
        if (emps) setRates(r => Object.keys(r).length ? r : Object.fromEntries(emps.map(e => [e.id, ot.manualRates?.[e.id] != null ? String(ot.manualRates[e.id]) : ""])))
    }, [emps, ot.manualRates])

    const shown = useMemo(() => {
        const t = q.trim().toLowerCase()
        const l = emps ?? []
        return t ? l.filter(e => e.name.toLowerCase().includes(t) || e.code.toLowerCase().includes(t)) : l
    }, [emps, q])
    const values = tab === "rate" ? rates : amounts
    const setValue = (id: string, v: string) => (tab === "rate" ? setRates : setAmounts)(m => ({ ...m, [id]: v }))
    const filled = (emps ?? []).filter(e => toNum(values[e.id] ?? "") !== null).length

    // ── Save ────────────────────────────────────────────────────────────────
    const applyRates = () => {
        const next = { ...(ot.manualRates ?? {}) }
        for (const e of emps ?? []) { const n = toNum(rates[e.id] ?? ""); if (n === null || n === 0) delete next[e.id]; else next[e.id] = n }
        onChange({ manualRates: next })
        toast.success("Rates applied — click Save on the settings page to keep them")
        onClose()
    }
    const saveAmounts = async () => {
        if (!period) return
        setBusy(true)
        try {
            const body = { month: period.month, year: period.year, amounts: Object.fromEntries((emps ?? []).map(e => [e.id, toNum(amounts[e.id] ?? "")])) }
            const r = await fetch("/api/payroll/manual-ot", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
            const d = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(d?.error || "Could not save")
            toast.success(`OT amounts for ${ymLabel(period)} saved${d.recalculated?.rows ? ` · ${d.recalculated.rows} draft payroll row(s) updated` : ""}`)
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }

    // ── Excel ───────────────────────────────────────────────────────────────
    const valueHeader = tab === "rate" ? "OT Rate (₹ per hour)" : `OT Amount (₹) — ${period ? ymLabel(period) : ""}`
    const downloadTemplate = async () => {
        const ExcelJS: any = (await import("exceljs")).default ?? (await import("exceljs"))
        const wb = new ExcelJS.Workbook()
        const ws = wb.addWorksheet("Manual OT")
        ws.columns = [{ header: "Emp Code", key: "code", width: 16 }, { header: "Employee Name", key: "name", width: 30 }, { header: "Site", key: "site", width: 24 }, { header: valueHeader, key: "value", width: 26 }]
        for (const e of emps ?? []) ws.addRow({ code: e.code, name: e.name, site: site.name, value: toNum(values[e.id] ?? "") ?? undefined })
        ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }
        ws.getRow(1).eachCell((c: any) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A1F4F" } } })
        ws.getColumn(4).numFmt = "#,##0.00"
        ws.views = [{ state: "frozen", ySplit: 1 }]
        const buf = await wb.xlsx.writeBuffer()
        const a = document.createElement("a")
        a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }))
        a.download = `ManualOT_${tab === "rate" ? "Rate" : "Amount"}_${site.name.replace(/[^\w]+/g, "")}${tab === "amount" && period ? `_${period.year}-${String(period.month).padStart(2, "0")}` : ""}.xlsx`
        a.click(); URL.revokeObjectURL(a.href)
    }
    const upload = async (file: File) => {
        try {
            const ExcelJS: any = (await import("exceljs")).default ?? (await import("exceljs"))
            const wb = new ExcelJS.Workbook()
            await wb.xlsx.load(await file.arrayBuffer())
            const ws = wb.worksheets[0]
            if (!ws) throw new Error("The file has no sheet")
            const text = (v: any) => String(v?.result ?? v?.text ?? v ?? "").trim()
            let headRow = 0, codeCol = 0, valCol = 0
            ws.eachRow((row: any, n: number) => {
                if (headRow) return
                row.eachCell((c: any, col: number) => {
                    const h = text(c.value).toLowerCase()
                    if (/emp(loyee)?\s*(code|id|no)/.test(h)) codeCol = col
                    if (/rate|amount/.test(h)) valCol = col
                })
                if (codeCol && valCol) headRow = n
            })
            if (!headRow) throw new Error("Couldn't find the Emp Code and OT columns — use the downloaded template")
            const byCode = new Map((emps ?? []).map(e => [e.code.trim().toLowerCase(), e.id]))
            const next: Record<string, string> = {}
            let matched = 0, unknown = 0, bad = 0
            ws.eachRow((row: any, n: number) => {
                if (n <= headRow) return
                const code = text(row.getCell(codeCol).value).toLowerCase()
                if (!code) return
                const id = byCode.get(code)
                if (!id) { unknown++; return }
                const raw = text(row.getCell(valCol).value)
                if (raw !== "" && toNum(raw) === null) { bad++; return }
                next[id] = raw; matched++
            })
            ;(tab === "rate" ? setRates : setAmounts)(m => ({ ...m, ...next }))
            toast.success(`${matched} employee(s) filled from the file${unknown ? ` · ${unknown} code(s) not at this site` : ""}${bad ? ` · ${bad} invalid value(s) skipped` : ""}. Review, then ${tab === "rate" ? "Apply" : "Save"}.`)
        } catch (e: any) { toast.error(e.message || "Could not read the file") }
        finally { if (fileRef.current) fileRef.current.value = "" }
    }

    const active = ruleKind === "MANUAL_RATE" ? "rate" : ruleKind === "MANUAL_AMOUNT" ? "amount" : null
    return createPortal(
        <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
            style={{ position: "fixed", inset: 0, zIndex: 1020, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div role="dialog" aria-modal="true" aria-label={`Manual OT — ${site.name}`}
                style={{ width: "100%", maxWidth: 760, maxHeight: "92vh", display: "flex", flexDirection: "column", background: "var(--surface)", borderRadius: 14, border: "1px solid var(--border)", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "14px 16px 0" }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Manual OT — {site.name}</h3>
                        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--text3)" }}>
                            {active ? <>This site uses <b>{active === "rate" ? "rate per employee" : "monthly amount per employee"}</b>. </> : null}<b>A rate typed here is used for that employee whatever the site&apos;s rule.</b> Monthly amounts are used only when the site&apos;s rule is &quot;Manual OT — monthly amount&quot;. 
                            Employees left blank get OT days × their own rate (Salary Master).
                        </p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" style={{ border: "none", background: "none", color: "var(--text3)", cursor: "pointer", padding: 4 }}><X size={18} /></button>
                </div>

                {/* Tabs */}
                <div style={{ display: "flex", gap: 4, padding: "12px 16px 0", borderBottom: "1px solid var(--border)" }}>
                    {([["rate", "Rate per hour"], ["amount", "Monthly amount"]] as const).map(([k, l]) => (
                        <button key={k} type="button" onClick={() => setTab(k)}
                            style={{ padding: "8px 14px", fontSize: 12.5, fontWeight: 700, border: "none", background: "none", cursor: "pointer", color: tab === k ? "var(--accent)" : "var(--text3)", borderBottom: `2px solid ${tab === k ? "var(--accent)" : "transparent"}`, marginBottom: -1 }}>
                            {l}{active === k && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#15803d", background: "#dcfce7", padding: "1px 6px", borderRadius: 20 }}>in use</span>}
                        </button>
                    ))}
                </div>

                {/* Toolbar */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "10px 16px", background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                    {tab === "amount" && (
                        <select value={period ? `${period.year}-${period.month}` : ""} aria-label="Payroll month" style={{ ...box, width: 130 }}
                            onChange={e => { const [y, m] = e.target.value.split("-").map(Number); const p = { month: m, year: y }; setPeriod(p); load(p) }}>
                            {allowed.map(p => <option key={`${p.year}-${p.month}`} value={`${p.year}-${p.month}`}>{ymLabel(p)}</option>)}
                        </select>
                    )}
                    <div style={{ position: "relative", flex: "1 1 160px" }}>
                        <Search size={13} style={{ position: "absolute", left: 9, top: 10.5, color: "var(--text3)" }} />
                        <input placeholder="Search name or code" value={q} onChange={e => setQ(e.target.value)} style={{ ...box, width: "100%", paddingLeft: 28 }} />
                    </div>
                    <button type="button" onClick={downloadTemplate} disabled={!emps?.length} style={ghost}><Download size={14} /> Excel template</button>
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={!emps?.length} style={ghost}><Upload size={14} /> Upload Excel</button>
                    <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }} />
                </div>

                {/* Table */}
                <div style={{ overflowY: "auto", flex: 1 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr>
                                <th style={{ ...th, width: 110 }}>Emp Code</th>
                                <th style={th}>Employee</th>
                                <th style={{ ...th, width: 130, textAlign: "right" }}>Own rate (₹/hr)</th>
                                <th style={{ ...th, width: 170 }}>{tab === "rate" ? "Manual rate (₹/hr)" : `OT amount (₹)${period ? ` — ${ymLabel(period)}` : ""}`}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {emps === null && <tr><td colSpan={4} style={{ ...td, textAlign: "center", padding: 24, color: "var(--text3)" }}><Loader2 size={16} className="animate-spin" style={{ display: "inline" }} /> Loading employees…</td></tr>}
                            {emps && shown.length === 0 && <tr><td colSpan={4} style={{ ...td, textAlign: "center", padding: 24, color: "var(--text3)" }}>{emps.length ? "No employee matches the search." : "No employees are posted at this site."}</td></tr>}
                            {shown.map(e => (
                                <tr key={e.id}>
                                    <td style={{ ...td, fontFamily: "monospace", color: "var(--text2)" }}>{e.code}</td>
                                    <td style={{ ...td, fontWeight: 600, color: "var(--text)" }}>{e.name}{e.status !== "ACTIVE" && <span style={{ marginLeft: 6, fontSize: 10.5, color: "var(--text3)" }}>({e.status.toLowerCase()})</span>}</td>
                                    <td style={{ ...td, textAlign: "right", color: "var(--text3)" }}>{e.ownRate != null ? e.ownRate.toLocaleString("en-IN") : "—"}</td>
                                    <td style={td}>
                                        <input type="number" min={0} step="any" value={values[e.id] ?? ""} placeholder={tab === "rate" ? "Own rate" : "OT days × rate"}
                                            onChange={ev => setValue(e.id, ev.target.value)} aria-label={`${tab === "rate" ? "OT rate" : "OT amount"} for ${e.name}`}
                                            style={{ ...box, height: 30, width: "100%" }} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 16px", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11.5, color: "var(--text3)" }}>
                        {emps ? `${filled} of ${emps.length} filled` : ""}
                        {tab === "rate" ? " · Apply, then Save on the settings page." : " · Saved straight away; draft payroll updates."}
                    </span>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" onClick={onClose} style={ghost}>Close</button>
                        {tab === "rate"
                            ? <button type="button" onClick={applyRates} disabled={!emps} style={primary}>Apply rates</button>
                            : <button type="button" onClick={saveAmounts} disabled={!emps || !period || busy} style={{ ...primary, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : `Save amounts${period ? ` — ${ymLabel(period)}` : ""}`}</button>}
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    )
}
