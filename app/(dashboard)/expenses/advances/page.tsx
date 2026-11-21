"use client"

// Expense Claims → Advances. Employees request an advance, Accounts approve
// and pay it, the employee files claims against it, and Accounts settle it:
// the balance is recovered from salary / returned, or paid out by bank / with
// salary. Limits and reminders: Expense Claims → Policy → Advances.
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Plus, X } from "lucide-react"

type YM = { month: number; year: number }
type Adv = {
    id: string; advanceNo: string; requestedBy: string; purpose: string; amount: number; neededBy: string | null
    siteName: string | null; status: string; createdAt: string; approvedAt: string | null; rejectionReason: string | null
    paidAt: string | null; paymentMode: string | null; transactionId: string | null
    settledAt: string | null; claimedAmount: number; balanceAction: string | null; balanceAmount: number; recoverMonth: number | null; recoverYear: number | null
    employee: string; employeeCode: string | null; overdue: boolean
    claimed: { approved: number; pending: number; claims: number }
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const ym = (p: YM) => `${MONTHS[p.month - 1]} ${p.year}`
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN")
const d = (s: string | null) => s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"
const MODES = ["NEFT", "IMPS", "UPI", "RTGS", "Cash", "Cheque", "Bank Transfer"]
const STATUS: Record<string, { label: string; cls: string }> = {
    REQUESTED: { label: "Requested", cls: "bg-[#fef3c7] text-[#b45309]" },
    APPROVED: { label: "Approved — to pay", cls: "bg-[#dbeafe] text-[#1d4ed8]" },
    PAID: { label: "Paid — to settle", cls: "bg-[#ede9fe] text-[#6d28d9]" },
    SETTLED: { label: "Settled", cls: "bg-[#dcfce7] text-[#15803d]" },
    REJECTED: { label: "Rejected", cls: "bg-[#fee2e2] text-[#b91c1c]" },
}
const box = "h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white w-full"

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
    useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k) }, [onClose])
    return createPortal(
        <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4">
            <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md bg-white rounded-[14px] border border-[var(--border)] shadow-xl">
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[var(--border)]">
                    <h3 className="text-[15px] font-semibold text-[var(--text)]">{title}</h3>
                    <button onClick={onClose} aria-label="Close" className="p-1 text-[var(--text3)]"><X size={18} /></button>
                </div>
                <div className="p-5 space-y-3">{children}</div>
            </div>
        </div>, document.body)
}

