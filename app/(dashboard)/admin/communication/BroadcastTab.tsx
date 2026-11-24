"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Loader2, Megaphone, MessageCircle, Mail, Bell, Send, Users, Building2, Search, X } from "lucide-react"
import { drainMyMessages } from "@/lib/comm/drain-client"

// Communication Center → Broadcasts: write one message, pick employees
// (all / sites / departments) or customers (all / sites), pick channels,
// see who it reaches, send — then watch delivery in the history.

type Opt = { id: string; name: string }
type Preview = { total: number; whatsapp: number; email: number; inapp: number; sample: string[] }
type Hist = { refId: string; title: string; audience: string; by: string; createdAt: string; whatsapp: Record<string, number>; email: Record<string, number>; inapp: Record<string, number> }

const card = "rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm"
const input = "h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none"
const sum = (o: Record<string, number>, keys: string[]) => keys.reduce((t, k) => t + (o[k] ?? 0), 0)

function Picker({ label, options, value, onChange }: { label: string; options: Opt[]; value: string[]; onChange: (v: string[]) => void }) {
    const [open, setOpen] = useState(false)
    const [q, setQ] = useState("")
    const shown = options.filter(o => o.name.toLowerCase().includes(q.toLowerCase()))
    const names = options.filter(o => value.includes(o.id)).map(o => o.name)
    return (
        <div className="relative">
            <button type="button" onClick={() => setOpen(o => !o)} className={`${input} flex w-full items-center justify-between gap-2 text-left`}>
                <span className="truncate">{value.length ? `${label}: ${names.slice(0, 2).join(", ")}${names.length > 2 ? ` +${names.length - 2}` : ""}` : `All ${label.toLowerCase()}`}</span>
                {value.length > 0 && <X size={13} className="shrink-0 text-[var(--text3)]" onClick={e => { e.stopPropagation(); onChange([]) }} />}
            </button>
            {open && (
                <div className="absolute z-30 mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg">
                    <div className="relative mb-1"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" /><input autoFocus className={`${input} w-full pl-7`} placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} /></div>
                    <div className="max-h-56 overflow-y-auto">
                        {shown.map(o => (
                            <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-[var(--surface2)]">
                                <input type="checkbox" className="accent-[#3d6ff5]" checked={value.includes(o.id)} onChange={() => onChange(value.includes(o.id) ? value.filter(x => x !== o.id) : [...value, o.id])} />
                                {o.name}
                            </label>
                        ))}
                        {!shown.length && <p className="m-0 p-2 text-[12px] text-[var(--text3)]">Nothing found.</p>}
                    </div>
                    <div className="mt-1 flex justify-end"><button type="button" onClick={() => setOpen(false)} className="h-7 rounded-md bg-[#3d6ff5] px-3 text-xs font-semibold text-white">Done</button></div>
                </div>
            )}
        </div>
    )
}

