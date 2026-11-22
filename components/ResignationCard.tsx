"use client"

// My Profile → hand in a resignation (Exit settings → self resignation), or see
// where an exit already stands.
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

type Info = { enabled: boolean; defaultNoticeDays: number; exit: { status: string; resignationDate: string; lastWorkingDate: string | null; exitType: string } | null }
const STAGE: Record<string, string> = { INITIATED: "With HR for review", NOTICE_PERIOD: "Notice period", CLEARANCE_PENDING: "Clearance in progress", FULL_FINAL_PENDING: "Final settlement in progress", COMPLETED: "Completed", CANCELLED: "Withdrawn" }
const day = (s: string | null) => s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"

export function ResignationCard() {
    const [d, setD] = useState<Info | null>(null)
    const [open, setOpen] = useState(false)
    const [lwd, setLwd] = useState("")
    const [reason, setReason] = useState("")
    const [busy, setBusy] = useState(false)
    const load = () => fetch("/api/me/resignation").then(r => r.ok ? r.json() : null).then(j => { if (j) { setD(j); setLwd(new Date(Date.now() + j.defaultNoticeDays * 86_400_000).toISOString().slice(0, 10)) } }).catch(() => {})
    useEffect(() => { load() }, [])
    if (!d || (!d.enabled && !d.exit)) return null
    if (d.exit && d.exit.status !== "CANCELLED") return (
        <div className="rounded-[12px] border border-[var(--border)] bg-white p-4 text-[13px] mt-4">
            <p className="font-semibold">Your exit</p>
            <p className="text-[var(--text2)] mt-1">{STAGE[d.exit.status] ?? d.exit.status} · last working day <b>{day(d.exit.lastWorkingDate)}</b></p>
        </div>
    )
    async function submit() {
        if (!confirm(`Hand in your resignation with last working day ${lwd}? HR will review it.`)) return
        setBusy(true)
        try {
            const r = await fetch("/api/me/resignation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lastWorkingDate: lwd, reason }) })
            const j = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(j?.error || "Could not submit")
            toast.success("Resignation handed in — HR has been told"); setOpen(false); load()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    return (
        <div className="rounded-[12px] border border-[var(--border)] bg-white p-4 text-[13px] mt-4">
            {!open ? (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-[var(--text2)]">Leaving the company? Hand in your resignation here.</span>
                    <button onClick={() => setOpen(true)} className="h-9 px-4 rounded-[9px] border border-[var(--border)] text-[13px] font-semibold text-red-700">Resign</button>
                </div>
            ) : (
                <div className="space-y-2">
                    <p className="font-semibold">Resignation</p>
                    <label className="block text-[11px] font-semibold uppercase text-[var(--text3)]">Last working day (notice is {d.defaultNoticeDays} days)<input type="date" value={lwd} min={new Date().toISOString().slice(0, 10)} onChange={e => setLwd(e.target.value)} className="h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] w-full max-w-xs block" /></label>
                    <label className="block text-[11px] font-semibold uppercase text-[var(--text3)]">Reason (optional)<textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className="w-full rounded-[9px] border border-[var(--border)] px-2.5 py-1.5 text-[13px] block" /></label>
                    <div className="flex gap-2"><button onClick={() => setOpen(false)} className="h-9 px-4 rounded-[9px] border border-[var(--border)] text-[13px]">Cancel</button><button onClick={submit} disabled={busy || !lwd} className="h-9 px-4 rounded-[9px] bg-red-600 text-white text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">{busy && <Loader2 size={14} className="animate-spin" />}Hand in resignation</button></div>
                </div>
            )}
        </div>
    )
}
