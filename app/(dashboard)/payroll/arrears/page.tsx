"use client"

import { Fragment, useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, Check, History, Loader2, RefreshCw, Search, X, Scale } from "lucide-react"
import { can, canAny } from "@/lib/can"

// Payroll → Arrears: differences a back-dated salary revision makes to months
// already locked or paid. The original payslips are never changed — HR
// approves (or edits / rejects) each arrear, and approved ones are paid with
// the next payroll processed.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const inr = (n: number) => `${n < 0 ? "−" : ""}₹${Math.abs(Math.round(n)).toLocaleString("en-IN")}`
type Status = "PENDING" | "APPROVED" | "PAID" | "REJECTED"
type Row = {
    id: string; employeeId: string; forMonth: number; forYear: number; status: Status
    oldGross: number; newGross: number; oldNet: number; newNet: number; grossDiff: number; pfDiff: number; esicDiff: number; ptDiff: number; netDiff: number; amount: number
    note: string | null; paidMonth: number | null; paidYear: number | null; reviewedByName: string; reviewedAt: string | null
    detail: { old?: Record<string, number>; new?: Record<string, number>; days?: { month: number; worked: number }; alreadySettled?: number } | null
    employee: { code: string; name: string; designation: string; site: string } | null
}
const card = "rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm"
const input = "h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none"

