"use client"

// Onboarding → Approvals: details and documents employees changed or uploaded
// themselves (My Profile, My Onboarding). Nothing reaches their record until
// someone approves it here; each change can be ticked or left out.
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, Eye, FileText, Loader2, RefreshCw, Settings2, XCircle } from "lucide-react"
import { DocumentViewer } from "@/components/DocumentViewer"

type Change = { field: string; label: string; from: string | null; to: string | null; fileUrl?: string | null }
type Req = {
    id: string; requestNo: string; employeeId: string; status: string; reason: string | null; createdAt: string; updatedAt: string
    decidedAt: string | null; decisionNote: string | null; requestedBy: string; decidedByName: string | null
    employee: string; employeeCode: string; designation: string | null; site: string | null; employeeStatus: string | null; photo: string | null
    changes: Change[]
}
type Settings = { selfAllFields: boolean; selfDocs: boolean; joinersToo: boolean; selfService: boolean }
type Data = { me: string; canDecide: boolean; canEditSettings: boolean; settings: Settings; requests: Req[] }

const ago = (s: string) => {
    const m = Math.round((Date.now() - new Date(s).getTime()) / 60000)
    return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}
const isDoc = (c: Change) => c.field.startsWith("doc:")
const STATUS_STYLE: Record<string, string> = { PENDING: "bg-amber-100 text-amber-700", APPROVED: "bg-green-100 text-green-700", REJECTED: "bg-red-100 text-red-600", CANCELLED: "bg-gray-100 text-gray-600" }

export function ProfileApprovals({ onCount }: { onCount?: (n: number) => void }) {
    const [status, setStatus] = useState<"PENDING" | "ALL">("PENDING")
    const [d, setD] = useState<Data | null>(null)
    const [showSettings, setShowSettings] = useState(false)
    const load = useCallback(() => {
        setD(null)
        fetch(`/api/onboarding/approvals?status=${status}`).then(r => r.json()).then((j: Data) => {
            setD(j)
            if (status === "PENDING") onCount?.(j.requests?.length ?? 0)
        }).catch(() => toast.error("Couldn't load approvals"))
    }, [status, onCount])
    useEffect(() => { load() }, [load])

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <div className="z-tabs" role="tablist">
                    {([["PENDING", "Waiting"], ["ALL", "History"]] as const).map(([k, l]) => (
                        <button key={k} role="tab" aria-selected={status === k} onClick={() => setStatus(k)} className={`z-tab ${status === k ? "is-active" : ""}`}>{l}</button>
                    ))}
                </div>
                <div className="flex-1" />
                <button onClick={load} className="h-9 px-3 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] text-[13px] font-semibold text-[var(--text2)] inline-flex items-center gap-1.5"><RefreshCw size={14} /> Refresh</button>
                {d?.canEditSettings && <button onClick={() => setShowSettings(s => !s)} className="h-9 px-3 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] text-[13px] font-semibold text-[var(--text2)] inline-flex items-center gap-1.5"><Settings2 size={14} /> Rule</button>}
            </div>

            {d && (showSettings || (!d.settings.selfAllFields && !d.settings.selfDocs)) && d.canEditSettings && <RuleSettings value={d.settings} onSaved={s => setD(x => x ? { ...x, settings: s } : x)} />}

            <p className="text-[12.5px] text-[var(--text3)]">
                {d?.settings.selfAllFields ? "Every detail" : "Bank, PAN, Aadhaar, name and other sensitive details"}{d?.settings.selfDocs ? " and every document" : ""} an employee changes in My Profile waits here. It goes into their record only after you approve it.
            </p>

            {!d ? <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-[var(--text3)]" /></div>
                : d.requests.length === 0 ? (
                    <div className="text-center py-12 bg-[var(--surface)] border border-[var(--border)] rounded-[14px]">
                        <CheckCircle2 className="mx-auto text-green-500 mb-2" size={28} />
                        <p className="font-semibold text-[var(--text2)] text-[14px]">{status === "PENDING" ? "Nothing waiting" : "No updates yet"}</p>
                        <p className="text-[12px] text-[var(--text3)]">Employee updates and uploads show up here for approval.</p>
                    </div>
                ) : d.requests.map(r => <RequestCard key={r.id} r={r} canDecide={d.canDecide && (r.requestedBy !== d.me)} onDone={load} />)}
        </div>
    )
}