export default function AdvancesPage() {
    const [view, setView] = useState<"mine" | "all">("mine")
    const [data, setData] = useState<{ advances: Adv[]; canManage: boolean; policy: { maxAmount: number; settleWithinDays: number }; window: { open: YM; allowed: YM[] } } | null>(null)
    const [busy, setBusy] = useState(false)
    const [requestOpen, setRequestOpen] = useState(false)
    const [payFor, setPayFor] = useState<Adv | null>(null)
    const [settleFor, setSettleFor] = useState<Adv | null>(null)
    const [statusFilter, setStatusFilter] = useState("OPEN")
    const [q, setQ] = useState("")

    const load = useCallback(() => {
        setData(null)
        fetch(`/api/expenses/advances?view=${view}`).then(r => r.json()).then(d => {
            setData(d)
            if (view === "mine" && d?.canManage && !sessionStorage.getItem("advViewSet")) { sessionStorage.setItem("advViewSet", "1"); setView("all") }
        }).catch(() => setData({ advances: [], canManage: false, policy: { maxAmount: 0, settleWithinDays: 0 }, window: { open: { month: 1, year: 2026 }, allowed: [] } }))
    }, [view])
    useEffect(() => { load() }, [load])

    async function act(a: Adv, body: any, done: string) {
        setBusy(true)
        try {
            const r = await fetch(`/api/expenses/advances/${a.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
            const j = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(j?.error || "Could not save")
            toast.success(done); setPayFor(null); setSettleFor(null); load()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }

    const list = useMemo(() => {
        const t = q.trim().toLowerCase()
        return (data?.advances ?? [])
            .filter(a => statusFilter === "ALL" ? true : statusFilter === "OPEN" ? ["REQUESTED", "APPROVED", "PAID"].includes(a.status) : a.status === statusFilter)
            .filter(a => !t || [a.advanceNo, a.purpose, a.employee, a.employeeCode ?? "", a.siteName ?? ""].some(v => v.toLowerCase().includes(t)))
    }, [data, statusFilter, q])
    const all = data?.advances ?? []
    const outstanding = all.filter(a => a.status === "PAID")
    const stats = [
        { label: "Requested", value: String(all.filter(a => a.status === "REQUESTED").length) },
        { label: "Approved — to pay", value: inr(all.filter(a => a.status === "APPROVED").reduce((s, a) => s + a.amount, 0)) },
        { label: "Paid — not settled", value: inr(outstanding.reduce((s, a) => s + a.amount, 0)) },
        { label: "Overdue to settle", value: String(outstanding.filter(a => a.overdue).length) },
    ]

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <Link href="/expenses" className="inline-flex items-center gap-1 text-[12.5px] text-[var(--text3)] hover:text-[var(--text)]"><ArrowLeft className="h-3.5 w-3.5" /> Expense Claims</Link>
                    <h1 className="text-[22px] font-bold text-[var(--text)] mt-1">Advances</h1>
                    <p className="text-[12.5px] text-[var(--text3)]">Request an advance, file your claims against it once it is paid, then Accounts settle it.</p>
                </div>
                <button onClick={() => setRequestOpen(true)} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-[10px] bg-[var(--accent)] text-white text-[13px] font-semibold"><Plus className="h-4 w-4" /> Request advance</button>
            </div>

            {data?.canManage && (
                <div className="flex gap-1 border-b border-[var(--border)]">
                    {([["all", "All advances"], ["mine", "My advances"]] as const).map(([k, l]) => (
                        <button key={k} onClick={() => setView(k)} className={`px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px ${view === k ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text3)]"}`}>{l}</button>
                    ))}
                </div>
            )}

            {view === "all" && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {stats.map(s => (
                        <div key={s.label} className="bg-white border border-[var(--border)] rounded-[12px] p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)]">{s.label}</p>
                            <p className="text-[20px] font-bold text-[var(--text)] tabular-nums">{s.value}</p>
                        </div>
                    ))}
                </div>
            )}

            <div className="bg-white border border-[var(--border)] rounded-[12px]">
                <div className="flex flex-wrap items-center gap-2 p-3 border-b border-[var(--border)]">
                    {([["OPEN", "Open"], ["REQUESTED", "Requested"], ["APPROVED", "To pay"], ["PAID", "To settle"], ["SETTLED", "Settled"], ["REJECTED", "Rejected"], ["ALL", "All"]] as const).map(([k, l]) => (
                        <button key={k} onClick={() => setStatusFilter(k)} className={`px-3 py-1 rounded-full text-[12px] font-medium ${statusFilter === k ? "bg-[var(--accent)] text-white" : "bg-[var(--surface2)] text-[var(--text2)]"}`}>{l}</button>
                    ))}
                    <input placeholder="Search" value={q} onChange={e => setQ(e.target.value)} className="ml-auto h-8 rounded-[8px] border border-[var(--border)] px-2.5 text-[12.5px] w-48" />
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-[12.5px] min-w-[860px]">
                        <thead>
                            <tr className="text-[11px] uppercase tracking-wide text-[var(--text3)] border-b border-[var(--border)]">
                                <th className="text-left py-2 pl-4">Advance</th>
                                {view === "all" && <th className="text-left py-2">Employee</th>}
                                <th className="text-left py-2">Purpose</th>
                                <th className="text-right py-2">Amount</th>
                                <th className="text-right py-2">Claimed</th>
                                <th className="text-left py-2 pl-4">Status</th>
                                <th className="text-right py-2 pr-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {!data && <tr><td colSpan={7} className="py-10 text-center text-[var(--text3)]"><Loader2 className="inline h-4 w-4 animate-spin" /> Loading…</td></tr>}
                            {data && list.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-[var(--text3)]">No advances here.</td></tr>}
                            {list.map(a => {
                                const st = STATUS[a.status] ?? { label: a.status, cls: "bg-[var(--surface2)]" }
                                const mine = view === "mine"
                                return (
                                    <tr key={a.id} className="border-b border-[var(--border)] align-top">
                                        <td className="py-2.5 pl-4"><span className="font-mono font-semibold text-[var(--text)]">{a.advanceNo}</span><span className="block text-[11px] text-[var(--text3)]">{d(a.createdAt)}{a.siteName ? ` · ${a.siteName}` : ""}</span></td>
                                        {view === "all" && <td className="py-2.5"><span className="font-semibold">{a.employee}</span><span className="block text-[11px] text-[var(--text3)]">{a.employeeCode ?? ""}</span></td>}
                                        <td className="py-2.5 max-w-[220px]">{a.purpose}{a.neededBy && <span className="block text-[11px] text-[var(--text3)]">Needed by {d(a.neededBy)}</span>}</td>
                                        <td className="py-2.5 text-right font-semibold tabular-nums">{inr(a.amount)}</td>
                                        <td className="py-2.5 text-right tabular-nums">
                                            {a.status === "SETTLED" ? inr(a.claimedAmount) : inr(a.claimed.approved)}
                                            {a.claimed.pending > 0 && a.status !== "SETTLED" && <span className="block text-[11px] text-[#b45309]">+{inr(a.claimed.pending)} awaiting approval</span>}
                                            <span className="block text-[11px] text-[var(--text3)]">{a.claimed.claims} claim{a.claimed.claims === 1 ? "" : "s"}</span>
                                        </td>
                                        <td className="py-2.5 pl-4">
                                            <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                                            {a.overdue && <span className="ml-1 inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#fee2e2] text-[#b91c1c]">overdue</span>}
                                            {a.status === "PAID" && <span className="block text-[11px] text-[var(--text3)]">Paid {d(a.paidAt)} · {a.paymentMode}</span>}
                                            {a.status === "SETTLED" && <span className="block text-[11px] text-[var(--text3)]">{settledText(a)}</span>}
                                            {a.status === "REJECTED" && a.rejectionReason && <span className="block text-[11px] text-[#b91c1c]">{a.rejectionReason}</span>}
                                        </td>
                                        <td className="py-2.5 pr-4 text-right whitespace-nowrap">
                                            {mine && a.status === "REQUESTED" && <button disabled={busy} onClick={() => confirm(`Cancel ${a.advanceNo}?`) && act(a, { action: "CANCEL" }, "Request cancelled")} className="text-[12px] font-semibold text-[#b91c1c]">Cancel</button>}
                                            {mine && a.status === "PAID" && <Link href="/expenses" className="text-[12px] font-semibold text-[var(--accent)]">File a claim →</Link>}
                                            {!mine && a.status === "REQUESTED" && (<>
                                                <button disabled={busy} onClick={() => act(a, { action: "APPROVE" }, `${a.advanceNo} approved`)} className="h-7 px-2.5 rounded-[7px] bg-[var(--accent)] text-white text-[12px] font-semibold mr-1">Approve</button>
                                                <button disabled={busy} onClick={() => { const reason = prompt(`Reason for rejecting ${a.advanceNo}`); if (reason) act(a, { action: "REJECT", reason }, `${a.advanceNo} rejected`) }} className="h-7 px-2.5 rounded-[7px] border border-[var(--border)] text-[12px] font-semibold text-[#b91c1c]">Reject</button>
                                            </>)}
                                            {!mine && a.status === "APPROVED" && <button disabled={busy} onClick={() => setPayFor(a)} className="h-7 px-2.5 rounded-[7px] bg-[var(--accent)] text-white text-[12px] font-semibold">Pay</button>}
                                            {!mine && a.status === "PAID" && <button disabled={busy} onClick={() => setSettleFor(a)} className="h-7 px-2.5 rounded-[7px] bg-[#6d28d9] text-white text-[12px] font-semibold">Settle</button>}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {requestOpen && <RequestModal maxAmount={data?.policy.maxAmount ?? 0} onClose={() => setRequestOpen(false)} onDone={() => { setRequestOpen(false); setView("mine"); load() }} />}
            {payFor && <PayModal a={payFor} busy={busy} onClose={() => setPayFor(null)} onPay={(b) => act(payFor, { action: "PAY", ...b }, `${payFor.advanceNo} marked paid`)} />}
            {settleFor && data && <SettleModal a={settleFor} allowed={data.window.allowed} busy={busy} onClose={() => setSettleFor(null)} onSettle={(choice) => act(settleFor, { action: "SETTLE", choice }, `${settleFor.advanceNo} settled`)} />}
        </div>
    )
}

function settledText(a: Adv) {
    const p = a.recoverMonth && a.recoverYear ? ym({ month: a.recoverMonth, year: a.recoverYear }) : ""
    switch (a.balanceAction) {
        case "RECOVER_SALARY": return `${inr(a.balanceAmount)} recovered from ${p} salary`
        case "RETURNED": return `${inr(a.balanceAmount)} returned by the employee`
        case "PAY_BANK": return `${inr(a.balanceAmount)} paid to the employee by bank`
        case "PAY_SALARY": return `${inr(a.balanceAmount)} paid with ${p} salary`
        default: return "Claims equal the advance"
    }
}

function RequestModal({ maxAmount, onClose, onDone }: { maxAmount: number; onClose: () => void; onDone: () => void }) {
    const [purpose, setPurpose] = useState(""), [amount, setAmount] = useState(""), [neededBy, setNeededBy] = useState(""), [siteId, setSiteId] = useState("")
    const [sites, setSites] = useState<{ id: string; name: string }[]>([])
    const [busy, setBusy] = useState(false)
    useEffect(() => { fetch("/api/sites?isActive=true").then(r => r.ok ? r.json() : []).then(d => { const l = Array.isArray(d) ? d : d?.sites ?? []; setSites(l.map((s: any) => ({ id: s.id, name: s.name })).sort((a: any, b: any) => a.name.localeCompare(b.name))) }).catch(() => {}) }, [])
    async function send() {
        setBusy(true)
        try {
            const r = await fetch("/api/expenses/advances", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose, amount: Number(amount), neededBy: neededBy || null, siteId: siteId || null, siteName: sites.find(s => s.id === siteId)?.name ?? null }) })
            const j = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(j?.error || "Could not send")
            toast.success(`${j.advanceNo} requested`); onDone()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    return (
        <Modal title="Request an advance" onClose={onClose}>
            <label className="block text-[11px] font-semibold text-[var(--text3)] uppercase">What is it for?<input value={purpose} onChange={e => setPurpose(e.target.value)} maxLength={300} placeholder="e.g. Site visit to Pune — travel and stay" className={box} /></label>
            <div className="grid grid-cols-2 gap-3">
                <label className="text-[11px] font-semibold text-[var(--text3)] uppercase">Amount (₹)<input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} className={box} /></label>
                <label className="text-[11px] font-semibold text-[var(--text3)] uppercase">Needed by<input type="date" value={neededBy} onChange={e => setNeededBy(e.target.value)} className={box} /></label>
            </div>
            {maxAmount > 0 && <p className="text-[11.5px] text-[var(--text3)]">Most one advance can be: {inr(maxAmount)}</p>}
            <label className="block text-[11px] font-semibold text-[var(--text3)] uppercase">Site (optional)
                <select value={siteId} onChange={e => setSiteId(e.target.value)} className={box}><option value="">— None —</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            </label>
            <div className="flex justify-end gap-2 pt-1">
                <button onClick={onClose} className="h-9 px-4 rounded-[9px] border border-[var(--border)] text-[13px]">Cancel</button>
                <button onClick={send} disabled={busy || !purpose.trim() || !(Number(amount) > 0)} className="h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50">{busy ? "Sending…" : "Send request"}</button>
            </div>
        </Modal>
    )
}

function PayModal({ a, busy, onClose, onPay }: { a: Adv; busy: boolean; onClose: () => void; onPay: (b: { paymentMode: string; transactionId: string | null; paymentDate: string }) => void }) {
    const [mode, setMode] = useState("NEFT"), [utr, setUtr] = useState(""), [date, setDate] = useState(new Date().toISOString().slice(0, 10))
    return (
        <Modal title={`Pay ${a.advanceNo} — ${inr(a.amount)}`} onClose={onClose}>
            <p className="text-[12.5px] text-[var(--text2)]">{a.employee}{a.employeeCode ? ` (${a.employeeCode})` : ""} · {a.purpose}</p>
            <div className="grid grid-cols-2 gap-3">
                <label className="text-[11px] font-semibold text-[var(--text3)] uppercase">Mode<select value={mode} onChange={e => setMode(e.target.value)} className={box}>{MODES.map(m => <option key={m}>{m}</option>)}</select></label>
                <label className="text-[11px] font-semibold text-[var(--text3)] uppercase">Date<input type="date" value={date} onChange={e => setDate(e.target.value)} className={box} /></label>
            </div>
            <label className="block text-[11px] font-semibold text-[var(--text3)] uppercase">UTR / reference<input value={utr} onChange={e => setUtr(e.target.value)} className={box} /></label>
            <div className="flex justify-end gap-2 pt-1">
                <button onClick={onClose} className="h-9 px-4 rounded-[9px] border border-[var(--border)] text-[13px]">Cancel</button>
                <button onClick={() => onPay({ paymentMode: mode, transactionId: utr || null, paymentDate: date })} disabled={busy} className="h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50">Mark paid</button>
            </div>
        </Modal>
    )
}

function SettleModal({ a, allowed, busy, onClose, onSettle }: { a: Adv; allowed: YM[]; busy: boolean; onClose: () => void; onSettle: (choice: any) => void }) {
    const claimed = a.claimed.approved
    const diff = Math.round((claimed - a.amount) * 100) / 100
    const [how, setHow] = useState(diff < 0 ? "RECOVER_SALARY" : diff > 0 ? "PAY_BANK" : "NONE")
    const [month, setMonth] = useState(allowed[0] ? `${allowed[0].year}-${allowed[0].month}` : "")
    const [mode, setMode] = useState("NEFT"), [utr, setUtr] = useState(""), [note, setNote] = useState("")
    const choice = () => {
        const [y, m] = month.split("-").map(Number)
        if (how === "RECOVER_SALARY" || how === "PAY_SALARY") return { action: how, month: m, year: y }
        if (how === "PAY_BANK") return { action: how, paymentMode: mode, transactionId: utr || null }
        if (how === "RETURNED") return { action: how, note }
        return { action: "NONE" }
    }
    return (
        <Modal title={`Settle ${a.advanceNo}`} onClose={onClose}>
            <div className="rounded-[10px] bg-[var(--surface2)] p-3 text-[13px] space-y-1">
                <div className="flex justify-between"><span>Advance paid</span><b>{inr(a.amount)}</b></div>
                <div className="flex justify-between"><span>Approved claims ({a.claimed.claims})</span><b>{inr(claimed)}</b></div>
                <div className="flex justify-between border-t border-[var(--border)] pt-1"><span>{diff < 0 ? "Employee owes" : diff > 0 ? "Company owes" : "Balance"}</span><b className={diff < 0 ? "text-[#b91c1c]" : diff > 0 ? "text-[#15803d]" : ""}>{inr(Math.abs(diff))}</b></div>
            </div>
            {a.claimed.pending > 0 && <p className="text-[12px] text-[#b45309]">{inr(a.claimed.pending)} of claims are still waiting for approval — approve or reject them before settling.</p>}
            {diff < 0 && (
                <div className="space-y-2">
                    <label className="flex items-center gap-2 text-[13px]"><input type="radio" checked={how === "RECOVER_SALARY"} onChange={() => setHow("RECOVER_SALARY")} /> Recover from salary</label>
                    {how === "RECOVER_SALARY" && <select value={month} onChange={e => setMonth(e.target.value)} className={box}>{allowed.map(p => <option key={`${p.year}-${p.month}`} value={`${p.year}-${p.month}`}>{ym(p)} salary — added to the Advance deduction</option>)}</select>}
                    <label className="flex items-center gap-2 text-[13px]"><input type="radio" checked={how === "RETURNED"} onChange={() => setHow("RETURNED")} /> Employee returned it</label>
                    {how === "RETURNED" && <input placeholder="How / reference (optional)" value={note} onChange={e => setNote(e.target.value)} className={box} />}
                </div>
            )}
            {diff > 0 && (
                <div className="space-y-2">
                    <label className="flex items-center gap-2 text-[13px]"><input type="radio" checked={how === "PAY_BANK"} onChange={() => setHow("PAY_BANK")} /> Pay the employee by bank</label>
                    {how === "PAY_BANK" && <div className="grid grid-cols-2 gap-2"><select value={mode} onChange={e => setMode(e.target.value)} className={box}>{MODES.map(m => <option key={m}>{m}</option>)}</select><input placeholder="UTR (optional)" value={utr} onChange={e => setUtr(e.target.value)} className={box} /></div>}
                    <label className="flex items-center gap-2 text-[13px]"><input type="radio" checked={how === "PAY_SALARY"} onChange={() => setHow("PAY_SALARY")} /> Pay with salary</label>
                    {how === "PAY_SALARY" && <select value={month} onChange={e => setMonth(e.target.value)} className={box}>{allowed.map(p => <option key={`${p.year}-${p.month}`} value={`${p.year}-${p.month}`}>{ym(p)} salary — Expense reimbursement line</option>)}</select>}
                </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
                <button onClick={onClose} className="h-9 px-4 rounded-[9px] border border-[var(--border)] text-[13px]">Cancel</button>
                <button onClick={() => onSettle(choice())} disabled={busy || a.claimed.pending > 0} className="h-9 px-4 rounded-[9px] bg-[#6d28d9] text-white text-[13px] font-semibold disabled:opacity-50">Settle</button>
            </div>
        </Modal>
    )
}
