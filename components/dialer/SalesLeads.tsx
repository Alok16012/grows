"use client"

// Sales leads (prospects): list by stage, add / import, open one to edit, call and see its calls.
import { useCallback, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { Download, Loader2, Plus, Upload, X } from "lucide-react"
import { CallButton } from "@/components/dialer/CallButton"
import { STAGES, fmtDur, type Stage } from "@/lib/dialer"

type Lead = { id: string; leadNo: string; company: string | null; contactName: string; designation: string | null; phone: string; altPhone: string | null; email: string | null; city: string | null; industry: string | null; service: string | null; source: string | null; stage: Stage; expectedValue: number | null; assignedTo: string | null; assignedName: string | null; nextFollowUp: string | null; lastCalledAt: string | null; lastOutcome: string | null; callCount: number; notes: string | null; lostReason: string | null }
type List = { leads: Lead[]; counts: Record<string, number>; canEditAny: boolean; canSeeTeam: boolean; me: string }
const box = "h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white"
const btn = "h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
const btn2 = "h-9 px-3 rounded-[9px] border border-[var(--border)] bg-white text-[12.5px] font-semibold text-[var(--text2)] inline-flex items-center gap-1.5"
const lbl = "block text-[11px] font-semibold uppercase text-[var(--text3)] mb-1"
const when = (s: string | null) => s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"

async function api(url: string, body?: any, method = "POST") {
    const r = await fetch(url, body === undefined ? undefined : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw Object.assign(new Error(j?.error || "Something went wrong"), { data: j })
    return j
}

export function SalesLeads({ canExport }: { canExport: boolean }) {
    const [stage, setStage] = useState("open")
    const [assigned, setAssigned] = useState("")
    const [q, setQ] = useState("")
    const [d, setD] = useState<List | null>(null)
    const [open, setOpen] = useState<string | null>(null)
    const [adding, setAdding] = useState(false)
    const [importing, setImporting] = useState(false)
    const [users, setUsers] = useState<{ id: string; name: string }[]>([])
    const qs = useMemo(() => new URLSearchParams({ stage, ...(assigned ? { assigned } : {}), q }).toString(), [stage, assigned, q])
    const load = useCallback(() => { fetch(`/api/dialer/sales-leads?${qs}`).then(r => r.json()).then(setD).catch(() => toast.error("Couldn't load")) }, [qs])
    useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t) }, [load, q])
    useEffect(() => { fetch("/api/dialer/users").then(r => r.json()).then(j => setUsers(j.users ?? [])).catch(() => {}) }, [])
    const total = Object.values(d?.counts ?? {}).reduce((a, b) => a + b, 0)
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
                {[["open", "Open", total - (d?.counts.WON ?? 0) - (d?.counts.LOST ?? 0)], ...Object.entries(STAGES).map(([k, v]) => [k, v.label, d?.counts[k] ?? 0]), ["all", "All", total]].map(([k, l, n]) => (
                    <button key={k as string} onClick={() => setStage(k as string)} className={`h-8 px-3 rounded-full text-[12.5px] font-semibold border ${stage === k ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "bg-white border-[var(--border)] text-[var(--text2)]"}`}>{l} <span className="opacity-70">{n}</span></button>
                ))}
            </div>
            <div className="flex flex-wrap gap-2 items-center">
                <input className={`${box} w-[240px]`} placeholder="Search company, name, number, city" value={q} onChange={e => setQ(e.target.value)} />
                {(d?.canSeeTeam || d?.canEditAny) && <select className={box} value={assigned} onChange={e => setAssigned(e.target.value)}><option value="">Everyone&apos;s</option><option value="me">Mine</option><option value="none">Not assigned</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
                <div className="ml-auto flex gap-2">
                    {canExport && <a href={`/api/dialer/sales-leads?${qs}&format=csv`} className={btn2}><Download size={13} /> Download</a>}
                    <button onClick={() => setImporting(true)} className={btn2}><Upload size={13} /> Import</button>
                    <button onClick={() => setAdding(true)} className={btn}><Plus size={14} /> New lead</button>
                </div>
            </div>
            <div className="rounded-[12px] border border-[var(--border)] bg-white overflow-x-auto">
                {!d ? <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[var(--text3)]" /></div> : d.leads.length === 0 ? <p className="p-6 text-[13px] text-[var(--text3)]">No leads here yet. Add one, or import a list of prospects.</p> : (
                    <table className="w-full text-[12.5px]">
                        <thead><tr className="text-left text-[11px] uppercase text-[var(--text3)] border-b border-[var(--border)]">{["Lead", "Company / contact", "Stage", "Assigned", "Next follow-up", "Last call", "Calls", ""].map((h, i) => <th key={i} className="px-3 py-2 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
                        <tbody>
                            {d.leads.map(l => {
                                const late = l.nextFollowUp && new Date(l.nextFollowUp) < new Date() && !["WON", "LOST"].includes(l.stage)
                                return (
                                    <tr key={l.id} className="border-b border-[var(--border)] hover:bg-gray-50 cursor-pointer" onClick={() => setOpen(l.id)}>
                                        <td className="px-3 py-2 text-[var(--text3)] tabular-nums whitespace-nowrap">{l.leadNo}</td>
                                        <td className="px-3 py-2"><div className="font-semibold text-[var(--text)]">{l.company || l.contactName}</div><div className="text-[11px] text-[var(--text3)]">{l.company ? l.contactName : ""}{l.designation ? ` · ${l.designation}` : ""}{l.city ? ` · ${l.city}` : ""}</div></td>
                                        <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STAGES[l.stage]?.color}`}>{STAGES[l.stage]?.label ?? l.stage}</span></td>
                                        <td className="px-3 py-2 whitespace-nowrap">{l.assignedName ?? <span className="text-[var(--text3)]">—</span>}</td>
                                        <td className={`px-3 py-2 whitespace-nowrap tabular-nums ${late ? "text-red-600 font-semibold" : ""}`}>{when(l.nextFollowUp)}</td>
                                        <td className="px-3 py-2 whitespace-nowrap"><div className="tabular-nums">{when(l.lastCalledAt)}</div>{l.lastOutcome && <div className="text-[11px] text-[var(--text3)]">{l.lastOutcome}</div>}</td>
                                        <td className="px-3 py-2 tabular-nums">{l.callCount}</td>
                                        <td className="px-3 py-2" onClick={e => e.stopPropagation()}><CallButton phone={l.phone} targetType="SALES_LEAD" targetId={l.id} name={l.company ? `${l.contactName} (${l.company})` : l.contactName} /></td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>
            {adding && <LeadForm users={users} canAssign={!!d?.canEditAny} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />}
            {open && <LeadDrawer id={open} users={users} canAssign={!!d?.canEditAny} onClose={() => setOpen(null)} onChanged={load} />}
            {importing && <ImportDialog users={users} canAssign={!!d?.canEditAny} onClose={() => setImporting(false)} onDone={() => { setImporting(false); load() }} />}
        </div>
    )
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
    return createPortal(
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-start md:items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
            <div className={`bg-white rounded-[14px] w-full ${wide ? "max-w-[760px]" : "max-w-[560px]"} shadow-xl`} onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]"><h2 className="text-[15px] font-bold">{title}</h2><button onClick={onClose} aria-label="Close"><X size={17} /></button></div>
                <div className="p-5">{children}</div>
            </div>
        </div>, document.body)
}

const FIELDS: [keyof Lead, string, string?][] = [["company", "Company"], ["contactName", "Contact name *"], ["designation", "Designation"], ["phone", "Phone *", "tel"], ["altPhone", "Other phone", "tel"], ["email", "Email", "email"], ["city", "City"], ["industry", "Industry"], ["service", "Service needed"], ["source", "Source"], ["expectedValue", "Expected value (₹ / month)", "number"]]

function Fields({ v, set }: { v: any; set: (k: string, x: any) => void }) {
    return (
        <div className="grid sm:grid-cols-2 gap-3">
            {FIELDS.map(([k, l, t]) => <div key={k}><label className={lbl}>{l}</label><input type={t ?? "text"} className={`${box} w-full`} value={v[k] ?? ""} onChange={e => set(k, e.target.value)} /></div>)}
        </div>
    )
}

function LeadForm({ users, canAssign, onClose, onSaved }: { users: { id: string; name: string }[]; canAssign: boolean; onClose: () => void; onSaved: () => void }) {
    const [v, setV] = useState<any>({ source: "Telecalling" })
    const [busy, setBusy] = useState(false)
    const save = async (allowDuplicate = false) => {
        setBusy(true)
        try { await api("/api/dialer/sales-leads", { ...v, allowDuplicate }); toast.success("Lead added"); onSaved() }
        catch (e: any) { if (e.data?.duplicate && confirm(`${e.message}. Add it anyway?`)) { setBusy(false); return save(true) } toast.error(e.message) }
        setBusy(false)
    }
    return (
        <Modal title="New sales lead" onClose={onClose}>
            <Fields v={v} set={(k, x) => setV({ ...v, [k]: x })} />
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
                <div><label className={lbl}>Next follow-up</label><input type="datetime-local" className={`${box} w-full`} value={v.nextFollowUp ?? ""} onChange={e => setV({ ...v, nextFollowUp: e.target.value })} /></div>
                {canAssign && <div><label className={lbl}>Assign to</label><select className={`${box} w-full`} value={v.assignedTo ?? ""} onChange={e => setV({ ...v, assignedTo: e.target.value })}><option value="">Me</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>}
            </div>
            <div className="mt-3"><label className={lbl}>Notes</label><textarea className="w-full rounded-[9px] border border-[var(--border)] px-2.5 py-1.5 text-[13px]" rows={3} value={v.notes ?? ""} onChange={e => setV({ ...v, notes: e.target.value })} /></div>
            <div className="flex justify-end gap-2 mt-4"><button className={btn2} onClick={onClose}>Cancel</button><button className={btn} disabled={busy} onClick={() => save()}>{busy && <Loader2 size={14} className="animate-spin" />} Add lead</button></div>
        </Modal>
    )
}

function LeadDrawer({ id, users, canAssign, onClose, onChanged }: { id: string; users: { id: string; name: string }[]; canAssign: boolean; onClose: () => void; onChanged: () => void }) {
    const [d, setD] = useState<{ lead: Lead & { createdByName?: string }; calls: any[] } | null>(null)
    const [v, setV] = useState<any>(null)
    const [busy, setBusy] = useState(false)
    const load = useCallback(() => fetch(`/api/dialer/sales-leads/${id}`).then(r => r.json()).then(j => { setD(j); const l = j.lead; setV({ ...l, nextFollowUp: l.nextFollowUp ? toLocal(l.nextFollowUp) : "" }) }), [id])
    useEffect(() => { load() }, [load])
    const save = async (patch?: any) => {
        setBusy(true)
        try { await api(`/api/dialer/sales-leads/${id}`, patch ?? { ...Object.fromEntries(FIELDS.map(([k]) => [k, v[k]])), notes: v.notes, lostReason: v.lostReason, stage: v.stage, nextFollowUp: v.nextFollowUp ? new Date(v.nextFollowUp).toISOString() : null, ...(canAssign ? { assignedTo: v.assignedTo || null } : {}) }, "PATCH"); toast.success("Saved"); onChanged(); load() }
        catch (e: any) { toast.error(e.message) }
        setBusy(false)
    }
    return (
        <Modal title={d ? `${d.lead.leadNo} · ${d.lead.company || d.lead.contactName}` : "Lead"} onClose={onClose} wide>
            {!d || !v ? <div className="p-8 flex justify-center"><Loader2 className="animate-spin" /></div> : (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <CallButton phone={d.lead.phone} targetType="SALES_LEAD" targetId={d.lead.id} name={d.lead.company ? `${d.lead.contactName} (${d.lead.company})` : d.lead.contactName} label={`Call ${d.lead.phone}`} className="h-9 px-3 rounded-[9px] bg-green-600 text-white text-[12.5px] font-semibold inline-flex items-center gap-1.5" />
                        {d.lead.altPhone && <CallButton phone={d.lead.altPhone} targetType="SALES_LEAD" targetId={d.lead.id} name={d.lead.contactName} label={d.lead.altPhone} className={btn2} />}
                        <div className="ml-auto flex flex-wrap gap-1">
                            {Object.entries(STAGES).map(([k, s]) => <button key={k} onClick={() => setV({ ...v, stage: k })} className={`px-2.5 py-1 rounded-full text-[11.5px] font-semibold border ${v.stage === k ? "border-gray-900 " + s.color : "border-[var(--border)] bg-white text-[var(--text3)]"}`}>{s.label}</button>)}
                        </div>
                    </div>
                    <Fields v={v} set={(k, x) => setV({ ...v, [k]: x })} />
                    <div className="grid sm:grid-cols-2 gap-3">
                        <div><label className={lbl}>Next follow-up</label><input type="datetime-local" className={`${box} w-full`} value={v.nextFollowUp ?? ""} onChange={e => setV({ ...v, nextFollowUp: e.target.value })} /></div>
                        {canAssign ? <div><label className={lbl}>Assigned to</label><select className={`${box} w-full`} value={v.assignedTo ?? ""} onChange={e => setV({ ...v, assignedTo: e.target.value })}><option value="">Not assigned</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
                            : <div><label className={lbl}>Assigned to</label><div className="text-[13px] pt-2">{d.lead.assignedName ?? "—"}</div></div>}
                        {v.stage === "LOST" && <div className="sm:col-span-2"><label className={lbl}>Why lost</label><input className={`${box} w-full`} value={v.lostReason ?? ""} onChange={e => setV({ ...v, lostReason: e.target.value })} /></div>}
                    </div>
                    <div><label className={lbl}>Notes</label><textarea className="w-full rounded-[9px] border border-[var(--border)] px-2.5 py-1.5 text-[13px]" rows={4} value={v.notes ?? ""} onChange={e => setV({ ...v, notes: e.target.value })} /></div>
                    <div className="flex justify-end"><button className={btn} disabled={busy} onClick={() => save()}>{busy && <Loader2 size={14} className="animate-spin" />} Save</button></div>
                    <div>
                        <h3 className="text-[13px] font-bold mb-2">Calls ({d.calls.length})</h3>
                        {d.calls.length === 0 ? <p className="text-[12.5px] text-[var(--text3)]">No calls yet.</p> : (
                            <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-[10px]">
                                {d.calls.map(c => <li key={c.id} className="px-3 py-2 text-[12.5px]"><div className="flex justify-between gap-2"><span className="font-semibold">{c.userName} · {c.direction === "INCOMING" ? "incoming" : c.direction === "OUTGOING" ? "outgoing" : c.direction.toLowerCase()}</span><span className="text-[var(--text3)] tabular-nums">{when(c.startedAt)} · {c.connected ? fmtDur(c.durationSec) : "not connected"}</span></div>{(c.outcome || c.notes) && <div className="text-[var(--text2)]">{c.outcome}{c.notes ? ` — ${c.notes}` : ""}</div>}</li>)}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </Modal>
    )
}
const toLocal = (s: string) => { const d = new Date(s), p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }

// CSV / pasted rows → leads. Header names are matched loosely (company, name / contact, phone / mobile, …).
const HEADS: Record<string, string> = { company: "company", "company name": "company", organisation: "company", organization: "company", firm: "company", name: "contactName", contact: "contactName", "contact name": "contactName", "contact person": "contactName", person: "contactName", designation: "designation", title: "designation", phone: "phone", mobile: "phone", "mobile no": "phone", "phone number": "phone", number: "phone", contact_no: "phone", "contact no": "phone", "alternate phone": "altPhone", "alt phone": "altPhone", email: "email", "email id": "email", city: "city", location: "city", industry: "industry", sector: "industry", service: "service", requirement: "service", source: "source", notes: "notes", remarks: "notes" }
function parseRows(text: string) {
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) return []
    const sep = lines[0].includes("\t") ? "\t" : ","
    const split = (l: string) => { const out: string[] = []; let cur = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur); cur = "" } else cur += ch } out.push(cur); return out.map(s => s.trim()) }
    const head = split(lines[0]).map(h => HEADS[h.toLowerCase().replace(/[^a-z_ ]/g, "").trim()] ?? null)
    return lines.slice(1).map(l => { const c = split(l), r: any = {}; head.forEach((h, i) => { if (h && c[i]) r[h] = c[i] }); return r }).filter(r => r.phone)
}
function ImportDialog({ users, canAssign, onClose, onDone }: { users: { id: string; name: string }[]; canAssign: boolean; onClose: () => void; onDone: () => void }) {
    const [text, setText] = useState("")
    const [assignTo, setAssignTo] = useState<string[]>([])
    const [busy, setBusy] = useState(false)
    const rows = useMemo(() => parseRows(text), [text])
    const run = async () => {
        setBusy(true)
        try { const j = await api("/api/dialer/sales-leads/import", { rows, assignTo }); toast.success(`${j.added} leads added${j.skipped.length ? `, ${j.skipped.length} skipped (already a lead or no phone)` : ""}`); onDone() }
        catch (e: any) { toast.error(e.message) }
        setBusy(false)
    }
    return (
        <Modal title="Import sales leads" onClose={onClose} wide>
            <p className="text-[12.5px] text-[var(--text3)] mb-2">Choose a CSV file or paste rows from Excel. The first row must be headings, such as Company, Contact name, Phone, Email, City, Industry, Service or Source. Numbers that are already leads are skipped.</p>
            <input type="file" accept=".csv,text/csv" className="text-[12.5px] mb-2" onChange={async e => { const f = e.target.files?.[0]; if (f) setText(await f.text()) }} />
            <textarea className="w-full rounded-[9px] border border-[var(--border)] px-2.5 py-1.5 text-[12.5px] font-mono" rows={8} value={text} onChange={e => setText(e.target.value)} placeholder={"Company,Contact name,Phone,City\nABC Pvt Ltd,Ravi Patil,9876543210,Pune"} />
            {canAssign && users.length > 0 && (
                <div className="mt-3">
                    <label className={lbl}>Share out between (optional, round robin)</label>
                    <select multiple className="w-full h-28 rounded-[9px] border border-[var(--border)] text-[12.5px]" value={assignTo} onChange={e => setAssignTo(Array.from(e.target.selectedOptions).map(o => o.value))}>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
                    <p className="text-[11px] text-[var(--text3)] mt-1">Hold Ctrl to pick several. Leave empty to keep them with you.</p>
                </div>
            )}
            <div className="flex items-center justify-between mt-4">
                <span className="text-[12.5px] text-[var(--text2)]">{rows.length} row(s) with a phone number</span>
                <div className="flex gap-2"><button className={btn2} onClick={onClose}>Cancel</button><button className={btn} disabled={busy || !rows.length} onClick={run}>{busy && <Loader2 size={14} className="animate-spin" />} Import {rows.length || ""}</button></div>
            </div>
        </Modal>
    )
}