function RequestCard({ r, canDecide, onDone }: { r: Req; canDecide: boolean; onDone: () => void }) {
    const [ticked, setTicked] = useState<Set<string>>(new Set(r.changes.map(c => c.field)))
    const [busy, setBusy] = useState(false)
    const [view, setView] = useState<{ url: string; name: string } | null>(null)
    const pending = r.status === "PENDING"

    async function act(action: "APPROVE" | "REJECT") {
        let note: string | null = null
        const leftOut = r.changes.filter(c => !ticked.has(c.field))
        if (action === "REJECT") {
            note = prompt(`Why reject these updates from ${r.employee}? The employee will see this.`)
            if (!note || note.trim().length < 3) return
        } else {
            if (!ticked.size) { toast.error("Tick at least one change"); return }
            if (leftOut.length) {
                note = prompt(`Why not approve ${leftOut.map(c => c.label).join(", ")}? The employee will see this.`)
                if (!note || note.trim().length < 3) return
            } else if (!confirm(`Approve ${ticked.size} update${ticked.size > 1 ? "s" : ""} for ${r.employee}? They go into the employee record now.`)) return
        }
        setBusy(true)
        try {
            const res = await fetch(`/api/employees/changes/${r.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, note, fields: action === "APPROVE" ? Array.from(ticked) : undefined }) })
            const j = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(j?.error || "Could not save")
            toast.success(action === "APPROVE" ? "Approved — employee record updated" : "Rejected — the employee has been told")
            onDone()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }

    return (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
                <div className="w-9 h-9 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center font-bold text-[13px] shrink-0 overflow-hidden">
                    {r.photo && !r.photo.startsWith("private:") ? <img src={r.photo} alt="" className="w-full h-full object-cover" /> : r.employee.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-[var(--text)] truncate">{r.employee} <span className="text-[12px] font-normal text-[var(--text3)]">{r.employeeCode}</span></p>
                    <p className="text-[12px] text-[var(--text3)] truncate">{[r.designation, r.site, r.employeeStatus === "ONBOARDING" ? "New joiner" : null].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="text-right">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${STATUS_STYLE[r.status] ?? ""}`}>{r.status === "PENDING" ? "Waiting" : r.status[0] + r.status.slice(1).toLowerCase()}</span>
                    <p className="text-[11px] text-[var(--text3)] mt-0.5">{r.requestNo} · {ago(r.updatedAt)}</p>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]" style={{ minWidth: 520 }}>
                    <thead><tr className="text-left text-[11px] uppercase tracking-wide text-[var(--text3)] bg-[var(--surface2)]">
                        {pending && canDecide && <th className="px-3 py-2 w-8"><input type="checkbox" aria-label="Tick all" checked={ticked.size === r.changes.length} onChange={e => setTicked(e.target.checked ? new Set(r.changes.map(c => c.field)) : new Set())} /></th>}
                        <th className="px-3 py-2">What</th><th className="px-3 py-2">Now in record</th><th className="px-3 py-2">Employee entered</th>
                    </tr></thead>
                    <tbody>
                        {r.changes.map(c => (
                            <tr key={c.field} className="border-t border-[var(--border)] align-top">
                                {pending && canDecide && <td className="px-3 py-2"><input type="checkbox" aria-label={`Approve ${c.label}`} checked={ticked.has(c.field)} onChange={e => setTicked(t => { const x = new Set(t); if (e.target.checked) x.add(c.field); else x.delete(c.field); return x })} /></td>}
                                <td className="px-3 py-2 font-medium text-[var(--text)]">{isDoc(c) && <FileText size={13} className="inline mr-1 text-[var(--text3)]" />}{c.label}</td>
                                <td className="px-3 py-2 text-[var(--text3)] break-all">{c.from ?? <i>empty</i>}</td>
                                <td className="px-3 py-2 text-[var(--text)] font-semibold break-all">
                                    {isDoc(c) && c.fileUrl
                                        ? <button onClick={() => setView({ url: c.fileUrl!, name: c.to ?? c.label })} className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"><Eye size={13} /> {c.to ?? "View file"}</button>
                                        : c.to ?? <i className="font-normal text-[var(--text3)]">cleared</i>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {(r.reason || r.decisionNote || r.decidedByName) && (
                <div className="px-4 py-2 border-t border-[var(--border)] text-[12px] text-[var(--text3)] space-y-0.5">
                    {r.reason && <p><b>Employee's note:</b> {r.reason}</p>}
                    {r.decidedByName && <p><b>{r.status === "APPROVED" ? "Approved" : r.status === "REJECTED" ? "Rejected" : "Closed"} by</b> {r.decidedByName}{r.decidedAt ? ` · ${new Date(r.decidedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}` : ""}{r.decisionNote ? ` — ${r.decisionNote}` : ""}</p>}
                </div>
            )}
            {pending && canDecide && (
                <div className="flex flex-wrap justify-end gap-2 px-4 py-3 border-t border-[var(--border)] bg-[var(--surface2)]/50">
                    <button onClick={() => act("REJECT")} disabled={busy} className="h-9 px-4 rounded-[9px] border border-red-200 text-red-600 bg-white text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"><XCircle size={14} /> Reject all</button>
                    <button onClick={() => act("APPROVE")} disabled={busy || !ticked.size} className="h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        {ticked.size === r.changes.length ? "Approve" : `Approve ${ticked.size} ticked`}
                    </button>
                </div>
            )}
            {pending && !canDecide && <p className="px-4 py-2 border-t border-[var(--border)] text-[12px] text-[var(--text3)]">Someone with Onboarding → Approve (or Edit Employees) approves this.</p>}
            {view && <DocumentViewer url={view.url} fileName={view.name} onClose={() => setView(null)} />}
        </div>
    )
}

function RuleSettings({ value, onSaved }: { value: Settings; onSaved: (s: Settings) => void }) {
    const [s, setS] = useState(value)
    const [busy, setBusy] = useState(false)
    async function save() {
        setBusy(true)
        try {
            const r = await fetch("/api/onboarding/approvals", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) })
            const j = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(j?.error || "Could not save")
            toast.success("Approval rule saved"); onSaved(j.settings)
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    const row = (k: keyof Settings, label: React.ReactNode, disabled = false) => (
        <label className={`flex items-start gap-2 text-[13px] ${disabled ? "opacity-50" : ""}`}><input type="checkbox" className="mt-0.5" disabled={disabled} checked={!!s[k]} onChange={e => setS(x => ({ ...x, [k]: e.target.checked }))} /> <span>{label}</span></label>
    )
    return (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[12px] p-4 space-y-2.5">
            <p className="text-[13px] font-semibold text-[var(--text)]">Approval rule for employee updates</p>
            {row("selfAllFields", <>Hold <b>every detail</b> an employee changes themself (off: only the sensitive fields set in <a href="/employees/changes" className="text-[var(--accent)] underline">People → Changes</a>)</>)}
            {row("selfDocs", <>Hold <b>documents</b> an employee uploads themself</>)}
            {row("joinersToo", <>Also for <b>new joiners</b> not approved yet (off: they fill their details freely; the joining approval checks everything anyway)</>)}
            <div className="flex justify-end"><button onClick={save} disabled={busy} className="h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50 inline-flex items-center gap-1.5">{busy && <Loader2 size={14} className="animate-spin" />}Save</button></div>
        </div>
    )
}
