"use client"

// Dialer settings: daily targets, what counts as connected / idle, what syncs, the outcome list.
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { STAGES, type DialerSettings, type TextBlock } from "@/lib/dialer"

const box = "h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white"
const lbl = "block text-[11px] font-semibold uppercase text-[var(--text3)] mb-1"

const FOR: Record<TextBlock["for"], string> = { ALL: "Everyone", SALES_LEAD: "Sales leads", CANDIDATE: "Candidates", EMPLOYEE: "Employees", UNKNOWN: "Unknown numbers" }

function Blocks({ title, hint, list, canEdit, onChange }: { title: string; hint: string; list: TextBlock[]; canEdit: boolean; onChange: (l: TextBlock[]) => void }) {
    const set = (i: number, patch: Partial<TextBlock>) => { const x = [...list]; x[i] = { ...x[i], ...patch }; onChange(x) }
    return (
        <section className="rounded-[12px] border border-[var(--border)] bg-white p-4">
            <h3 className="text-[14px] font-bold mb-1">{title}</h3>
            <p className="text-[11.5px] text-[var(--text3)] mb-3">{hint} Placeholders: <code>{"{name}"}</code> <code>{"{company}"}</code> <code>{"{me}"}</code> <code>{"{our_company}"}</code>.</p>
            <div className="space-y-3">
                {list.map((b, i) => (
                    <div key={i} className="rounded-[10px] border border-[var(--border)] p-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <input disabled={!canEdit} className={`${box} w-[240px]`} value={b.title} onChange={e => set(i, { title: e.target.value })} aria-label="Title" />
                            <select disabled={!canEdit} className={box} value={b.for} onChange={e => set(i, { for: e.target.value as TextBlock["for"] })}>{(["ALL", "SALES_LEAD", "CANDIDATE", "EMPLOYEE"] as const).map(k => <option key={k} value={k}>For: {FOR[k]}</option>)}</select>
                            {canEdit && <button onClick={() => onChange(list.filter((_, j) => j !== i))} className="p-1.5 text-[var(--text3)] hover:text-red-600 ml-auto" aria-label="Remove"><Trash2 size={14} /></button>}
                        </div>
                        <textarea disabled={!canEdit} rows={4} className="w-full rounded-[9px] border border-[var(--border)] px-2.5 py-1.5 text-[12.5px]" value={b.body} onChange={e => set(i, { body: e.target.value })} />
                    </div>
                ))}
                {canEdit && <button onClick={() => onChange([...list, { key: "", title: "New", for: "ALL", body: "" }])} className="h-8 px-3 rounded-[8px] border border-[var(--border)] text-[12px] font-semibold inline-flex items-center gap-1"><Plus size={13} /> Add</button>}
            </div>
        </section>
    )
}

