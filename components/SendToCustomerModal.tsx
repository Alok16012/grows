"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, X, Send, MessageCircle, Mail, FileText, UserPlus, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react"

// Approvals → approved inspection → Send to customer. Pick the site's
// contacts and WhatsApp / email, check the PDF, send. Contacts can be added
// here; the history below shows who got it and whether they read it.

type Contact = { id: string; name: string; designation: string | null; phone: string | null; email: string | null; receiveReports: boolean; allProjects: boolean }
type Hist = { id: string; channel: string; recipientName: string | null; toAddress: string; status: string; error: string | null; createdAt: string; deliveredAt: string | null; readAt: string | null }
type Data = {
    inspection: { id: string; submittedAt: string | null; project: { id: string; name: string }; site: { id: string; name: string; clientName: string | null } | null }
    contacts: Contact[]; contactsInstalled: boolean
    channels: { whatsapp: { ready: boolean; connected: boolean; template: string | null }; email: { ready: boolean; from: string | null } }
    history: Hist[]
}
const STATUS: Record<string, string> = {
    queued: "bg-[var(--surface2)] text-[var(--text2)]", sending: "bg-[var(--surface2)] text-[var(--text2)]",
    sent: "bg-[#e8effe] text-[#0b5cff]", delivered: "bg-[#f5f3ff] text-[#7c3aed]", read: "bg-[#dcfce7] text-[#15803d]",
    failed: "bg-[#fef2f2] text-[#dc2626]", skipped: "bg-[#fffbeb] text-[#b45309]",
}
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "")
const input = "h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none"

