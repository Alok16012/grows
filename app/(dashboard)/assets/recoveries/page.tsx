"use client"

// Assets → Recoveries. Charges to employees for lost / damaged / not-returned
// items, and leavers still holding assets. A charge is deducted from a salary
// (open payroll month or next), recovered in the F&F, recorded as paid in cash,
// or waived. Values follow Assets → Settings → Recovery.
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Loader2 } from "lucide-react"

type YM = { month: number; year: number }
type Rec = {
    id: string; recoveryNo: string; employee: string; employeeCode: string; employeeStatus: string | null; asset: string; assetCode: string
    quantity: number; amount: number; reason: string; status: string; via: string | null; payrollMonth: number | null; payrollYear: number | null
    note: string | null; createdAt: string
}
type Leaver = { issueId: string; issueNo: string; employee: string; code: string; exitStatus: string; lastWorkingDate: string | null; asset: string; assetCode: string; outstanding: number; issuedAt: string; charged: boolean }

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const ym = (p: YM) => `${MONTHS[p.month - 1]} ${p.year}`
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN")
const th = "text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)] border-b border-[var(--border)] bg-[var(--surface2)]"
const td = "px-3 py-2 border-b border-[var(--border)] text-[12.5px] align-top"
const small = "h-7 px-2.5 rounded-[7px] border border-[var(--border)] bg-white text-[11.5px] font-semibold text-[var(--text2)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40"
const REASON: Record<string, string> = { LOST: "Lost", DAMAGED: "Damaged", NOT_RETURNED: "Not returned" }

async function api<T = any>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const r = await fetch(url, { method: init?.method ?? "GET", headers: init?.body ? { "Content-Type": "application/json" } : undefined, body: init?.body ? JSON.stringify(init.body) : undefined })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d?.error || "Something went wrong")
    return d as T
}

function statusText(r: Rec) {
    if (r.status === "PENDING") return { t: "To decide", c: "bg-amber-50 text-amber-700" }
    if (r.status === "SCHEDULED" && r.via === "PAYROLL") return { t: `From ${ym({ month: r.payrollMonth!, year: r.payrollYear! })} salary`, c: "bg-blue-50 text-blue-700" }
    if (r.status === "SCHEDULED" && r.via === "FNF") return { t: "In F&F", c: "bg-violet-50 text-violet-700" }
    if (r.status === "RECOVERED") return { t: r.via === "CASH" ? "Paid in cash" : "Recovered", c: "bg-green-50 text-green-700" }
    if (r.status === "WAIVED") return { t: "Waived", c: "bg-gray-100 text-gray-600" }
    return { t: r.status, c: "bg-gray-100" }
}

