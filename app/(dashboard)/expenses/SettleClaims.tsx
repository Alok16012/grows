"use client"

// Expense Claims → Settle approved claims. Tick approved claims and settle
// them together: paid by bank (mode, date, UTR) or added to a payroll month's
// salary as a Reimbursement line. Claims already on a salary that isn't locked
// can be taken off again.
import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { Banknote, Loader2, Search, Wallet, X } from "lucide-react"

type Claim = {
    id: string; expenseNo: string; title: string; amount: number; date: string; siteName: string | null
    status: string; employee: string; employeeCode: string | null; approvedAt: string | null; onSalary: string | null
}
type YM = { month: number; year: number }
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const ym = (p: YM) => `${MONTHS[p.month - 1]} ${p.year}`
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN")
const MODES = ["NEFT", "IMPS", "UPI", "RTGS", "Cash", "Cheque", "Bank Transfer"]
const box = "h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white"

export default function SettleClaims({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
    const [claims, setClaims] = useState<Claim[] | null>(null)
    const [allowed, setAllowed] = useState<YM[]>([])
    const [view, setView] = useState<"toPay" | "onSalary">("toPay")
    const [picked, setPicked] = useState<Set<string>>(new Set())
    const [q, setQ] = useState("")
    const [how, setHow] = useState<"bank" | "salary">("bank")
    const [mode, setMode] = useState("NEFT")
    const [utr, setUtr] = useState("")
    const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))
    const [month, setMonth] = useState("")
    const [busy, setBusy] = useState(false)

    const load = () => {
        setClaims(null); setPicked(new Set())
        fetch("/api/expenses/settle").then(r => r.json()).then(d => {
            setClaims(d.claims ?? [])
            const a: YM[] = d.window?.allowed ?? []
            setAllowed(a)
            if (a[0]) setMonth(`${a[0].year}-${a[0].month}`)
        }).catch(() => setClaims([]))
    }
    useEffect(() => {
        load()
        const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
        document.addEventListener("keydown", k)
        return () => document.removeEventListener("keydown", k)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const list = useMemo(() => {
        const t = q.trim().toLowerCase()
        return (claims ?? [])
            .filter(c => view === "toPay" ? c.status === "APPROVED" : !!c.onSalary)
            .filter(c => !t || [c.expenseNo, c.title, c.employee, c.employeeCode ?? "", c.siteName ?? ""].some(v => v.toLowerCase().includes(t)))
    }, [claims, q, view])
    const pickedList = list.filter(c => picked.has(c.id))
    const total = pickedList.reduce((s, c) => s + (Number(c.amount) || 0), 0)
    const allOn = list.length > 0 && list.every(c => picked.has(c.id))
    const toPayCount = (claims ?? []).filter(c => c.status === "APPROVED").length
    const toPayTotal = (claims ?? []).filter(c => c.status === "APPROVED").reduce((s, c) => s + (Number(c.amount) || 0), 0)
    const onSalaryCount = (claims ?? []).filter(c => c.onSalary).length

    async function go() {
        if (!pickedList.length) return
        let body: any
        if (view === "onSalary") body = { action: "unsettle", ids: pickedList.map(c => c.id) }
        else if (how === "bank") body = { action: "bank", ids: pickedList.map(c => c.id), paymentMode: mode, transactionId: utr || null, paymentDate: payDate }
        else { const [y, m] = month.split("-").map(Number); body = { action: "salary", ids: pickedList.map(c => c.id), month: m, year: y } }
        const what = view === "onSalary" ? `Take ${pickedList.length} claim(s) off the salary?` : how === "bank"
            ? `Mark ${pickedList.length} claim(s), ${inr(total)}, as paid by ${mode}?` : `Add ${pickedList.length} claim(s), ${inr(total)}, to the ${month ? ym({ year: Number(month.split("-")[0]), month: Number(month.split("-")[1]) }) : ""} salary?`
        if (!confirm(what)) return
        setBusy(true)
        try {
            const r = await fetch("/api/expenses/settle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
            const d = await r.json()
            if (!r.ok) throw new Error(d?.error || "Could not settle")
            if (body.action === "unsettle") toast.success(`${d.reverted} claim(s) taken off the salary`)
            else if (body.action === "bank") toast.success(`${d.settled} claim(s) marked paid${d.skipped ? ` · ${d.skipped} skipped (your own or no longer approved)` : ""}`)
            else toast.success(`${d.settled} claim(s) added to salary${d.rowsUpdated ? ` · ${d.rowsUpdated} draft payroll row(s) updated` : ""}${d.noEmployee ? ` · ${d.noEmployee} skipped (claimant not in Employee Master)` : ""}${d.lockedPayroll ? ` · ${d.lockedPayroll} skipped (that month's payroll is locked)` : ""}`)
            load(); onDone()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }

    return createPortal(
        <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4">
            <div role="dialog" aria-modal="true" aria-label="Settle approved claims" className="w-full max-w-3xl max-h-[92vh] flex flex-col bg-white rounded-[14px] border border-[var(--border)] shadow-xl">
                <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-[var(--border)]">
                    <div>
                        <h3 className="text-[15px] font-semibold text-[var(--text)]">Settle approved claims</h3>
                        <p className="text-[12px] text-[var(--text3)]">{toPayCount} approved claim{toPayCount === 1 ? "" : "s"} waiting to be paid · {inr(toPayTotal)}</p>
                    </div>
                    <button onClick={onClose} aria-label="Close" className="p-1 text-[var(--text3)]"><X size={18} /></button>
                </div>

                <div className="flex gap-1 px-5 pt-3 border-b border-[var(--border)]">
                    {([["toPay", `To pay (${toPayCount})`], ["onSalary", `On salary — not locked (${onSalaryCount})`]] as const).map(([k, l]) => (
                        <button key={k} onClick={() => { setView(k); setPicked(new Set()) }}
                            className={`px-3 py-2 text-[12.5px] font-semibold border-b-2 -mb-px ${view === k ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text3)]"}`}>{l}</button>
                    ))}
                </div>

                <div className="px-5 py-2.5 flex items-center gap-2 bg-[var(--surface2)] border-b border-[var(--border)]">
                    <div className="relative flex-1">
                        <Search size={13} className="absolute left-2.5 top-[11px] text-[var(--text3)]" />
                        <input placeholder="Search employee, code, claim, site" value={q} onChange={e => setQ(e.target.value)} className={`${box} w-full pl-8`} />
                    </div>
                </div>

                <div className="overflow-y-auto flex-1">
                    <table className="w-full text-[12.5px]">
                        <thead className="sticky top-0 bg-white z-[1]">
                            <tr className="text-[11px] uppercase tracking-wide text-[var(--text3)] border-b border-[var(--border)]">
                                <th className="py-2 pl-5 w-8 text-left"><input type="checkbox" checked={allOn} aria-label="Tick all" onChange={() => setPicked(p => { const n = new Set(p); list.forEach(c => allOn ? n.delete(c.id) : n.add(c.id)); return n })} /></th>
                                <th className="py-2 text-left">Claim</th>
                                <th className="py-2 text-left">Employee</th>
                                <th className="py-2 text-left">Site</th>
                                <th className="py-2 text-left">{view === "toPay" ? "Approved" : "On salary"}</th>
                                <th className="py-2 pr-5 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {claims === null && <tr><td colSpan={6} className="py-8 text-center text-[var(--text3)]"><Loader2 size={16} className="inline animate-spin" /> Loading…</td></tr>}
                            {claims && list.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-[var(--text3)]">{view === "toPay" ? "No approved claims waiting to be paid." : "No claims on an open salary month."}</td></tr>}
                            {list.map(c => (
                                <tr key={c.id} className={`border-b border-[var(--border)] ${picked.has(c.id) ? "bg-[#f0fdf4]" : ""}`}>
                                    <td className="py-2 pl-5"><input type="checkbox" checked={picked.has(c.id)} aria-label={`Tick ${c.expenseNo}`} onChange={() => setPicked(p => { const n = new Set(p); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n })} /></td>
                                    <td className="py-2"><span className="font-mono text-[var(--text2)]">{c.expenseNo}</span><span className="block text-[11.5px] text-[var(--text3)] truncate max-w-[200px]">{c.title}</span></td>
                                    <td className="py-2"><span className="font-semibold text-[var(--text)]">{c.employee}</span>{c.employeeCode ? <span className="block text-[11px] text-[var(--text3)]">{c.employeeCode}</span> : <span className="block text-[11px] text-[#b45309]">not in Employee Master</span>}</td>
                                    <td className="py-2 text-[var(--text2)]">{c.siteName || "—"}</td>
                                    <td className="py-2 text-[var(--text2)]">{view === "toPay" ? (c.approvedAt ? new Date(c.approvedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—") : c.onSalary}</td>
                                    <td className="py-2 pr-5 text-right font-semibold tabular-nums">{inr(Number(c.amount) || 0)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="px-5 py-3 border-t border-[var(--border)] space-y-2.5">
                    {view === "toPay" && (
                        <div className="flex flex-wrap items-end gap-2">
                            <div className="flex gap-1">
                                <button onClick={() => setHow("bank")} className={`h-9 px-3 rounded-[9px] text-[12.5px] font-semibold border inline-flex items-center gap-1.5 ${how === "bank" ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "bg-white text-[var(--text2)] border-[var(--border)]"}`}><Banknote size={14} /> Paid by bank</button>
                                <button onClick={() => setHow("salary")} className={`h-9 px-3 rounded-[9px] text-[12.5px] font-semibold border inline-flex items-center gap-1.5 ${how === "salary" ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "bg-white text-[var(--text2)] border-[var(--border)]"}`}><Wallet size={14} /> Add to salary</button>
                            </div>
                            {how === "bank" ? (<>
                                <select value={mode} onChange={e => setMode(e.target.value)} className={box} aria-label="Payment mode">{MODES.map(m => <option key={m}>{m}</option>)}</select>
                                <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className={box} aria-label="Payment date" />
                                <input placeholder="UTR / reference (optional)" value={utr} onChange={e => setUtr(e.target.value)} className={`${box} flex-1 min-w-[160px]`} />
                            </>) : (
                                <>
                                    <select value={month} onChange={e => setMonth(e.target.value)} className={box} aria-label="Payroll month">
                                        {allowed.map(a => <option key={`${a.year}-${a.month}`} value={`${a.year}-${a.month}`}>{ym(a)} salary</option>)}
                                    </select>
                                    <span className="text-[11.5px] text-[var(--text3)]">Added to net pay as “Expense reimbursement” — not to gross, PF or ESIC.</span>
                                </>
                            )}
                        </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[12.5px] text-[var(--text2)]">{pickedList.length} ticked · <b>{inr(total)}</b></span>
                        <div className="flex gap-2">
                            <button onClick={onClose} className="h-9 px-4 rounded-[9px] border border-[var(--border)] text-[13px] font-medium text-[var(--text2)]">Close</button>
                            <button onClick={go} disabled={busy || !pickedList.length} className="h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50 inline-flex items-center gap-1.5">
                                {busy && <Loader2 size={14} className="animate-spin" />}
                                {view === "onSalary" ? "Take off salary" : how === "bank" ? "Mark paid" : "Add to salary"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    )
}