export default function SendToCustomerModal({ inspectionId, onClose }: { inspectionId: string; onClose: () => void }) {
    const [d, setD] = useState<Data | null>(null)
    const [picked, setPicked] = useState<Set<string>>(new Set())
    const [channels, setChannels] = useState<{ whatsapp: boolean; email: boolean }>({ whatsapp: true, email: true })
    const [sending, setSending] = useState(false)
    const [adding, setAdding] = useState(false)
    const [form, setForm] = useState({ name: "", designation: "", phone: "", email: "", onlyThis: false })
    const [saving, setSaving] = useState(false)

    const load = useCallback(async (keepPicks = false) => {
        const r = await fetch(`/api/inspections/${inspectionId}/customer`)
        const x = await r.json().catch(() => ({}))
        if (!r.ok) { toast.error(x?.error || "Could not load"); return }
        setD(x)
        if (!keepPicks) setPicked(new Set(x.contacts.filter((c: Contact) => c.receiveReports).map((c: Contact) => c.id)))
        setChannels({ whatsapp: x.channels.whatsapp.ready, email: x.channels.email.ready })
    }, [inspectionId])
    useEffect(() => { load() }, [load])

    const toggle = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })

    const addContact = async () => {
        if (!d?.inspection.site) return
        setSaving(true)
        try {
            const r = await fetch(`/api/sites/${d.inspection.site.id}/contacts`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: form.name, designation: form.designation, phone: form.phone, email: form.email, projectIds: form.onlyThis ? [d.inspection.project.id] : [] }),
            })
            const x = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(x?.error || "Could not add")
            toast.success("Contact added")
            setForm({ name: "", designation: "", phone: "", email: "", onlyThis: false }); setAdding(false)
            await load(true)
            setPicked(p => new Set(p).add(x.contact.id))
        } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
    }
    const removeContact = async (c: Contact) => {
        if (!d?.inspection.site || !confirm(`Remove ${c.name} from this customer's contacts?`)) return
        const r = await fetch(`/api/sites/${d.inspection.site.id}/contacts/${c.id}`, { method: "DELETE" })
        if (r.ok) { toast.success("Removed"); setPicked(p => { const n = new Set(p); n.delete(c.id); return n }); load(true) } else toast.error("Could not remove")
    }

    const send = async () => {
        const ch = (["whatsapp", "email"] as const).filter(c => channels[c])
        setSending(true)
        try {
            const r = await fetch(`/api/inspections/${inspectionId}/customer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactIds: Array.from(picked), channels: ch }) })
            const x = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(x?.error || "Could not send")
            const msg = `${x.sent} sent${x.failed ? `, ${x.failed} failed` : ""}${x.skipped ? `, ${x.skipped} skipped (no number / email)` : ""}${x.queued - x.sent - x.failed > 0 ? `, ${x.queued - x.sent - x.failed} still sending` : ""}`
            if (x.failed) toast.warning(msg, { duration: 8000 }); else toast.success(msg)
            load(true)
        } catch (e: any) { toast.error(e.message) } finally { setSending(false) }
    }

    const chosen = d ? d.contacts.filter(c => picked.has(c.id)) : []
    const reach = chosen.filter(c => (channels.whatsapp && c.phone) || (channels.email && c.email)).length
    const canSend = !!d && chosen.length > 0 && (channels.whatsapp || channels.email) && reach > 0

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={() => !sending && onClose()}>
            <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-bold text-[var(--text)]"><Send size={15} className="text-[#0b5cff]" /> Send report to customer</div>
                        {d && <div className="truncate text-[12px] text-[var(--text3)]">{d.inspection.project.name} · {d.inspection.site?.clientName || d.inspection.site?.name || "No site"}{d.inspection.submittedAt ? ` · ${new Date(d.inspection.submittedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : ""}</div>}
                    </div>
                    <button onClick={onClose} disabled={sending} aria-label="Close" className="text-[var(--text3)]"><X size={16} /></button>
                </div>

                {!d ? (
                    <div className="flex items-center justify-center gap-2 p-10 text-sm text-[var(--text3)]"><Loader2 size={16} className="animate-spin" /> Loading…</div>
                ) : (
                    <div className="flex flex-col gap-4 overflow-y-auto p-4">
                        {!d.inspection.site && <div className="rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-[12.5px] text-[#92400e]">This project isn&apos;t linked to a customer site, so there are no contacts to send to.</div>}

                        {/* Channels */}
                        <div className="grid grid-cols-2 gap-2">
                            {([["whatsapp", "WhatsApp", MessageCircle, d.channels.whatsapp.ready, !d.channels.whatsapp.connected ? "Not connected yet" : !d.channels.whatsapp.template ? "No template chosen" : "PDF + message"],
                               ["email", "Email", Mail, d.channels.email.ready, d.channels.email.ready ? "PDF attached + link" : "Email not set up"]] as const).map(([k, l, Icon, ready, note]) => (
                                <label key={k} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 ${channels[k] ? "border-[#c7dbff] bg-[#e8effe]" : "border-[var(--border)]"} ${!ready ? "cursor-not-allowed opacity-60" : ""}`}>
                                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#0b5cff]" disabled={!ready} checked={channels[k]} onChange={e => setChannels(c => ({ ...c, [k]: e.target.checked }))} />
                                    <span><span className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text)]"><Icon size={14} /> {l}</span><span className="text-[11.5px] text-[var(--text3)]">{note}</span></span>
                                </label>
                            ))}
                        </div>
                        {!d.channels.whatsapp.ready && !d.channels.email.ready && (
                            <div className="flex gap-2 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-[12px] text-[#92400e]"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> Neither WhatsApp nor email is set up yet — see Settings → Communication.</div>
                        )}

                        {/* Contacts */}
                        <div>
                            <div className="mb-1.5 flex items-center justify-between">
                                <span className="text-[12.5px] font-bold text-[var(--text)]">Send to</span>
                                {d.inspection.site && d.contactsInstalled && <button onClick={() => setAdding(a => !a)} className="flex items-center gap-1 text-[12px] font-semibold text-[#0b5cff]"><UserPlus size={13} /> Add contact</button>}
                            </div>
                            {adding && (
                                <div className="mb-2 grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface2)] p-3 sm:grid-cols-2">
                                    <input className={input} placeholder="Name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                                    <input className={input} placeholder="Designation" value={form.designation} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))} />
                                    <input className={input} placeholder="WhatsApp mobile" inputMode="numeric" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                                    <input className={input} placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                                    <label className="flex items-center gap-2 text-[12px] text-[var(--text2)] sm:col-span-2"><input type="checkbox" className="accent-[#0b5cff]" checked={form.onlyThis} onChange={e => setForm(f => ({ ...f, onlyThis: e.target.checked }))} /> Only for this project (otherwise every project at this site)</label>
                                    <div className="flex justify-end gap-2 sm:col-span-2">
                                        <button onClick={() => setAdding(false)} className="h-8 rounded-lg border border-[var(--border)] px-3 text-xs font-semibold text-[var(--text2)]">Cancel</button>
                                        <button onClick={addContact} disabled={saving || !form.name.trim()} className="flex h-8 items-center gap-1.5 rounded-lg bg-[#0b5cff] px-3 text-xs font-semibold text-white disabled:opacity-50">{saving && <Loader2 size={12} className="animate-spin" />} Save contact</button>
                                    </div>
                                </div>
                            )}
                            {!d.contactsInstalled ? <p className="m-0 text-[12.5px] text-[#b45309]">Customer contacts aren&apos;t set up on the database yet.</p>
                                : d.contacts.length === 0 ? <p className="m-0 rounded-lg border border-dashed border-[var(--border)] p-4 text-center text-[12.5px] text-[var(--text3)]">No contacts for this customer yet — add one.</p>
                                : (
                                    <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
                                        {d.contacts.map(c => {
                                            const noReach = !(channels.whatsapp && c.phone) && !(channels.email && c.email)
                                            return (
                                                <label key={c.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                                                    <input type="checkbox" className="h-4 w-4 accent-[#0b5cff]" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block text-[13px] font-semibold text-[var(--text)]">{c.name}{c.designation && <span className="font-normal text-[var(--text3)]"> · {c.designation}</span>}</span>
                                                        <span className="block text-[11.5px] text-[var(--text3)]">
                                                            {c.phone ? <span className="inline-flex items-center gap-1"><MessageCircle size={11} /> {c.phone}</span> : <span>no mobile</span>}
                                                            {"  ·  "}
                                                            {c.email ? <span className="inline-flex items-center gap-1"><Mail size={11} /> {c.email}</span> : <span>no email</span>}
                                                            {!c.allProjects && "  ·  this project only"}
                                                        </span>
                                                        {picked.has(c.id) && noReach && <span className="block text-[11px] text-[#b45309]">Can&apos;t be reached on the chosen channel(s).</span>}
                                                    </span>
                                                    {c.id !== "site" && <button onClick={e => { e.preventDefault(); removeContact(c) }} aria-label={`Remove ${c.name}`} className="text-[var(--text3)] hover:text-[#dc2626]"><Trash2 size={14} /></button>}
                                                </label>
                                            )
                                        })}
                                    </div>
                                )}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <a href={`/api/inspections/${inspectionId}/report-pdf`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--text2)] hover:text-[#0b5cff]"><FileText size={14} /> Preview the PDF</a>
                            <button onClick={send} disabled={!canSend || sending} className="flex h-10 items-center gap-2 rounded-lg bg-[#0b5cff] px-4 text-[13px] font-semibold text-white disabled:opacity-50">
                                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send to {reach} contact{reach === 1 ? "" : "s"}
                            </button>
                        </div>

                        {/* History */}
                        {d.history.length > 0 && (
                            <div>
                                <div className="mb-1.5 text-[12.5px] font-bold text-[var(--text)]">Already sent</div>
                                <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] text-[12px]">
                                    {d.history.map(h => (
                                        <div key={h.id} className="flex items-start gap-2 px-3 py-2">
                                            {h.channel === "whatsapp" ? <MessageCircle size={13} className="mt-0.5 shrink-0 text-[var(--text3)]" /> : <Mail size={13} className="mt-0.5 shrink-0 text-[var(--text3)]" />}
                                            <span className="min-w-0 flex-1">
                                                <span className="font-semibold text-[var(--text)]">{h.recipientName || h.toAddress}</span>
                                                <span className="text-[var(--text3)]"> · {fmt(h.createdAt)}{h.readAt ? ` · read ${fmt(h.readAt)}` : h.deliveredAt ? ` · delivered ${fmt(h.deliveredAt)}` : ""}</span>
                                                {h.error && <span className="block text-[11px] text-[#dc2626]">{h.error}</span>}
                                            </span>
                                            <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${STATUS[h.status] ?? STATUS.queued}`}>{h.status === "read" ? <span className="inline-flex items-center gap-1"><CheckCircle2 size={10} /> read</span> : h.status}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
