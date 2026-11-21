"use client"

// Calculation Settings → versions + change control.
// Every save of the settings is a version that applies from a month; months
// before it keep the version that was in force. Change control decides which
// months a salary / compliance change may start from (and who may back-date).
import { useState } from "react"
import { toast } from "sonner"
import { Trash2 } from "lucide-react"

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
type V = { fromYear: number; fromMonth: number; savedBy: string | null; savedAt: string; note?: string | null }
type W = { open: { month: number; year: number }; allowed: { month: number; year: number }[]; control: { allowedMonths: "openOrNext" | "nextOnly"; backdating: "never" | "adminWithReason" } }

export default function ChangeControlPanel({ versions, window, viewing, onView, onChanged, isAdmin }: {
    versions: V[]; window: W | null; viewing: { month: number; year: number } | null
    onView: (p: { month: number; year: number } | null) => void; onChanged: () => void; isAdmin: boolean
}) {
    const [busy, setBusy] = useState(false)
    const openKey = window ? window.open.year * 12 + window.open.month : 0
    const k = (v: { fromYear: number; fromMonth: number }) => v.fromYear * 12 + v.fromMonth
    const inForce = versions.filter(v => k(v) <= openKey).pop() ?? null

    async function remove(v: V) {
        if (!confirm(`Remove the settings version starting ${MONTHS[v.fromMonth]} ${v.fromYear}? The version before it will apply instead.`)) return
        setBusy(true)
        try {
            const r = await fetch(`/api/payroll/rules?month=${v.fromMonth}&year=${v.fromYear}`, { method: "DELETE" })
            const d = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(d?.error || "Could not remove")
            toast.success("Version removed"); onChanged()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    async function saveControl(patch: Partial<W["control"]>) {
        if (!window) return
        setBusy(true)
        try {
            const r = await fetch("/api/payroll/rules", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changeControl: { ...window.control, ...patch } }) })
            const d = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(d?.error || "Could not save")
            toast.success("Change control saved"); onChanged()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }

    const card = "rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-4"
    const sel = "h-9 rounded-[8px] border border-[var(--border)] bg-white px-2.5 text-[13px]"
    return (
        <div className="grid gap-3 lg:grid-cols-2">
            <div className={card}>
                <p className="text-[14px] font-semibold text-[var(--text)]">Settings versions</p>
                <p className="text-[12px] text-[var(--text3)] mb-2">Each save applies from a month. Earlier months keep the version that was in force — re-processing them never picks up a later change.</p>
                <div className="space-y-1.5 text-[12.5px]">
                    <button onClick={() => onView(null)} className={`w-full flex items-center justify-between rounded-[8px] border px-3 py-2 text-left ${!viewing ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-[var(--border)]"}`}>
                        <span>Before {versions[0] ? `${MONTHS[versions[0].fromMonth]} ${versions[0].fromYear}` : "any dated version"} <span className="text-[var(--text3)]">(starting settings)</span></span>
                    </button>
                    {versions.map(v => {
                        const isViewing = viewing && viewing.month === v.fromMonth && viewing.year === v.fromYear
                        const future = k(v) >= openKey
                        return (
                            <div key={`${v.fromYear}-${v.fromMonth}`} className={`flex items-center gap-2 rounded-[8px] border px-3 py-2 ${isViewing ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-[var(--border)]"}`}>
                                <button onClick={() => onView({ month: v.fromMonth, year: v.fromYear })} className="flex-1 text-left">
                                    From <b>{MONTHS[v.fromMonth]} {v.fromYear}</b>
                                    {inForce && k(inForce) === k(v) && <span className="ml-2 rounded-full bg-[#dcfce7] px-2 py-0.5 text-[10.5px] font-semibold text-[#15803d]">in force for the open month</span>}
                                    {k(v) > openKey && <span className="ml-2 rounded-full bg-[#dbeafe] px-2 py-0.5 text-[10.5px] font-semibold text-[#1d4ed8]">upcoming</span>}
                                    <span className="block text-[11px] text-[var(--text3)]">saved {new Date(v.savedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}{v.note ? ` · ${v.note}` : ""}</span>
                                </button>
                                {future && <button disabled={busy} onClick={() => remove(v)} title="Remove (not used by any payroll yet)" className="p-1 text-[var(--text3)] hover:text-[#dc2626]"><Trash2 size={14} /></button>}
                            </div>
                        )
                    })}
                </div>
                <p className="text-[11px] text-[var(--text3)] mt-2">Click a version to view it. Editing and saving always creates or updates the version for the month you pick next to Save.</p>
            </div>
            <div className={card}>
                <p className="text-[14px] font-semibold text-[var(--text)]">Change control</p>
                <p className="text-[12px] text-[var(--text3)] mb-3">Applies to every salary and compliance change: these settings, salary uploads and edits, increments and PF / pension / ESIC switches.</p>
                {window && (<>
                    <p className="text-[12.5px] text-[var(--text2)] mb-3">Open payroll month: <b>{MONTHS[window.open.month]} {window.open.year}</b> (the month after the latest fully locked month). Changes can start from: <b>{window.allowed.map(a => `${MONTHS[a.month]} ${a.year}`).join(" or ")}</b>.</p>
                    <label className="flex items-center justify-between gap-3 py-2 text-[13px]">
                        <span>Changes may start from</span>
                        <select className={sel} disabled={!isAdmin || busy} value={window.control.allowedMonths} onChange={e => saveControl({ allowedMonths: e.target.value as W["control"]["allowedMonths"] })}>
                            <option value="openOrNext">Open payroll month or the next</option>
                            <option value="nextOnly">Next month only</option>
                        </select>
                    </label>
                    <label className="flex items-center justify-between gap-3 py-2 text-[13px]">
                        <span>Back-dating to an earlier month</span>
                        <select className={sel} disabled={!isAdmin || busy} value={window.control.backdating} onChange={e => saveControl({ backdating: e.target.value as W["control"]["backdating"] })}>
                            <option value="never">Never</option>
                            <option value="adminWithReason">Admins only, with a reason</option>
                        </select>
                    </label>
                    {!isAdmin && <p className="text-[11px] text-[var(--text3)] mt-1">Only an admin can change these.</p>}
                </>)}
            </div>
        </div>
    )
}
