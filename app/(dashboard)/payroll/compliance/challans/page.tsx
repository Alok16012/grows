"use client"

// Payroll → Compliance → Challans. Per wage month: PF / ESIC / PT / LWF / TDS
// dues from payroll, the challans paid against them, due dates, a sanity check
// of that month's payroll — plus settings and old never-processed drafts.
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { AlertTriangle, ArrowLeft, Info, Loader2, Plus, Trash2, X } from "lucide-react"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const TYPES = ["PF", "ESI", "PT", "LWF", "TDS"] as const
const TYPE_LABEL: Record<string, string> = { PF: "PF (EPFO)", ESI: "ESIC", PT: "Professional Tax", LWF: "Labour Welfare Fund", TDS: "TDS" }
const STATUS: Record<string, [string, string]> = { PAID: ["Paid", "bg-green-50 text-green-700"], PART_PAID: ["Part paid", "bg-amber-50 text-amber-800"], DUE: ["Due", "bg-blue-50 text-blue-700"], OVERDUE: ["Overdue", "bg-red-50 text-red-700"], NOTHING_DUE: ["—", "text-[var(--text3)]"] }
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`
const day = (s: string | null) => s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"
const th = "text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)] border-b border-[var(--border)] bg-[var(--surface2)] whitespace-nowrap"
const td = "px-3 py-2 border-b border-[var(--border)] text-[12.5px] align-top"
const box = "h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white"
const btn = "h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
const btn2 = "h-8 px-3 rounded-[8px] border border-[var(--border)] bg-white text-[12px] font-semibold text-[var(--text2)] inline-flex items-center gap-1 disabled:opacity-50"

export default function ChallansPage() {
    const [tab, setTab] = useState<"months" | "settings" | "drafts">("months")
    const [ov, setOv] = useState<any>(null)
    const [pick, setPick] = useState<{ month: number; year: number } | null>(null)
    const load = useCallback(() => { fetch("/api/payroll/challans").then(r => r.json()).then(setOv).catch(() => toast.error("Couldn't load")) }, [])
    useEffect(() => { load() }, [load])
    return (
        <div className="max-w-[1200px] mx-auto p-4 md:p-6 space-y-4">
            <div>
                <Link href="/payroll/compliance" className="inline-flex items-center gap-1 text-[12.5px] text-[var(--text3)] hover:text-[var(--text)]"><ArrowLeft className="h-3.5 w-3.5" /> Compliance</Link>
                <h1 className="text-[22px] font-bold text-[var(--text)] mt-1">Statutory challans</h1>
                <p className="text-[12.5px] text-[var(--text3)]">What is owed each month (worked out from payroll, same figures as the ECR and challan reports), what has been paid, and when it is due.</p>
            </div>
            <div className="flex gap-1 border-b border-[var(--border)]">
                {([["months", "Months"], ["settings", "Due dates & alerts"], ["drafts", `Old drafts${ov?.oldDrafts?.length ? ` (${ov.oldDrafts.length})` : ""}`]] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px ${tab === k ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text3)]"}`}>{l}</button>
                ))}
            </div>
            {!ov ? <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--text3)]" /></div>
                : tab === "months" ? (pick ? <MonthView m={pick} canRecord={ov.canRecord} onBack={() => { setPick(null); load() }} /> : <Overview ov={ov} onPick={setPick} />)
                    : tab === "settings" ? <Settings s={ov.settings} canEdit={ov.canRecord} onSaved={load} />
                        : <Drafts list={ov.oldDrafts} canDelete={ov.canDeleteDrafts} onDone={load} />}
        </div>
    )
}

