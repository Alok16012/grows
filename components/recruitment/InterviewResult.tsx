"use client"

// Record an interview round's outcome: scorecard (1–5 per item), result and feedback.
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { CalendarClock, X } from "lucide-react"
import { INTERVIEW_RESULT } from "@/lib/recruitment"

const box = "h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white"
const btn = "h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
const btn2 = "h-8 px-3 rounded-[8px] border border-[var(--border)] bg-white text-[12px] font-semibold text-[var(--text2)] inline-flex items-center gap-1 disabled:opacity-50"
const lbl = "block text-[11px] font-semibold uppercase text-[var(--text3)]"
const when = (s: string) => new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })

export function InterviewResult({ iv, candidate, onClose, onSaved }: { iv: any; candidate?: string; onClose: () => void; onSaved: () => void }) {
    const [items, setItems] = useState<string[]>([])
    const [scores, setScores] = useState<Record<string, number>>(iv.scores ?? {})
    const [result, setResult] = useState<string>(iv.result ?? "")
    const [feedback, setFeedback] = useState<string>(iv.feedback ?? "")
    const [busy, setBusy] = useState(false)
    useEffect(() => { fetch("/api/recruitment/links").then(r => r.json()).then(j => setItems(j.scoreItems ?? [])).catch(() => setItems(Object.keys(iv.scores ?? {}))) }, [iv.scores])
    useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k) }, [onClose])
    async function save(status: string) {
        setBusy(true)
        try {
            const r = await fetch(`/api/recruitment/interviews/${iv.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, result: status === "DONE" ? result || null : undefined, scores, feedback }) })
            const j = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(j.error || "Could not save")
            toast.success("Saved"); onSaved()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    return createPortal(
        <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} className="fixed inset-0 z-[1100] bg-black/40 flex items-center justify-center p-4">
            <div role="dialog" aria-modal="true" aria-label="Interview result" className="bg-white border border-[var(--border)] shadow-xl overflow-y-auto w-full max-w-lg max-h-[92vh] rounded-[14px]">
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[var(--border)] sticky top-0 bg-white"><h3 className="text-[15px] font-semibold">{iv.title}{candidate || iv.lead?.candidateName ? ` · ${candidate ?? iv.lead?.candidateName}` : ""}</h3><button onClick={onClose} aria-label="Close" className="p-1 text-[var(--text3)]"><X size={18} /></button></div>
                <div className="p-5 space-y-3">
                    <p className="text-[12.5px] text-[var(--text2)]"><CalendarClock size={13} className="inline mr-1" />{when(iv.scheduledAt)}{iv.mode ? ` · ${iv.mode}` : ""}{iv.location ? ` · ${iv.location}` : ""}{iv.interviewerName ? ` · with ${iv.interviewerName}` : ""}</p>
                    <div className="space-y-2">
                        {items.map(k => (
                            <div key={k} className="flex items-center justify-between gap-2 text-[13px]"><span>{k}</span>
                                <div className="flex gap-1">{[1, 2, 3, 4, 5].map(n => <button key={n} type="button" onClick={() => setScores(s => ({ ...s, [k]: n }))} aria-label={`${k} ${n} of 5`} className={`w-7 h-7 rounded-[7px] text-[12px] font-semibold border ${scores[k] >= n ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "bg-white border-[var(--border)] text-[var(--text3)]"}`}>{n}</button>)}</div>
                            </div>
                        ))}
                    </div>
                    <label className={lbl}>Result<select value={result} onChange={e => setResult(e.target.value)} className={`${box} w-full`}><option value="">—</option>{Object.entries(INTERVIEW_RESULT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                    <label className={lbl}>Feedback<textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={3} className="w-full rounded-[9px] border border-[var(--border)] px-2.5 py-1.5 text-[13px]" /></label>
                    <div className="flex flex-wrap justify-end gap-2">
                        <button disabled={busy} onClick={() => save("NO_SHOW")} className={btn2}>Did not come</button>
                        <button disabled={busy} onClick={() => save("CANCELLED")} className={btn2}>Cancelled</button>
                        <button disabled={busy || !result} onClick={() => save("DONE")} className={btn}>Save result</button>
                    </div>
                </div>
            </div>
        </div>, document.body)
}