export default function BroadcastTab({ canEdit, waReady, emailReady, waTemplate }: { canEdit: boolean; waReady: boolean; emailReady: boolean; waTemplate: string }) {
    const [kind, setKind] = useState<"employees" | "customers">("employees")
    const [sites, setSites] = useState<Opt[]>([])
    const [depts, setDepts] = useState<Opt[]>([])
    const [siteIds, setSiteIds] = useState<string[]>([])
    const [deptIds, setDeptIds] = useState<string[]>([])
    const [preview, setPreview] = useState<Preview | null>(null)
    const [channels, setChannels] = useState({ whatsapp: false, email: emailReady, inapp: true })
    const [title, setTitle] = useState("")
    const [message, setMessage] = useState("")
    const [sending, setSending] = useState<string | null>(null)
    const [hist, setHist] = useState<Hist[]>([])

    useEffect(() => {
        fetch("/api/sites").then(r => r.json()).then(d => { if (Array.isArray(d)) setSites(d.map((s: any) => ({ id: s.id, name: s.name }))) }).catch(() => {})
        fetch("/api/departments").then(r => r.json()).then(d => { if (Array.isArray(d)) setDepts(d.map((x: any) => ({ id: x.id, name: x.name }))) }).catch(() => {})
    }, [])
    const loadHist = useCallback(async () => { const r = await fetch("/api/comm/broadcast"); const d = await r.json().catch(() => ({})); if (r.ok) setHist(d.rows ?? []) }, [])
    useEffect(() => { loadHist() }, [loadHist])

    const audience = useMemo(() => ({ kind, siteIds, departmentIds: kind === "employees" ? deptIds : [] }), [kind, siteIds, deptIds])
    useEffect(() => {
        let off = false
        setPreview(null)
        const t = setTimeout(async () => {
            const r = await fetch("/api/comm/broadcast", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview", audience }) })
            const d = await r.json().catch(() => null)
            if (!off && r.ok) setPreview(d)
        }, 300)
        return () => { off = true; clearTimeout(t) }
    }, [audience])
    useEffect(() => { if (kind === "customers") setChannels(c => ({ ...c, inapp: false })) }, [kind])

    const chosen = (["whatsapp", "email", "inapp"] as const).filter(c => channels[c])
    const reach = preview ? Math.max(...chosen.map(c => preview[c]), 0) : 0
    const first = preview?.sample[0]?.split(" ")[0] || "Ravi"
    const emailText = `Hi ${first},\n\n${message || "Your message…"}\n\n— Growus Auto India Pvt. Ltd.`

    const send = async () => {
        if (!preview) return
        if (!confirm(`Send "${title}" to ${preview.total} ${kind} by ${chosen.map(c => c === "inapp" ? "in-app" : c).join(" + ")}?\n\nThis can't be undone.`)) return
        setSending("Queuing…")
        try {
            const r = await fetch("/api/comm/broadcast", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", audience, channels: chosen, title, message }) })
            const d = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(d?.error || "Could not send")
            let sent = d.sent
            setSending(`Sending… ${sent} sent`)
            if (d.queued > d.sent + d.failed) sent += await drainMyMessages(p => setSending(`Sending… ${sent + p.sent} sent, ${p.remaining} left`))
            toast.success(`Broadcast sent — ${sent} message${sent === 1 ? "" : "s"} out${d.skipped ? `, ${d.skipped} skipped (no number / email)` : ""}`)
            setTitle(""); setMessage("")
            loadHist()
        } catch (e: any) { toast.error(e.message) } finally { setSending(null) }
    }

    const can = canEdit && !!title.trim() && !!message.trim() && chosen.length > 0 && reach > 0 && !sending && message.length <= 1000
    return (
        <div className="flex flex-col gap-4">
            {canEdit && (
                <div className={card}>
                    <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface2)] px-4 py-2.5 text-sm font-bold text-[var(--text)]"><Megaphone size={15} className="text-[var(--accent)]" /> New broadcast</div>
                    <div className="grid gap-4 p-4 lg:grid-cols-2">
                        <div className="flex flex-col gap-3">
                            <div className="flex rounded-lg border border-[var(--border)] p-0.5 text-xs font-semibold">
                                {([["employees", "Employees", Users], ["customers", "Customers", Building2]] as const).map(([k, l, Icon]) => (
                                    <button key={k} onClick={() => setKind(k)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 ${kind === k ? "bg-[#3d6ff5] text-white" : "text-[var(--text2)]"}`}><Icon size={13} /> {l}</button>
                                ))}
                            </div>
                            <Picker label="Sites" options={sites} value={siteIds} onChange={setSiteIds} />
                            {kind === "employees" && <Picker label="Departments" options={depts} value={deptIds} onChange={setDeptIds} />}
                            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-[12.5px] text-[var(--text2)]">
                                {!preview ? <span className="flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Counting…</span> : (
                                    <>
                                        <b className="text-[var(--text)]">{preview.total}</b> {kind} · {preview.whatsapp} with WhatsApp · {preview.email} with email{kind === "employees" ? ` · ${preview.inapp} with the app` : ""}
                                        {preview.sample.length > 0 && <div className="mt-0.5 truncate text-[11.5px] text-[var(--text3)]">{preview.sample.join(", ")}{preview.total > preview.sample.length ? "…" : ""}</div>}
                                    </>
                                )}
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                {([["whatsapp", "WhatsApp", MessageCircle, waReady, waReady ? "" : !waTemplate ? "No template" : "Not connected"],
                                   ["email", "Email", Mail, emailReady, emailReady ? "" : "Not set up"],
                                   ["inapp", "In-app", Bell, kind === "employees", kind === "employees" ? "" : "Employees only"]] as const).map(([k, l, Icon, ok, why]) => (
                                    <label key={k} title={why || undefined} className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border p-2 text-[12px] font-semibold ${channels[k] ? "border-[#c7dbff] bg-[#eaf0ff] text-[#3d6ff5]" : "border-[var(--border)] text-[var(--text2)]"} ${!ok ? "cursor-not-allowed opacity-50" : ""}`}>
                                        <span className="flex items-center gap-1"><input type="checkbox" className="accent-[#3d6ff5]" disabled={!ok} checked={channels[k] && ok} onChange={e => setChannels(c => ({ ...c, [k]: e.target.checked }))} /><Icon size={13} /> {l}</span>
                                        {why && <span className="text-[10.5px] font-normal text-[var(--text3)]">{why}</span>}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <input className={input} maxLength={120} placeholder="Title (email subject / in-app heading)" value={title} onChange={e => setTitle(e.target.value)} />
                            <textarea className="min-h-[130px] rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-[13px] leading-relaxed text-[var(--text)] outline-none" placeholder="Your message…" value={message} onChange={e => setMessage(e.target.value)} />
                            <div className={`text-right text-[11px] ${message.length > 1000 ? "text-[#dc2626]" : "text-[var(--text3)]"}`}>{message.length} / 1,000</div>
                            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface2)] p-3 text-[12px]">
                                <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-[var(--text3)]">Preview (email)</div>
                                <div className="font-semibold text-[var(--text)]">{title || "Title"}</div>
                                <div className="mt-1 whitespace-pre-line text-[var(--text2)]">{emailText}</div>
                                {channels.whatsapp && <div className="mt-2 border-t border-[var(--border)] pt-2 text-[11.5px] text-[var(--text3)]">WhatsApp: template <b>{waTemplate || "—"}</b> with {"{{1}}"} = {first}, {"{{2}}"} = your message (line breaks become “ · ”).</div>}
                            </div>
                            <div className="flex items-center justify-end gap-3">
                                {sending && <span className="flex items-center gap-1.5 text-[12.5px] text-[var(--text2)]"><Loader2 size={13} className="animate-spin" /> {sending}</span>}
                                <button onClick={send} disabled={!can} className="flex h-10 items-center gap-2 rounded-lg bg-[#3d6ff5] px-4 text-[13px] font-semibold text-white disabled:opacity-50"><Send size={15} /> Send to {reach}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className={card}>
                <div className="border-b border-[var(--border)] bg-[var(--surface2)] px-4 py-2.5 text-sm font-bold text-[var(--text)]">Past broadcasts</div>
                {hist.length === 0 ? <p className="m-0 p-8 text-center text-sm text-[var(--text3)]">No broadcasts yet.</p> : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-[12.5px]">
                            <thead className="bg-[var(--surface2)] text-left text-[var(--text2)]"><tr>{["When", "Title", "To", "By", "WhatsApp", "Email", "In-app"].map(h => <th key={h} className="whitespace-nowrap px-3 py-2 font-bold">{h}</th>)}</tr></thead>
                            <tbody>
                                {hist.map(h => (
                                    <tr key={h.refId} className="border-t border-[var(--border)]">
                                        <td className="whitespace-nowrap px-3 py-2 text-[var(--text2)]">{h.createdAt ? new Date(h.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</td>
                                        <td className="px-3 py-2 font-semibold text-[var(--text)]">{h.title}</td>
                                        <td className="px-3 py-2 text-[var(--text2)]">{h.audience === "customer" ? "Customers" : "Employees"}</td>
                                        <td className="px-3 py-2 text-[var(--text2)]">{h.by || "—"}</td>
                                        {(["whatsapp", "email", "inapp"] as const).map(c => {
                                            const o = h[c]
                                            const total = Object.values(o).reduce((t, n) => t + n, 0)
                                            if (!total) return <td key={c} className="px-3 py-2 text-[var(--text3)]">—</td>
                                            return (
                                                <td key={c} className="whitespace-nowrap px-3 py-2 text-[11.5px] text-[var(--text2)]">
                                                    <b className="text-[var(--text)]">{sum(o, ["sent", "delivered", "read"])}</b>/{total} sent
                                                    {c === "whatsapp" && sum(o, ["read"]) > 0 && <> · {o.read} read</>}
                                                    {sum(o, ["queued", "sending"]) > 0 && <> · {sum(o, ["queued", "sending"])} waiting</>}
                                                    {(o.failed ?? 0) > 0 && <span className="text-[#dc2626]"> · {o.failed} failed</span>}
                                                </td>
                                            )
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