export default function RecoveriesPage() {
    const [tab, setTab] = useState<"charges" | "leavers">("charges")
    const [data, setData] = useState<{ recoveries: Rec[]; leavers: Leaver[]; allowed: YM[] } | null>(null)
    const [filter, setFilter] = useState("OPEN")
    const [busy, setBusy] = useState<string | null>(null)
    const [picked, setPicked] = useState<Set<string>>(new Set())
    const load = useCallback(() => { api("/api/assets/recoveries").then(setData).catch(e => { toast.error(e.message); setData({ recoveries: [], leavers: [], allowed: [] }) }) }, [])
    useEffect(() => { load() }, [load])

    async function act(r: Rec, body: any, ok: string) {
        setBusy(r.id)
        try { await api(`/api/assets/recoveries/${r.id}`, { method: "PUT", body }); toast.success(ok); load() }
        catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
    }
    async function chargeLeavers() {
        const ids = Array.from(picked)
        if (!ids.length || !confirm(`Charge ${ids.length} unreturned item(s) to be recovered in the F&F?`)) return
        setBusy("leavers")
        try { const r = await api<{ created: number }>("/api/assets/recoveries", { method: "POST", body: { issueIds: ids, reason: "NOT_RETURNED", fnf: true } }); toast.success(`${r.created} charge(s) added to the F&F`); setPicked(new Set()); load() }
        catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
    }

    const rows = useMemo(() => (data?.recoveries ?? []).filter(r => filter === "ALL" ? true : filter === "OPEN" ? r.status === "PENDING" || r.status === "SCHEDULED" : r.status === filter), [data, filter])
    const open = (data?.recoveries ?? []).filter(r => r.status === "PENDING" || r.status === "SCHEDULED")
    const leavers = (data?.leavers ?? []).filter(l => !l.charged)

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
            <div>
                <Link href="/assets" className="inline-flex items-center gap-1 text-[12.5px] text-[var(--text3)] hover:text-[var(--text)]"><ArrowLeft className="h-3.5 w-3.5" /> Assets</Link>
                <h1 className="text-[22px] font-bold text-[var(--text)] mt-1">Recoveries &amp; exit clearance</h1>
                <p className="text-[12.5px] text-[var(--text3)]">Charges for lost, damaged or not-returned items. {open.length} open · {inr(open.reduce((s, r) => s + r.amount, 0))}</p>
            </div>
            <div className="flex gap-1 border-b border-[var(--border)]">
                {([["charges", "Charges"], ["leavers", `Leavers holding assets (${leavers.length})`]] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px ${tab === k ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text3)]"}`}>{l}</button>
                ))}
            </div>

            {tab === "charges" && (
                <>
                    <div className="flex flex-wrap gap-1.5">
                        {([["OPEN", "Open"], ["PENDING", "To decide"], ["SCHEDULED", "Scheduled"], ["RECOVERED", "Recovered"], ["WAIVED", "Waived"], ["ALL", "All"]] as const).map(([k, l]) => (
                            <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1 rounded-full text-[12px] font-medium ${filter === k ? "bg-[var(--accent)] text-white" : "bg-[var(--surface2)] text-[var(--text2)]"}`}>{l}</button>
                        ))}
                    </div>
                    <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-x-auto">
                        <table className="w-full min-w-[900px]">
                            <thead><tr><th className={th}>Charge</th><th className={th}>Employee</th><th className={th}>Item</th><th className={`${th} !text-right`}>Amount</th><th className={th}>Status</th><th className={`${th} !text-right`}>Actions</th></tr></thead>
                            <tbody>
                                {!data && <tr><td className={td} colSpan={6}><Loader2 size={14} className="inline animate-spin" /> Loading…</td></tr>}
                                {data && !rows.length && <tr><td className={`${td} text-center text-[var(--text3)] py-8`} colSpan={6}>Nothing here. Marking an issued item Lost / Damaged creates a charge (Assets → Settings), and leavers&apos; unreturned items can be charged from the next tab.</td></tr>}
                                {rows.map(r => {
                                    const st = statusText(r), isOpen = r.status === "PENDING" || r.status === "SCHEDULED", b = busy === r.id
                                    return (
                                        <tr key={r.id}>
                                            <td className={td}><span className="font-mono font-semibold">{r.recoveryNo}</span><span className="block text-[11px] text-[var(--text3)]">{REASON[r.reason] ?? r.reason} · {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span></td>
                                            <td className={td}><b>{r.employee}</b><span className="block text-[11px] text-[var(--text3)]">{r.employeeCode}{r.employeeStatus && r.employeeStatus !== "ACTIVE" ? ` · ${r.employeeStatus.toLowerCase()}` : ""}</span></td>
                                            <td className={td}>{r.asset}{r.quantity > 1 ? ` × ${r.quantity}` : ""}<span className="block text-[11px] font-mono text-[var(--accent)]">{r.assetCode}</span>{r.note && <span className="block text-[11px] text-[var(--text3)] whitespace-pre-line">{r.note}</span>}</td>
                                            <td className={`${td} text-right font-semibold tabular-nums`}>{inr(r.amount)}</td>
                                            <td className={td}><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${st.c}`}>{st.t}</span></td>
                                            <td className={`${td} text-right`}>
                                                {isOpen && (
                                                    <div className="inline-flex flex-wrap justify-end gap-1">
                                                        {r.status === "PENDING" && (data?.allowed ?? []).map(p => (
                                                            <button key={`${p.year}-${p.month}`} className={small} disabled={b} onClick={() => act(r, { action: "SCHEDULE_PAYROLL", month: p.month, year: p.year }, `Will be deducted from ${ym(p)} salary`)}>{ym(p)} salary</button>
                                                        ))}
                                                        {r.status === "PENDING" && <button className={small} disabled={b} onClick={() => act(r, { action: "FNF" }, "Added to the F&F")}>F&amp;F</button>}
                                                        {r.status === "SCHEDULED" && <button className={small} disabled={b} onClick={() => act(r, { action: "UNSCHEDULE" }, "Back to decide")}>Undo</button>}
                                                        <button className={small} disabled={b} onClick={() => { const n = prompt("Paid in cash — reference (optional)") ?? null; if (n !== null) act(r, { action: "CASH", note: n }, "Recorded as paid in cash") }}>Cash</button>
                                                        <button className={small} disabled={b} onClick={() => { const v = prompt(`New amount for ${r.recoveryNo} (₹)`, String(r.amount)); if (v !== null && v.trim() !== "") act(r, { action: "AMOUNT", amount: Number(v) }, "Amount changed") }}>Amount</button>
                                                        <button className={`${small} !text-red-600`} disabled={b} onClick={() => { const n = prompt(`Why waive ${r.recoveryNo}?`); if (n) act(r, { action: "WAIVE", note: n }, "Waived") }}>Waive</button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                    <p className="text-[11.5px] text-[var(--text3)]">Salary: added to that month&apos;s Other deductions (draft payroll updates at once). F&amp;F: shows as “Asset recoveries” in the employee&apos;s full &amp; final.</p>
                </>
            )}

            {tab === "leavers" && (
                <>
                    <p className="text-[12.5px] text-[var(--text3)]">Employees with an open exit, or resigned, who still hold issued items. Return them under Assets → Issued, or charge them to the F&amp;F here.</p>
                    {picked.size > 0 && (
                        <div className="flex items-center gap-3 rounded-[12px] border-2 border-[var(--accent)] bg-[var(--accent)]/5 p-3">
                            <span className="text-[13px] font-semibold">{picked.size} item(s) ticked</span>
                            <button disabled={busy === "leavers"} onClick={chargeLeavers} className="h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50">Charge in F&amp;F</button>
                        </div>
                    )}
                    <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-x-auto">
                        <table className="w-full min-w-[760px]">
                            <thead><tr><th className={`${th} w-8`}><input type="checkbox" aria-label="Tick all" checked={leavers.length > 0 && leavers.every(l => picked.has(l.issueId))} onChange={() => setPicked(leavers.every(l => picked.has(l.issueId)) ? new Set() : new Set(leavers.map(l => l.issueId)))} /></th><th className={th}>Employee</th><th className={th}>Exit</th><th className={th}>Item</th><th className={th}>Issued</th></tr></thead>
                            <tbody>
                                {!data && <tr><td className={td} colSpan={5}><Loader2 size={14} className="inline animate-spin" /> Loading…</td></tr>}
                                {data && !leavers.length && <tr><td className={`${td} text-center text-[var(--text3)] py-8`} colSpan={5}>No leaver is holding an uncharged item.</td></tr>}
                                {leavers.map(l => (
                                    <tr key={l.issueId}>
                                        <td className={td}><input type="checkbox" aria-label={`Tick ${l.issueNo}`} checked={picked.has(l.issueId)} onChange={() => setPicked(p => { const n = new Set(p); n.has(l.issueId) ? n.delete(l.issueId) : n.add(l.issueId); return n })} /></td>
                                        <td className={td}><b>{l.employee}</b><span className="block text-[11px] text-[var(--text3)]">{l.code}</span></td>
                                        <td className={td}>{l.exitStatus.replace(/_/g, " ").toLowerCase()}{l.lastWorkingDate && <span className="block text-[11px] text-[var(--text3)]">LWD {l.lastWorkingDate}</span>}</td>
                                        <td className={td}>{l.asset}{l.outstanding > 1 ? ` × ${l.outstanding}` : ""}<span className="block text-[11px] font-mono text-[var(--accent)]">{l.assetCode} · {l.issueNo}</span></td>
                                        <td className={td}>{l.issuedAt}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    )
}