function Overview({ ov, onPick }: { ov: any; onPick: (m: { month: number; year: number }) => void }) {
    if (!ov.months.length) return <p className="text-[13px] text-[var(--text3)] bg-white border border-[var(--border)] rounded-[12px] p-6 text-center">No processed payroll yet.</p>
    return (
        <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-x-auto">
            <table className="w-full min-w-[760px]">
                <thead><tr><th className={th}>Wage month</th>{TYPES.map(t => <th key={t} className={th}>{TYPE_LABEL[t]}</th>)}<th className={th}></th></tr></thead>
                <tbody>{ov.months.map((m: any) => (
                    <tr key={`${m.year}-${m.month}`}>
                        <td className={`${td} font-semibold`}>{MONTHS[m.month - 1]} {m.year}</td>
                        {TYPES.map(t => { const r = m.rows.find((x: any) => x.type === t); const [l, c] = STATUS[r?.status ?? "NOTHING_DUE"]; return <td key={t} className={td}>{r && r.due > 0 ? <><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${c}`}>{l}</span><span className="block text-[11px] text-[var(--text3)] mt-0.5">{inr(r.paid)} / {inr(r.due)} · due {day(r.dueDate)}</span></> : <span className="text-[var(--text3)]">—</span>}</td> })}
                        <td className={`${td} text-right`}><button onClick={() => onPick({ month: m.month, year: m.year })} className={btn2}>Open</button></td>
                    </tr>
                ))}</tbody>
            </table>
        </div>
    )
}

function MonthView({ m, canRecord, onBack }: { m: { month: number; year: number }; canRecord: boolean; onBack: () => void }) {
    const [d, setD] = useState<any>(null)
    const [rec, setRec] = useState<string | null>(null)
    const load = useCallback(() => { setD(null); fetch(`/api/payroll/challans?month=${m.month}&year=${m.year}`).then(r => r.json()).then(setD).catch(() => toast.error("Couldn't load")) }, [m])
    useEffect(() => { load() }, [load])
    async function remove(id: string) {
        if (!confirm("Remove this challan record?")) return
        const r = await fetch("/api/payroll/challans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove", id }) })
        if (!r.ok) toast.error((await r.json().catch(() => ({})))?.error || "Could not remove"); else { toast.success("Removed"); load() }
    }
    if (!d) return <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--text3)]" /></div>
    const pf = d.dues.PF, esi = d.dues.ESI
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <button onClick={onBack} className={btn2}><ArrowLeft size={13} /> All months</button>
                <p className="text-[13px]"><b>{MONTHS[m.month - 1]} {m.year}</b> · {d.dues.rows} processed payslip(s){d.dues.drafts ? <span className="text-amber-700"> · {d.dues.drafts} still draft (not counted)</span> : null}</p>
            </div>
            {d.sanity.issues.length > 0 && (
                <div className="space-y-1">{d.sanity.issues.map((i: any, k: number) => (
                    <div key={k} className={`flex items-start gap-2 rounded-[10px] px-3 py-2 text-[12.5px] ${i.level === "warn" ? "bg-red-50 text-red-800" : "bg-[var(--surface2)] text-[var(--text2)]"}`}>{i.level === "warn" ? <AlertTriangle size={14} className="mt-0.5 shrink-0" /> : <Info size={14} className="mt-0.5 shrink-0" />}{i.text}</div>
                ))}</div>
            )}
            <div className="grid md:grid-cols-2 gap-3">
                <div className="bg-white border border-[var(--border)] rounded-[12px] p-4 text-[12.5px] space-y-1">
                    <p className="font-semibold text-[13px]">PF challan — {pf.members} member(s)</p>
                    {[["A/c 1 — Employee share", pf.ee], ["A/c 1 — Employer EPF", pf.epfEr], ["A/c 10 — EPS (pension)", pf.eps], ["A/c 21 — EDLI", pf.edli], ["A/c 2 — Admin charges", pf.admin]].map(([l, v]) => <div key={l as string} className="flex justify-between"><span className="text-[var(--text2)]">{l}</span><span className="tabular-nums">{inr(v as number)}</span></div>)}
                    <div className="flex justify-between font-bold border-t border-[var(--border)] pt-1"><span>Total</span><span className="tabular-nums">{inr(pf.total)}</span></div>
                </div>
                <div className="bg-white border border-[var(--border)] rounded-[12px] p-4 text-[12.5px] space-y-1">
                    <p className="font-semibold text-[13px]">ESIC — {esi.members} member(s)</p>
                    <div className="flex justify-between"><span className="text-[var(--text2)]">Employee share</span><span className="tabular-nums">{inr(esi.ee)}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--text2)]">Employer share</span><span className="tabular-nums">{inr(esi.er)}</span></div>
                    <div className="flex justify-between font-bold border-t border-[var(--border)] pt-1"><span>Total</span><span className="tabular-nums">{inr(esi.total)}</span></div>
                    <p className="pt-2 text-[var(--text2)]">PT {inr(d.dues.PT.total)} ({d.dues.PT.members}) · LWF {inr(d.dues.LWF.total)} ({d.dues.LWF.members}) · TDS {inr(d.dues.TDS.total)} ({d.dues.TDS.members})</p>
                </div>
            </div>
            <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-x-auto">
                <table className="w-full min-w-[760px]">
                    <thead><tr><th className={th}>Challan</th><th className={th}>Due</th><th className={th}>Due date</th><th className={th}>Paid</th><th className={th}>Status</th><th className={th}>Payments</th><th className={th}></th></tr></thead>
                    <tbody>{d.rows.map((r: any) => { const [l, c] = STATUS[r.status]; return (
                        <tr key={r.type}>
                            <td className={`${td} font-semibold`}>{r.label}</td>
                            <td className={`${td} tabular-nums`}>{inr(r.due)}</td>
                            <td className={td}>{r.due > 0 ? day(r.dueDate) : "—"}</td>
                            <td className={`${td} tabular-nums`}>{inr(r.paid)}{r.paid > 0 && r.paid !== r.due && <span className={`block text-[11px] ${r.paid > r.due ? "text-amber-700" : "text-red-600"}`}>{r.paid > r.due ? "+" : ""}{inr(r.paid - r.due)} vs due</span>}</td>
                            <td className={td}><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${c}`}>{l}</span></td>
                            <td className={`${td} text-[11.5px]`}>{r.challans.map((c: any) => <div key={c.id} className="flex items-center gap-1.5">{inr(c.amount)} · {c.trrnNumber ?? "no ref"} · {day(c.paymentDate)}{c.status !== "PAID" && ` (${c.status.toLowerCase()})`}{c.documentUrl && <a href={c.documentUrl} target="_blank" rel="noreferrer" className="text-[var(--accent)]">receipt</a>}{canRecord && <button onClick={() => remove(c.id)} aria-label="Remove" className="text-red-600"><Trash2 size={12} /></button>}</div>)}</td>
                            <td className={`${td} text-right`}>{canRecord && (r.due > 0 || r.challans.length > 0) && <button onClick={() => setRec(r.type)} className={btn2}><Plus size={12} /> Record</button>}</td>
                        </tr>
                    ) })}</tbody>
                </table>
            </div>
            {rec && <RecordModal type={rec} m={m} due={Math.max(0, (d.rows.find((r: any) => r.type === rec)?.due ?? 0) - (d.rows.find((r: any) => r.type === rec)?.paid ?? 0))} onClose={() => setRec(null)} onSaved={() => { setRec(null); load() }} />}
        </div>
    )
}

function RecordModal({ type, m, due, onClose, onSaved }: { type: string; m: { month: number; year: number }; due: number; onClose: () => void; onSaved: () => void }) {
    const [f, setF] = useState({ amount: String(due || ""), trrnNumber: "", paymentDate: new Date().toISOString().slice(0, 10), status: "PAID" })
    const [file, setFile] = useState<File | null>(null)
    const [busy, setBusy] = useState(false)
    useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k) }, [onClose])
    async function save() {
        setBusy(true)
        try {
            let documentUrl: string | null = null
            if (file) {
                const fd = new FormData(); fd.append("file", file); fd.append("kind", "document")
                const up = await fetch("/api/upload", { method: "POST", body: fd }); const j = await up.json().catch(() => ({}))
                if (!up.ok || !j.url) throw new Error(j.error || "Receipt upload failed")
                documentUrl = j.url
            }
            const r = await fetch("/api/payroll/challans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "record", type, month: m.month, year: m.year, ...f, amount: Number(f.amount), documentUrl }) })
            const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j?.error || "Could not save")
            toast.success("Challan recorded"); onSaved()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    const lbl = "block text-[11px] font-semibold uppercase text-[var(--text3)]"
    return (
        <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4">
            <div role="dialog" aria-modal="true" aria-label="Record challan" className="w-full max-w-md bg-white rounded-[14px] border border-[var(--border)] shadow-xl">
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[var(--border)]"><h3 className="text-[15px] font-semibold">{TYPE_LABEL[type]} — {MONTHS[m.month - 1]} {m.year}</h3><button onClick={onClose} aria-label="Close" className="p-1 text-[var(--text3)]"><X size={18} /></button></div>
                <div className="p-5 space-y-3">
                    <label className={lbl}>Amount paid (₹){due > 0 && <span className="normal-case font-normal"> — outstanding {inr(due)}</span>}<input type="number" value={f.amount} onChange={e => setF(x => ({ ...x, amount: e.target.value }))} className={`${box} w-full`} /></label>
                    <label className={lbl}>{type === "PF" ? "TRRN" : "Challan / reference no."}<input value={f.trrnNumber} onChange={e => setF(x => ({ ...x, trrnNumber: e.target.value }))} className={`${box} w-full`} /></label>
                    <div className="grid grid-cols-2 gap-3">
                        <label className={lbl}>Payment date<input type="date" value={f.paymentDate} onChange={e => setF(x => ({ ...x, paymentDate: e.target.value }))} className={`${box} w-full`} /></label>
                        <label className={lbl}>Status<select value={f.status} onChange={e => setF(x => ({ ...x, status: e.target.value }))} className={`${box} w-full`}><option value="PAID">Paid</option><option value="PENDING">Generated, not paid yet</option></select></label>
                    </div>
                    <label className={lbl}>Receipt (PDF / image, optional)<input type="file" accept=".pdf,image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} className="block text-[12.5px] mt-1" /></label>
                    <div className="flex justify-end gap-2"><button onClick={onClose} className={btn2}>Cancel</button><button onClick={save} disabled={busy || !(Number(f.amount) > 0)} className={btn}>{busy && <Loader2 size={14} className="animate-spin" />}Save</button></div>
                </div>
            </div>
        </div>
    )
}

function Settings({ s: initial, canEdit, onSaved }: { s: any; canEdit: boolean; onSaved: () => void }) {
    const [s, setS] = useState(initial)
    const [busy, setBusy] = useState(false)
    async function save() {
        setBusy(true)
        try { const r = await fetch("/api/payroll/challans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "settings", settings: s }) }); if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "Could not save"); toast.success("Saved"); onSaved() }
        catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    return (
        <div className="bg-white border border-[var(--border)] rounded-[12px] p-4 space-y-3 max-w-2xl text-[13px]">
            <p className="font-semibold">Due date — day of the month after the wage month</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">{TYPES.map(t => <label key={t} className="text-[11px] font-semibold uppercase text-[var(--text3)]">{TYPE_LABEL[t]}<input type="number" min={1} max={31} disabled={!canEdit} value={s.dueDay[t]} onChange={e => setS((x: any) => ({ ...x, dueDay: { ...x.dueDay, [t]: Number(e.target.value) } }))} className={`${box} w-full`} /></label>)}</div>
            <label className="flex items-center gap-2 flex-wrap">LWF is paid for the wage months<input disabled={!canEdit} value={s.lwfMonths.join(", ")} onChange={e => setS((x: any) => ({ ...x, lwfMonths: e.target.value.split(",").map(v => Number(v.trim())).filter(Boolean) }))} className={`${box} w-32`} /><span className="text-[var(--text3)] text-[12px]">(e.g. 6, 12 for June and December)</span></label>
            <label className="flex items-center gap-2">Remind payroll<input type="number" min={0} max={30} disabled={!canEdit} value={s.remindDaysBefore} onChange={e => setS((x: any) => ({ ...x, remindDaysBefore: Number(e.target.value) }))} className={`${box} w-20`} />days before the due date, and when overdue (0 = off)</label>
            <p className="font-semibold pt-2">Payroll sanity check</p>
            <label className="flex items-center gap-2">Warn when more than<input type="number" min={0} max={100} disabled={!canEdit} value={s.zeroNetWarnPct} onChange={e => setS((x: any) => ({ ...x, zeroNetWarnPct: Number(e.target.value) }))} className={`${box} w-20`} />% of a month&apos;s payslips are ₹0</label>
            <label className="flex items-center gap-2">…or PF / ESIC / headcount moves more than<input type="number" min={0} max={100} disabled={!canEdit} value={s.swingWarnPct} onChange={e => setS((x: any) => ({ ...x, swingWarnPct: Number(e.target.value) }))} className={`${box} w-20`} />% from last month</label>
            {canEdit && <div className="flex justify-end"><button onClick={save} disabled={busy} className={btn}>{busy && <Loader2 size={14} className="animate-spin" />}Save</button></div>}
        </div>
    )
}

function Drafts({ list, canDelete, onDone }: { list: { year: number; month: number; drafts: number; net: number }[]; canDelete: boolean; onDone: () => void }) {
    const [sel, setSel] = useState<Set<string>>(new Set())
    const [typed, setTyped] = useState("")
    const [busy, setBusy] = useState(false)
    if (!list.length) return <p className="text-[13px] text-[var(--text3)] bg-white border border-[var(--border)] rounded-[12px] p-6 text-center">No old draft months — every month before the latest processed one has been processed.</p>
    async function del() {
        setBusy(true)
        try {
            const months = list.filter(m => sel.has(`${m.year}-${m.month}`)).map(m => ({ year: m.year, month: m.month }))
            const r = await fetch("/api/payroll/challans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deleteDrafts", months, confirm: typed }) })
            const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j?.error || "Could not delete")
            toast.success(`Deleted ${j.rows} draft payslip(s)`); setSel(new Set()); setTyped(""); onDone()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    return (
        <div className="space-y-3 max-w-2xl">
            <p className="text-[12.5px] text-[var(--text3)]">Months older than the latest processed month whose payroll was never processed — only draft payslips, never paid or filed. Deleting them removes only those drafts; processed and paid months are never touched. This cannot be undone.</p>
            <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-x-auto">
                <table className="w-full">
                    <thead><tr><th className={th}></th><th className={th}>Month</th><th className={th}>Draft payslips</th><th className={th}>Net in drafts</th></tr></thead>
                    <tbody>{list.map(m => { const k = `${m.year}-${m.month}`; return (
                        <tr key={k}><td className={td}>{canDelete && <input type="checkbox" aria-label={`Select ${MONTHS[m.month - 1]} ${m.year}`} checked={sel.has(k)} onChange={e => setSel(x => { const n = new Set(x); if (e.target.checked) n.add(k); else n.delete(k); return n })} />}</td><td className={`${td} font-semibold`}>{MONTHS[m.month - 1]} {m.year}</td><td className={td}>{m.drafts}</td><td className={td}>{inr(m.net)}</td></tr>
                    ) })}</tbody>
                </table>
            </div>
            {canDelete ? (sel.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-[13px]">Type <b>DELETE</b> to delete the drafts of {sel.size} month(s):<input value={typed} onChange={e => setTyped(e.target.value)} className={`${box} w-28`} /><button onClick={del} disabled={busy || typed !== "DELETE"} className="h-9 px-4 rounded-[9px] bg-red-600 text-white text-[13px] font-semibold disabled:opacity-50">Delete drafts</button></div>
            )) : <p className="text-[12px] text-[var(--text3)]">Deleting needs Admin or Unlock payroll.</p>}
        </div>
    )
}