export function SettingsPanel() {
    const [s, setS] = useState<DialerSettings | null>(null)
    const [canEdit, setCanEdit] = useState(false)
    const [busy, setBusy] = useState(false)
    useEffect(() => { fetch("/api/dialer/settings").then(r => r.json()).then(j => { setS(j.settings); setCanEdit(!!j.canEdit) }) }, [])
    if (!s) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[var(--text3)]" /></div>
    const n = (k: keyof DialerSettings, label: string, hint?: string) => (
        <div><label className={lbl}>{label}</label><input type="number" min={0} disabled={!canEdit} className={`${box} w-full`} value={s[k] as number} onChange={e => setS({ ...s, [k]: Number(e.target.value) })} />{hint && <p className="text-[11px] text-[var(--text3)] mt-1">{hint}</p>}</div>
    )
    const save = async () => {
        setBusy(true)
        const r = await fetch("/api/dialer/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) })
        const j = await r.json().catch(() => ({}))
        setBusy(false)
        if (r.ok) { setS(j.settings); toast.success("Settings saved") } else toast.error(j?.error || "Could not save")
    }
    return (
        <div className="space-y-4 max-w-[900px]">
            {!canEdit && <p className="text-[12.5px] text-amber-700">You can see these settings. Changing them needs Call Dialer → Edit.</p>}
            <section className="rounded-[12px] border border-[var(--border)] bg-white p-4">
                <h3 className="text-[14px] font-bold mb-3">Daily targets per caller</h3>
                <div className="grid sm:grid-cols-3 gap-3">
                    {n("targetCalls", "Calls dialled")}
                    {n("targetConnected", "Calls connected")}
                    {n("targetTalkMin", "Talk time (minutes)")}
                </div>
                <p className="text-[11.5px] text-[var(--text3)] mt-2">The score is 40% calls, 30% connected and 30% talk time against these targets, times the working days in the range (Sundays off).</p>
            </section>
            <section className="rounded-[12px] border border-[var(--border)] bg-white p-4">
                <h3 className="text-[14px] font-bold mb-3">Rules</h3>
                <div className="grid sm:grid-cols-3 gap-3">
                    {n("minConnectedSec", "Connected if talk ≥ (seconds)", "Shorter calls count as not connected (voicemail, cut at once).")}
                    {n("idleAfterMin", "Idle after (minutes)", "Live view shows a caller as idle after this long without a call.")}
                    <div><label className={lbl}>App download link</label><input disabled={!canEdit} className={`${box} w-full`} placeholder="https://…/growus-dialer.apk" value={s.appUrl} onChange={e => setS({ ...s, appUrl: e.target.value })} /><p className="text-[11px] text-[var(--text3)] mt-1">Shown on the My phone tab. Leave empty to use the app served by the ERP (/downloads/growus-dialer.apk).</p></div>
                </div>
                <div className="mt-3 space-y-2 text-[13px]">
                    <label className="flex items-center gap-2"><input type="checkbox" disabled={!canEdit} checked={s.syncIncoming} onChange={e => setS({ ...s, syncIncoming: e.target.checked })} /> Sync incoming and missed calls too (outgoing calls always sync)</label>
                    <label className="flex items-center gap-2"><input type="checkbox" disabled={!canEdit} checked={s.syncUnknown} onChange={e => setS({ ...s, syncUnknown: e.target.checked })} /> Sync calls to numbers that are not in the ERP (shown as Unknown number)</label>
                </div>
            </section>
            <section className="rounded-[12px] border border-[var(--border)] bg-white p-4">
                <h3 className="text-[14px] font-bold mb-1">Call outcomes</h3>
                <p className="text-[11.5px] text-[var(--text3)] mb-3">What callers pick after a call. <b>Positive</b> counts as a good result. <b>Follow-up</b> suggests a next-call date. <b>Moves lead to</b> changes a sales lead&apos;s stage.</p>
                <div className="space-y-2">
                    {s.outcomes.map((o, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2">
                            <input disabled={!canEdit} className={`${box} w-[220px]`} value={o.label} onChange={e => { const x = [...s.outcomes]; x[i] = { ...o, label: e.target.value }; setS({ ...s, outcomes: x }) }} />
                            <label className="text-[12.5px] flex items-center gap-1"><input type="checkbox" disabled={!canEdit} checked={!!o.positive} onChange={e => { const x = [...s.outcomes]; x[i] = { ...o, positive: e.target.checked }; setS({ ...s, outcomes: x }) }} /> Positive</label>
                            <label className="text-[12.5px] flex items-center gap-1"><input type="checkbox" disabled={!canEdit} checked={!!o.followUp} onChange={e => { const x = [...s.outcomes]; x[i] = { ...o, followUp: e.target.checked }; setS({ ...s, outcomes: x }) }} /> Follow-up</label>
                            <select disabled={!canEdit} className={box} value={o.stage ?? ""} onChange={e => { const x = [...s.outcomes]; x[i] = { ...o, stage: (e.target.value || undefined) as any }; setS({ ...s, outcomes: x }) }}><option value="">Moves lead to: —</option>{Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>Moves lead to: {v.label}</option>)}</select>
                            {canEdit && <button onClick={() => setS({ ...s, outcomes: s.outcomes.filter((_, j) => j !== i) })} className="p-1.5 text-[var(--text3)] hover:text-red-600" aria-label="Remove"><Trash2 size={14} /></button>}
                        </div>
                    ))}
                    {canEdit && <button onClick={() => setS({ ...s, outcomes: [...s.outcomes, { key: "", label: "New outcome" }] })} className="h-8 px-3 rounded-[8px] border border-[var(--border)] text-[12px] font-semibold inline-flex items-center gap-1"><Plus size={13} /> Add outcome</button>}
                </div>
            </section>
            <section className="rounded-[12px] border border-[var(--border)] bg-white p-4">
                <h3 className="text-[14px] font-bold mb-3">Auto-dial</h3>
                <div className="grid sm:grid-cols-3 gap-3">{n("autoDialGapSec", "Seconds before the next call", "After a caller saves the outcome, the next number dials after this pause.")}</div>
            </section>
            <Blocks title="Call scripts" hint="Talking points shown in the call panel while the call is on. Pick who each script is for." list={s.scripts} canEdit={canEdit} onChange={scripts => setS({ ...s, scripts })} />
            <Blocks title="WhatsApp messages" hint="One-tap messages after a call. They open WhatsApp on the phone (or WhatsApp Web on a laptop) with the text filled in, and are noted on the call." list={s.waTemplates} canEdit={canEdit} onChange={waTemplates => setS({ ...s, waTemplates })} />
            {canEdit && <div className="flex justify-end"><button onClick={save} disabled={busy} className="h-9 px-5 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">{busy && <Loader2 size={14} className="animate-spin" />} Save settings</button></div>}
        </div>
    )
}
