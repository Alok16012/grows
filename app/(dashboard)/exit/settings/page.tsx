"use client"

// Exit → Settings: leaving only through an exit, self resignation, notice,
// the clearance checklist (automatic items tick themselves), F&F approval,
// letters after payment — and exit records for past leavers.
import { useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react"
import { EXIT_AUTO, type ExitAuto, type ExitSettings } from "@/lib/exit-settings"

const box = "h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white"
const btn = "h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
const btn2 = "h-9 px-3 rounded-[9px] border border-[var(--border)] bg-white text-[12.5px] font-semibold text-[var(--text2)] inline-flex items-center gap-1.5 disabled:opacity-50"
const card = "bg-white border border-[var(--border)] rounded-[12px] p-4 space-y-2"

export default function ExitSettingsPage() {
    const [s, setS] = useState<ExitSettings | null>(null)
    const [types, setTypes] = useState<{ id: string; name: string }[]>([])
    const [canEdit, setCanEdit] = useState(false)
    const [busy, setBusy] = useState(false)
    const [days, setDays] = useState("90")
    const [preview, setPreview] = useState<{ count: number; sample?: { code: string; name: string; left: string | null; status: string }[] } | null>(null)
    useEffect(() => { fetch("/api/exit/flow").then(r => r.json()).then(j => { setS(j.settings); setTypes(j.types ?? []); setCanEdit(!!j.canEdit) }).catch(() => toast.error("Couldn't load")) }, [])
    if (!s) return <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--text3)]" /></div>
    const set = (p: Partial<ExitSettings>) => setS(x => x && ({ ...x, ...p }))
    const setTask = (id: string, p: any) => set({ clearance: s.clearance.map(c => c.id === id ? { ...c, ...p } : c) })
    async function save() {
        setBusy(true)
        try { const r = await fetch("/api/exit/flow", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) }); if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "Could not save"); toast.success("Exit settings saved") }
        catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    async function backfill(apply: boolean) {
        if (apply && !confirm(`Create exit records for ${preview?.count ?? "the"} past leaver(s)? Nothing is paid; HR then checks clearance and F&F for each.`)) return
        setBusy(true)
        try {
            const r = await fetch("/api/exit/flow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "backfill", days: Number(days), apply }) })
            const j = await r.json(); if (!r.ok) throw new Error(j?.error || "Failed")
            if (apply) { toast.success(`${j.count} exit record(s) created — see Exit`); setPreview(null) } else setPreview(j)
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    return (
        <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-4">
            <div>
                <Link href="/exit" className="inline-flex items-center gap-1 text-[12.5px] text-[var(--text3)] hover:text-[var(--text)]"><ArrowLeft className="h-3.5 w-3.5" /> Exit</Link>
                <h1 className="text-[22px] font-bold text-[var(--text)] mt-1">Exit settings</h1>
            </div>
            <div className={card}>
                <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" disabled={!canEdit} checked={s.mustUseExit} onChange={e => set({ mustUseExit: e.target.checked })} /> Leaving only through an exit — a bare status change to Resigned / Terminated is refused</label>
                <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" disabled={!canEdit} checked={s.selfResign} onChange={e => set({ selfResign: e.target.checked })} /> Employees can hand in their resignation from My Profile</label>
                <label className="flex items-center gap-2 text-[13px]">Notice period when none is given<input type="number" min={0} disabled={!canEdit} value={s.defaultNoticeDays} onChange={e => set({ defaultNoticeDays: Number(e.target.value) })} className={`${box} w-20`} /> days</label>
                <p className="text-[12px] text-[var(--text3)]">The person is marked as left (status, site posting ended, login closed) on their last working day — at once when that day has already passed, otherwise by the daily job. Clearance and F&F carry on after that.</p>
            </div>
            <div className={card}>
                <p className="text-[13px] font-semibold">Clearance checklist (new exits)</p>
                <p className="text-[12px] text-[var(--text3)]">Automatic items tick themselves from the real data; the rest are ticked by their owner in the exit. When everything is done the exit moves to F&F.</p>
                {s.clearance.map(c => (
                    <div key={c.id} className="grid sm:grid-cols-[1fr_130px_240px_auto] gap-2 items-center">
                        <input disabled={!canEdit} value={c.title} onChange={e => setTask(c.id, { title: e.target.value })} className={box} aria-label="Task" />
                        <input disabled={!canEdit} value={c.owner} onChange={e => setTask(c.id, { owner: e.target.value })} className={box} aria-label="Owner" placeholder="Owner" />
                        <select disabled={!canEdit} value={c.auto ?? ""} onChange={e => setTask(c.id, { auto: (e.target.value || null) as ExitAuto | null })} className={box} aria-label="Ticks itself when"><option value="">— ticked by hand —</option>{(Object.keys(EXIT_AUTO) as ExitAuto[]).map(k => <option key={k} value={k}>{EXIT_AUTO[k]}</option>)}</select>
                        {canEdit && <button onClick={() => set({ clearance: s.clearance.filter(x => x.id !== c.id) })} className="text-red-600 p-1" aria-label={`Remove ${c.title}`}><Trash2 size={15} /></button>}
                    </div>
                ))}
                {canEdit && <button onClick={() => set({ clearance: [...s.clearance, { id: `c${Math.random().toString(36).slice(2, 9)}`, title: "New item", owner: "HR", auto: null }] })} className={btn2}><Plus size={14} /> Add item</button>}
            </div>
            <div className={card}>
                <p className="text-[13px] font-semibold">Full &amp; final</p>
                <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" disabled={!canEdit} checked={s.fnfApproval} onChange={e => set({ fnfApproval: e.target.checked })} /> F&amp;F must be approved before the payment is recorded</label>
                <label className="flex items-center gap-2 text-[13px] pl-6"><input type="checkbox" disabled={!canEdit || !s.fnfApproval} checked={s.makerChecker} onChange={e => set({ makerChecker: e.target.checked })} /> The approver must be someone other than whoever prepared it (Admins excepted)</label>
                <p className="text-[12.5px] pt-1">Letters made once the F&amp;F is paid ({[s.relievingTypeId, s.experienceTypeId].map(id => types.find(t => t.id === id)?.name).filter(Boolean).join(", ") || "none"}) are now set with all other letters in <Link href="/documents/letters" className="text-[var(--accent)] font-semibold">HR Letters → Auto letters</Link>.</p>
            </div>
            {canEdit && <div className="flex justify-end"><button onClick={save} disabled={busy} className={btn}>{busy && <Loader2 size={14} className="animate-spin" />}Save settings</button></div>}
            {canEdit && (
                <div className={card}>
                    <p className="text-[13px] font-semibold">Past leavers without an exit record</p>
                    <p className="text-[12px] text-[var(--text3)]">People marked Resigned / Terminated before every exit went through Exit. Creating records lets HR check clearance (assets, claims, advances tick themselves) and what is still owed or recoverable in the F&amp;F. Nothing is paid or changed for the person.</p>
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="text-[13px] flex items-center gap-2">Left in the last<input type="number" min={1} max={730} value={days} onChange={e => { setDays(e.target.value); setPreview(null) }} className={`${box} w-20`} /> days</label>
                        <button onClick={() => backfill(false)} disabled={busy} className={btn2}>Preview</button>
                        {preview && preview.count > 0 && <button onClick={() => backfill(true)} disabled={busy} className={btn}>Create {preview.count} exit record(s)</button>}
                    </div>
                    {preview && <p className="text-[12.5px]">{preview.count} past leaver(s) found{preview.sample?.length ? ` — e.g. ${preview.sample.map(p => `${p.name} (${p.code}, left ${p.left})`).join("; ")}` : ""}.</p>}
                </div>
            )}
        </div>
    )
}