export default function ArrearsPage() {
    const { data: session } = useSession()
    const router = useRouter()
    const canManage = can(session, "payroll.manage")
    const [status, setStatus] = useState<Status>("PENDING")
    const [q, setQ] = useState("")
    const [data, setData] = useState<{ counts: Record<string, { n: number; amount: number }>; rows: Row[]; error?: string } | null>(null)
    const [picked, setPicked] = useState<Set<string>>(new Set())
    const [busy, setBusy] = useState<string | null>(null)
    const [open, setOpen] = useState<string | null>(null)
    const [check, setCheck] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return { month: d.getMonth() + 1, year: d.getFullYear() } })
    const [histQ, setHistQ] = useState("")
    const [hist, setHist] = useState<any>(null)

    const load = useCallback(async () => {
        const r = await fetch(`/api/payroll/arrears?status=${status}&q=${encodeURIComponent(q)}`)
        const d = await r.json().catch(() => ({}))
        if (r.ok) { setData(d); setPicked(new Set()) } else toast.error(d?.error || "Could not load")
    }, [status, q])
    useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

    const post = async (body: any, label: string) => {
        setBusy(label)
        try {
            const r = await fetch("/api/payroll/arrears", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
            const d = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(d?.error || "Failed")
            return d
        } catch (e: any) { toast.error(e.message); return null } finally { setBusy(null) }
    }
    const decide = async (action: "approve" | "reject", ids: string[]) => {
        if (!ids.length) return
        if (action === "reject" && !confirm(`Reject ${ids.length} arrear(s)? They won't be paid.`)) return
        const d = await post({ action, ids }, action)
        if (d) { toast.success(`${d.updated} arrear(s) ${action === "approve" ? "approved — paid with the next payroll" : "rejected"}`); load() }
    }
    const setAmount = async (row: Row) => {
        const v = prompt(`Amount to pay for ${row.employee?.name ?? ""} — ${MONTHS[row.forMonth - 1]} ${row.forYear}\n(worked out: ${inr(row.netDiff)}; negative = recover)`, String(row.amount))
        if (v === null) return
        const d = await post({ action: "amount", id: row.id, amount: Number(v) }, "amount")
        if (d) { toast.success("Amount updated"); load() }
    }
    const recheck = async () => {
        const d = await post({ action: "recheck", month: check.month, year: check.year }, "recheck")
        if (d) { toast.success(d.checked ? `Checked ${d.checked} payslip(s) from ${MONTHS[check.month - 1]} ${check.year} on — ${d.pending} arrear(s) pending` : (d.note || "Nothing to check")); setStatus("PENDING"); load() }
    }
    const lookup = async () => {
        if (histQ.trim().length < 2) return
        setBusy("hist")
        try {
            const r = await fetch(`/api/payroll/salary-history?q=${encodeURIComponent(histQ.trim())}`)
            const d = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(d?.error || "Not found")
            setHist(d)
        } catch (e: any) { toast.error(e.message); setHist(null) } finally { setBusy(null) }
    }

    if (session && !canAny(session, ["payroll.view", "payroll.manage"])) return <div className="p-8 text-center text-sm text-[var(--text3)]">Access denied</div>

    const rows = data?.rows ?? []
    const allPicked = rows.length > 0 && rows.every(r => picked.has(r.id))
    const tabs: [Status, string][] = [["PENDING", "To review"], ["APPROVED", "Approved (to pay)"], ["PAID", "Paid"], ["REJECTED", "Rejected"]]
    return (
        <div className="flex flex-col gap-5 p-4 pb-12 lg:p-0">
            <div className="flex items-center gap-3">
                <button onClick={() => router.push("/payroll")} aria-label="Back to Payroll" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text2)]"><ArrowLeft size={16} /></button>
                <div>
                    <h1 className="m-0 text-2xl font-bold tracking-tight text-[var(--text)]">Salary Arrears</h1>
                    <p className="m-0 mt-0.5 text-[13px] text-[var(--text3)]">Back-dated salary changes for months already locked or paid. Original payslips stay as issued; approved arrears are paid with the next payroll.</p>
                </div>
            </div>
            {data?.error && <div className="rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-[13px] text-[#92400e]">{data.error}</div>}

            <div className="grid gap-3 sm:grid-cols-4">
                {tabs.map(([s, l]) => (
                    <button key={s} onClick={() => setStatus(s)} className={`${card} p-3 text-left ${status === s ? "ring-2 ring-[#0b5cff]" : ""}`}>
                        <div className="text-[12px] font-semibold text-[var(--text3)]">{l}</div>
                        <div className="mt-1 text-lg font-bold text-[var(--text)]">{data?.counts?.[s]?.n ?? 0}</div>
                        <div className="text-[11.5px] text-[var(--text3)]">{inr(data?.counts?.[s]?.amount ?? 0)}</div>
                    </button>
                ))}
            </div>

            <div className={card}>
                <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--surface2)] px-4 py-3">
                    <span className="relative min-w-[200px] flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" /><input className={`${input} w-full pl-8`} placeholder="Search employee…" value={q} onChange={e => setQ(e.target.value)} /></span>
                    {canManage && status === "PENDING" && (
                        <>
                            <button onClick={() => decide("approve", Array.from(picked))} disabled={!picked.size || !!busy} className="flex h-9 items-center gap-1.5 rounded-lg bg-[#16a34a] px-3 text-[13px] font-semibold text-white disabled:opacity-50"><Check size={14} /> Approve ({picked.size})</button>
                            <button onClick={() => decide("reject", Array.from(picked))} disabled={!picked.size || !!busy} className="flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-[13px] font-semibold text-[var(--text2)] disabled:opacity-50"><X size={14} /> Reject</button>
                        </>
                    )}
                    <button onClick={load} aria-label="Refresh" className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text2)]"><RefreshCw size={14} /></button>
                </div>
                {!data ? <div className="flex items-center justify-center gap-2 p-10 text-sm text-[var(--text3)]"><Loader2 size={16} className="animate-spin" /> Loading…</div>
                    : rows.length === 0 ? <p className="m-0 p-10 text-center text-sm text-[var(--text3)]">{status === "PENDING" ? "Nothing to review. Arrears appear here when a salary revision is back-dated into a locked or paid month." : "None."}</p>
                    : (
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-[12.5px]">
                                <thead className="bg-[var(--surface2)] text-left text-[var(--text2)]"><tr>
                                    {canManage && status === "PENDING" && <th className="w-10 px-3 py-2"><input type="checkbox" className="accent-[#0b5cff]" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map(r => r.id)))} aria-label="Tick all" /></th>}
                                    {["Employee", "For month", "Net then", "Net now", "PF / ESIC / PT change", "Arrear", status === "PAID" ? "Paid in" : status === "PENDING" ? "" : "Reviewed", ""].map((h, i) => <th key={i} className="whitespace-nowrap px-3 py-2 font-bold">{h}</th>)}
                                </tr></thead>
                                <tbody>
                                    {rows.map(r => (
                                        <Fragment key={r.id}>
                                            <tr className="border-t border-[var(--border)] align-top">
                                                {canManage && status === "PENDING" && <td className="px-3 py-2"><input type="checkbox" className="accent-[#0b5cff]" checked={picked.has(r.id)} onChange={() => setPicked(p => { const n = new Set(p); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n })} aria-label="Tick" /></td>}
                                                <td className="px-3 py-2"><span className="font-semibold text-[var(--text)]">{r.employee?.name ?? "—"}</span><span className="block text-[11px] text-[var(--text3)]">{r.employee?.code}{r.employee?.site ? ` · ${r.employee.site}` : ""}</span></td>
                                                <td className="whitespace-nowrap px-3 py-2 text-[var(--text2)]">{MONTHS[r.forMonth - 1]} {r.forYear}</td>
                                                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[var(--text2)]">{inr(r.oldNet)}</td>
                                                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[var(--text2)]">{inr(r.newNet)}</td>
                                                <td className="whitespace-nowrap px-3 py-2 text-[11.5px] text-[var(--text3)]">PF {inr(r.pfDiff)} · ESIC {inr(r.esicDiff)} · PT {inr(r.ptDiff)}</td>
                                                <td className="whitespace-nowrap px-3 py-2">
                                                    <b className={`tabular-nums ${r.amount < 0 ? "text-[#dc2626]" : "text-[var(--text)]"}`}>{inr(r.amount)}</b>
                                                    {Math.abs(r.amount - r.netDiff) >= 1 && <span className="block text-[10.5px] text-[var(--text3)]">worked out {inr(r.netDiff)}</span>}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-2 text-[11.5px] text-[var(--text3)]">{status === "PAID" ? (r.paidMonth ? `${MONTHS[r.paidMonth - 1]} ${r.paidYear}` : "") : status !== "PENDING" ? `${r.reviewedByName}${r.reviewedAt ? ` · ${new Date(r.reviewedAt).toLocaleDateString("en-IN")}` : ""}` : ""}</td>
                                                <td className="whitespace-nowrap px-3 py-2 text-right">
                                                    <button onClick={() => setOpen(open === r.id ? null : r.id)} className="text-[11.5px] font-semibold text-[#0b5cff]">{open === r.id ? "Hide" : "Details"}</button>
                                                    {canManage && (status === "PENDING" || status === "APPROVED") && <button onClick={() => setAmount(r)} className="ml-3 text-[11.5px] font-semibold text-[var(--text2)]">Edit amount</button>}
                                                    {canManage && status === "PENDING" && <button onClick={() => decide("approve", [r.id])} className="ml-3 text-[11.5px] font-semibold text-[#16a34a]">Approve</button>}
                                                </td>
                                            </tr>
                                            {open === r.id && (
                                                <tr className="bg-[var(--surface2)]">
                                                    <td colSpan={9} className="px-4 py-3 text-[12px] text-[var(--text2)]">
                                                        <div className="mb-1 font-semibold text-[var(--text)]">Salary structure used for {MONTHS[r.forMonth - 1]} {r.forYear}: then → now</div>
                                                        <div className="flex flex-wrap gap-x-5 gap-y-1">
                                                            {(["basic", "da", "hra", "washing", "conveyance", "lww", "bonus", "other"] as const).map(k => {
                                                                const a = r.detail?.old?.[k] ?? 0, b = r.detail?.new?.[k] ?? 0
                                                                return <span key={k} className={a !== b ? "font-semibold text-[var(--text)]" : ""}>{k.toUpperCase()}: {inr(a)} → {inr(b)}</span>
                                                            })}
                                                        </div>
                                                        <div className="mt-1 text-[11.5px] text-[var(--text3)]">Same attendance as the issued payslip ({r.detail?.days?.worked ?? "?"} of {r.detail?.days?.month ?? "?"} days) and that month&apos;s PF / ESIC / PT rules. Gross {inr(r.oldGross)} → {inr(r.newGross)}.{r.detail?.alreadySettled ? ` Already settled for this month: ${inr(r.detail.alreadySettled)}.` : ""}{r.note ? ` Note: ${r.note}` : ""}</div>
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                {canManage && (
                    <div className={`${card} p-4`}>
                        <div className="mb-1 flex items-center gap-2 text-sm font-bold text-[var(--text)]"><Scale size={15} /> Check for arrears</div>
                        <p className="m-0 mb-3 text-[12px] text-[var(--text3)]">New back-dated revisions are checked automatically. Use this for revisions saved before arrears existed: every locked / paid payslip from the chosen month on is compared with the salary now in force for it.</p>
                        <div className="flex flex-wrap items-center gap-2">
                            <select className={input} value={check.month} onChange={e => setCheck(c => ({ ...c, month: Number(e.target.value) }))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
                            <input className={`${input} w-24`} type="number" value={check.year} onChange={e => setCheck(c => ({ ...c, year: Number(e.target.value) }))} />
                            <button onClick={recheck} disabled={busy === "recheck"} className="flex h-9 items-center gap-1.5 rounded-lg bg-[#0b5cff] px-3 text-[13px] font-semibold text-white disabled:opacity-50">{busy === "recheck" ? <Loader2 size={14} className="animate-spin" /> : <Scale size={14} />} Check from this month</button>
                        </div>
                    </div>
                )}
                <div className={`${card} p-4`}>
                    <div className="mb-1 flex items-center gap-2 text-sm font-bold text-[var(--text)]"><History size={15} /> Salary history</div>
                    <p className="m-0 mb-3 text-[12px] text-[var(--text3)]">Every revision with the month it applies from, every change with before / after and who made it.</p>
                    <div className="flex gap-2">
                        <input className={`${input} flex-1`} placeholder="Employee code or name" value={histQ} onChange={e => setHistQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") lookup() }} />
                        <button onClick={lookup} disabled={busy === "hist"} className="flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-[13px] font-semibold text-[var(--text2)] disabled:opacity-50">{busy === "hist" ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Show</button>
                    </div>
                </div>
            </div>

            {hist && (
                <div className={card}>
                    <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface2)] px-4 py-2.5 text-sm font-bold text-[var(--text)]">
                        <span>{hist.employee.name} · {hist.employee.code}{hist.employee.designation ? ` · ${hist.employee.designation}` : ""}</span>
                        <button onClick={() => setHist(null)} aria-label="Close" className="text-[var(--text3)]"><X size={15} /></button>
                    </div>
                    <div className="grid gap-4 p-4 lg:grid-cols-2">
                        <div>
                            <div className="mb-1.5 text-[12.5px] font-bold text-[var(--text)]">Revisions (effective from)</div>
                            {hist.revisions.length === 0 ? <p className="m-0 text-[12px] text-[var(--text3)]">No dated revisions — the current structure applies.</p> : (
                                <table className="w-full border-collapse text-[12px]">
                                    <thead className="text-left text-[var(--text3)]"><tr>{["From", "Basic", "DA", "Gross*", "Saved by"].map(h => <th key={h} className="px-2 py-1 font-semibold">{h}</th>)}</tr></thead>
                                    <tbody>{hist.revisions.map((r: any) => (
                                        <tr key={r.id} className="border-t border-[var(--border)]">
                                            <td className="px-2 py-1 font-semibold text-[var(--text)]">{MONTHS[r.effectiveMonth - 1]} {r.effectiveYear}</td>
                                            <td className="px-2 py-1 tabular-nums">{inr(r.basic)}</td><td className="px-2 py-1 tabular-nums">{inr(r.da)}</td>
                                            <td className="px-2 py-1 tabular-nums">{inr(r.basic + r.da + r.hra + r.washing + r.conveyance + r.leaveWithWages + r.otherAllowance)}</td>
                                            <td className="px-2 py-1 text-[var(--text3)]">{r.by || "—"} · {new Date(r.updatedAt).toLocaleDateString("en-IN")}</td>
                                        </tr>
                                    ))}</tbody>
                                </table>
                            )}
                            <p className="m-0 mt-1 text-[10.5px] text-[var(--text3)]">*Basic + DA + HRA + washing + conveyance + LWW + other.</p>
                        </div>
                        <div>
                            <div className="mb-1.5 text-[12.5px] font-bold text-[var(--text)]">Changes</div>
                            {hist.logs.length === 0 ? <p className="m-0 text-[12px] text-[var(--text3)]">No changes recorded yet (recorded from now on).</p> : (
                                <div className="flex flex-col gap-1.5">{hist.logs.map((l: any) => (
                                    <div key={l.id} className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11.5px] text-[var(--text2)]">
                                        <b className="text-[var(--text)]">{l.action === "CREATE" ? "Added" : "Changed"}</b> {MONTHS[l.effectiveMonth - 1]} {l.effectiveYear} · {l.source.replace("-", " ")} · {l.by || "—"} · {new Date(l.changedAt).toLocaleString("en-IN")}
                                        <div className="text-[var(--text3)]">Basic {l.before ? inr(l.before.basic ?? 0) + " → " : ""}{inr(l.after.basic ?? 0)} · DA {l.before ? inr(l.before.da ?? 0) + " → " : ""}{inr(l.after.da ?? 0)}</div>
                                    </div>
                                ))}</div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
