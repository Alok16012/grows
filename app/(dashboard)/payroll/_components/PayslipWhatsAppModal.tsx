"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, MessageCircle, X, AlertTriangle } from "lucide-react"

// Send salary slips on WhatsApp for a month — one site or all sites. Counts
// first (ready / already sent / no mobile / not locked), then sends in small
// batches with progress. Only locked months go out.

type Summary = {
    connected: boolean; template: string | null
    total: number; draft: number; noPhone: number; alreadySent: number; failed: number
    ready: string[]; sendable: string[]
}
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const BATCH = 5

export default function PayslipWhatsAppModal({ month, year, siteId, siteName, onClose }: { month: number; year: number; siteId: string; siteName: string; onClose: () => void }) {
    const [scope, setScope] = useState<"site" | "all">(siteId ? "site" : "all")
    const [sum, setSum] = useState<Summary | null>(null)
    const [loading, setLoading] = useState(true)
    const [progress, setProgress] = useState<{ done: number; total: number; ok: number; failed: number; firstError?: string } | null>(null)

    useEffect(() => {
        let off = false
        setLoading(true); setSum(null)
        const qs = new URLSearchParams({ month: String(month), year: String(year) })
        if (scope === "site" && siteId) qs.set("siteId", siteId)
        fetch(`/api/payroll/payslips/whatsapp?${qs}`)
            .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d?.error || "Could not load"); return d })
            .then(d => { if (!off) setSum(d) })
            .catch(e => { if (!off) toast.error(e.message) })
            .finally(() => { if (!off) setLoading(false) })
        return () => { off = true }
    }, [month, year, scope, siteId])

    const send = async (ids: string[], resend: boolean) => {
        if (!ids.length) return
        if (!confirm(`Send ${ids.length} salary slip${ids.length === 1 ? "" : "s"} for ${MONTHS[month - 1]} ${year} on WhatsApp?${resend ? "\n\nPeople who already got it will get it again." : ""}`)) return
        const st = { done: 0, total: ids.length, ok: 0, failed: 0, firstError: undefined as string | undefined }
        setProgress({ ...st })
        for (let i = 0; i < ids.length; i += BATCH) {
            try {
                const r = await fetch("/api/payroll/payslips/whatsapp", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ month, year, payrollIds: ids.slice(i, i + BATCH), resend }),
                })
                const d = await r.json().catch(() => ({}))
                if (!r.ok) { st.failed += Math.min(BATCH, ids.length - i); st.firstError ??= d?.error || "Failed"; if (r.status === 409) break }
                else for (const x of d.results ?? []) { if (x.ok && !x.skipped) st.ok++; else if (!x.ok && !x.skipped) { st.failed++; st.firstError ??= x.error } }
            } catch { st.failed += Math.min(BATCH, ids.length - i); st.firstError ??= "Network error" }
            st.done = Math.min(i + BATCH, ids.length)
            setProgress({ ...st })
        }
        if (st.failed) toast.warning(`${st.ok} sent, ${st.failed} failed${st.firstError ? ` — ${st.firstError}` : ""}`, { duration: 9000 })
        else toast.success(`${st.ok} salary slip${st.ok === 1 ? "" : "s"} sent on WhatsApp`)
    }

    const busy = !!progress && progress.done < progress.total
    const stat = (label: string, value: number, tone: string) => (
        <div className="rounded-lg border border-[var(--border)] px-3 py-2">
            <div className="text-[11px] font-semibold text-[var(--text3)]">{label}</div>
            <div className={`text-lg font-bold ${tone}`}>{value}</div>
        </div>
    )

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && onClose()}>
            <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-[var(--text)]"><MessageCircle size={16} className="text-[#16a34a]" /> Send slips on WhatsApp</div>
                    <button onClick={onClose} disabled={busy} aria-label="Close" className="text-[var(--text3)] disabled:opacity-40"><X size={16} /></button>
                </div>
                <div className="flex flex-col gap-3 p-4">
                    <div className="text-[13px] text-[var(--text2)]"><b className="text-[var(--text)]">{MONTHS[month - 1]} {year}</b></div>
                    {siteId && (
                        <div className="flex rounded-lg border border-[var(--border)] p-0.5 text-xs font-semibold">
                            {([["site", siteName || "This site"], ["all", "All sites"]] as const).map(([v, l]) => (
                                <button key={v} disabled={busy} onClick={() => setScope(v)} className={`flex-1 rounded-md px-3 py-1.5 ${scope === v ? "bg-[#16a34a] text-white" : "text-[var(--text2)]"}`}>{l}</button>
                            ))}
                        </div>
                    )}

                    {loading || !sum ? (
                        <div className="flex items-center justify-center gap-2 py-6 text-sm text-[var(--text3)]"><Loader2 size={15} className="animate-spin" /> Checking…</div>
                    ) : (
                        <>
                            {(!sum.connected || !sum.template) && (
                                <div className="flex gap-2 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-[12px] text-[#92400e]">
                                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                                    <span>{!sum.connected ? "WhatsApp isn't connected yet." : "No salary slip template is switched on."} Set it up in <b>Settings → WhatsApp</b>.</span>
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                                {stat("Ready to send", sum.ready.length, "text-[#16a34a]")}
                                {stat("Already sent", sum.alreadySent, "text-[var(--text)]")}
                                {stat("No valid mobile", sum.noPhone, sum.noPhone ? "text-[#b45309]" : "text-[var(--text)]")}
                                {stat("Not locked (skipped)", sum.draft, sum.draft ? "text-[#b45309]" : "text-[var(--text)]")}
                            </div>
                            {sum.template && <p className="m-0 text-[11.5px] text-[var(--text3)]">Template: {sum.template} · each person gets their own slip as a PDF on their registered mobile.</p>}
                            {progress && (
                                <div>
                                    <div className="mb-1 flex justify-between text-[12px] text-[var(--text2)]"><span>{progress.done < progress.total ? "Sending…" : "Done"}</span><span>{progress.ok} sent · {progress.failed} failed · {progress.done}/{progress.total}</span></div>
                                    <div className="h-2 overflow-hidden rounded-full bg-[var(--surface2)]"><div className="h-full bg-[#16a34a] transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
                                    {progress.firstError && <p className="m-0 mt-1 text-[11.5px] text-[#dc2626]">{progress.firstError}</p>}
                                </div>
                            )}
                            <div className="flex flex-wrap justify-end gap-2 pt-1">
                                {sum.alreadySent > 0 && (
                                    <button disabled={busy || !sum.connected || !sum.template || !sum.sendable.length} onClick={() => send(sum.sendable, true)}
                                        className="h-9 rounded-lg border border-[var(--border)] px-3 text-[13px] font-semibold text-[var(--text2)] disabled:opacity-50">
                                        Resend to all ({sum.sendable.length})
                                    </button>
                                )}
                                <button disabled={busy || !sum.connected || !sum.template || !sum.ready.length} onClick={() => send(sum.ready, false)}
                                    className="flex h-9 items-center gap-2 rounded-lg bg-[#16a34a] px-4 text-[13px] font-semibold text-white disabled:opacity-50">
                                    {busy ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />} Send to {sum.ready.length}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
