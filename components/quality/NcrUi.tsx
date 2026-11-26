"use client"

// Shared NCR pieces: status pill and the "New NCR" dialog (Quality page,
// NCR page, approval page).
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, X } from "lucide-react"

type Severity = "CRITICAL" | "MAJOR" | "MINOR"
const input = "h-9 rounded-[9px] border border-[var(--border)] bg-white px-2.5 text-[13px] outline-none focus:border-[var(--accent)]"
const btn = "inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-[9px] text-[13px] font-medium disabled:opacity-50"
const btnPrimary = `${btn} bg-[var(--accent)] text-white`
const btnGhost = `${btn} border border-[var(--border)] bg-white text-[var(--text2)] hover:bg-[var(--surface2)]`

async function api<T = any>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const r = await fetch(url, init?.body !== undefined ? { method: init.method ?? "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(init.body) } : { method: init?.method ?? "GET" })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d?.error || "Something went wrong")
    return d as T
}

export const NCR_LABEL: Record<string, string> = {
    OPEN: "Open", CONTAINMENT: "Containment", ROOT_CAUSE: "Root cause", ACTION: "Corrective action",
    VERIFICATION: "Verification", CLOSED: "Closed", CANCELLED: "Cancelled",
}
export const NCR_TONE: Record<string, string> = {
    OPEN: "bg-[#fef2f2] text-[#dc2626]", CONTAINMENT: "bg-[#fff7ed] text-[#c2410c]", ROOT_CAUSE: "bg-[#fffbeb] text-[#b45309]",
    ACTION: "bg-[#eff6ff] text-[#1d4ed8]", VERIFICATION: "bg-[#f5f3ff] text-[#6d28d9]", CLOSED: "bg-[#f0fdf4] text-[#15803d]", CANCELLED: "bg-[var(--surface2)] text-[var(--text3)]",
}
export const NcrStatusPill = ({ s }: { s: string }) => <span className={`inline-flex h-[22px] items-center rounded-full px-2 text-[11px] font-semibold ${NCR_TONE[s] ?? ""}`}>{NCR_LABEL[s] ?? s}</span>


export function NewNcrModal({ onClose, onDone, inspectionId }: { onClose: () => void; onDone: (id: string) => void; inspectionId?: string }) {
    const [title, setTitle] = useState("")
    const [severity, setSeverity] = useState<Severity>("MAJOR")
    const [partName, setPartName] = useState("")
    const [lotNumber, setLotNumber] = useState("")
    const [qtyAffected, setQty] = useState("")
    const [problem, setProblem] = useState("")
    const [owner, setOwner] = useState("")
    const [owners, setOwners] = useState<{ id: string; name: string | null }[]>([])
    const [busy, setBusy] = useState(false)
    useEffect(() => { api<{ users: { id: string; name: string | null }[] }>("/api/quality/ncr?owners=1").then(d => setOwners(d.users)).catch(() => {}) }, [])
    async function save() {
        setBusy(true)
        try {
            const d = await api<{ ncr: { id: string; code: string } }>("/api/quality/ncr", { body: { title, severity, partName, lotNumber, qtyAffected, d2Problem: problem, ownerUserId: owner || undefined, inspectionId } })
            toast.success(`${d.ncr.code} opened`); onDone(d.ncr.id)
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div className="w-full max-w-lg rounded-[14px] bg-white p-5 space-y-3" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <p className="text-[15px] font-semibold text-[var(--text)]">New NCR</p>
                    <button onClick={onClose} className="h-8 w-8 inline-flex items-center justify-center rounded-full hover:bg-[var(--surface2)]" aria-label="Close"><X className="h-4 w-4" /></button>
                </div>
                {inspectionId && <p className="text-[12px] text-[var(--text3)]">Part, lot, quantities and defects are copied from the inspection report. Leave fields blank to use them.</p>}
                <label className="block text-[12px] text-[var(--text3)]">Title{inspectionId ? " (optional)" : ""}<input className={`${input} w-full mt-1`} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Hole shift on bracket" /></label>
                <div className="grid grid-cols-2 gap-3">
                    <label className="block text-[12px] text-[var(--text3)]">Severity
                        <select className={`${input} w-full mt-1`} value={severity} onChange={e => setSeverity(e.target.value as Severity)}>
                            <option value="CRITICAL">Critical</option><option value="MAJOR">Major</option><option value="MINOR">Minor</option>
                        </select>
                    </label>
                    <label className="block text-[12px] text-[var(--text3)]">Owner
                        <select className={`${input} w-full mt-1`} value={owner} onChange={e => setOwner(e.target.value)}>
                            <option value="">Me</option>
                            {owners.map(o => <option key={o.id} value={o.id}>{o.name ?? o.id}</option>)}
                        </select>
                    </label>
                    {!inspectionId && <>
                        <label className="block text-[12px] text-[var(--text3)]">Part<input className={`${input} w-full mt-1`} value={partName} onChange={e => setPartName(e.target.value)} /></label>
                        <label className="block text-[12px] text-[var(--text3)]">Lot / batch<input className={`${input} w-full mt-1`} value={lotNumber} onChange={e => setLotNumber(e.target.value)} /></label>
                        <label className="block text-[12px] text-[var(--text3)]">Pieces affected<input type="number" min={0} className={`${input} w-full mt-1`} value={qtyAffected} onChange={e => setQty(e.target.value)} /></label>
                    </>}
                </div>
                {!inspectionId && <label className="block text-[12px] text-[var(--text3)]">Problem (D2)<textarea rows={3} className="w-full mt-1 rounded-[9px] border border-[var(--border)] p-2.5 text-[13px] outline-none focus:border-[var(--accent)]" value={problem} onChange={e => setProblem(e.target.value)} placeholder="What, where, when, how many" /></label>}
                <div className="flex justify-end gap-2 pt-1">
                    <button className={btnGhost} onClick={onClose}>Cancel</button>
                    <button className={btnPrimary} disabled={busy || (!inspectionId && title.trim().length < 3)} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Open NCR</button>
                </div>
            </div>
        </div>
    )
}
