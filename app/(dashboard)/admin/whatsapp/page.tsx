"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { CheckCircle2, Circle, Copy, Loader2, MessageCircle, RefreshCw, Send, Save, AlertTriangle } from "lucide-react"
import { canAny, can } from "@/lib/can"

type Template = { name: string; language: string; status: string; category: string; body: string; params: number; header: string | null }
type EventDef = { key: string; label: string; hint: string }
type EventSetting = { enabled: boolean; template: string; language: string }
type Info = {
    connected: boolean
    env: Record<string, boolean>
    phone: { display_phone_number?: string; verified_name?: string; quality_rating?: string; name_status?: string; error: string | null } | null
    templates: Template[]
    templatesError: string | null
    settings: { events: Record<string, EventSetting> }
    events: EventDef[]
    webhookUrl: string
    installed: boolean
    counts30d: Record<string, number>
}
type Msg = { id: string; toPhone: string; recipientName: string | null; event: string; template: string; status: string; error: string | null; createdAt: string; deliveredAt: string | null; readAt: string | null }

const STATUS_STYLE: Record<string, string> = {
    queued: "bg-[var(--surface2)] text-[var(--text3)]",
    sent: "bg-[#e8effe] text-[#0b5cff]",
    delivered: "bg-[#f5f3ff] text-[#7c3aed]",
    read: "bg-[#dcfce7] text-[#15803d]",
    failed: "bg-[#fef2f2] text-[#dc2626]",
}
const ENV_HELP: { key: string; label: string }[] = [
    { key: "WHATSAPP_TOKEN", label: "Permanent access token (System User in Business Manager)" },
    { key: "WHATSAPP_PHONE_NUMBER_ID", label: "Phone number ID (WhatsApp → API Setup)" },
    { key: "WHATSAPP_WABA_ID", label: "WhatsApp Business Account ID" },
    { key: "WHATSAPP_APP_SECRET", label: "App secret (App settings → Basic)" },
    { key: "WHATSAPP_VERIFY_TOKEN", label: "Any long random text — also typed into the webhook setup" },
]
const fmtTime = (s: string | null) => (s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—")

export default function WhatsAppSettingsPage() {
    const { data: session } = useSession()
    const canEdit = can(session, "whatsapp.edit")
    const [info, setInfo] = useState<Info | null>(null)
    const [loading, setLoading] = useState(true)
    const [events, setEvents] = useState<Record<string, EventSetting>>({})
    const [saving, setSaving] = useState(false)
    const [test, setTest] = useState({ to: "", template: "hello_world", language: "en_US", body: [] as string[] })
    const [sending, setSending] = useState(false)
    const [msgs, setMsgs] = useState<{ rows: Msg[]; total: number; page: number; pages: number }>({ rows: [], total: 0, page: 1, pages: 0 })
    const [filter, setFilter] = useState({ status: "", event: "", q: "", page: 1 })

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const r = await fetch("/api/whatsapp")
            const d = await r.json()
            if (!r.ok) throw new Error(d?.error || "Could not load")
            setInfo(d); setEvents(d.settings?.events ?? {})
        } catch (e: any) { toast.error(e.message) } finally { setLoading(false) }
    }, [])
    const loadMsgs = useCallback(async () => {
        const qs = new URLSearchParams({ page: String(filter.page) })
        if (filter.status) qs.set("status", filter.status)
        if (filter.event) qs.set("event", filter.event)
        if (filter.q.trim()) qs.set("q", filter.q.trim())
        const r = await fetch(`/api/whatsapp/messages?${qs}`)
        const d = await r.json().catch(() => ({}))
        if (r.ok) setMsgs(d)
    }, [filter])
    useEffect(() => { load() }, [load])
    useEffect(() => { const t = setTimeout(loadMsgs, 250); return () => clearTimeout(t) }, [loadMsgs])

    const approved = useMemo(() => (info?.templates ?? []).filter(t => t.status === "APPROVED"), [info])
    const testTpl = approved.find(t => t.name === test.template && t.language === test.language)

    const save = async () => {
        setSaving(true)
        try {
            const r = await fetch("/api/whatsapp", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events }) })
            const d = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(d?.error || "Could not save")
            setEvents(d.settings.events); toast.success("WhatsApp events saved")
        } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
    }
    const sendTest = async () => {
        setSending(true)
        try {
            const r = await fetch("/api/whatsapp/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(test) })
            const d = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(d?.error || "Not sent")
            toast.success("Sent — watch the log below for delivered / read"); loadMsgs()
        } catch (e: any) { toast.error(e.message) } finally { setSending(false) }
    }
    const copy = (t: string) => { navigator.clipboard?.writeText(t).then(() => toast.success("Copied")).catch(() => {}) }

    if (session && !canAny(session, ["whatsapp.view", "whatsapp.edit"])) return <div className="p-8 text-center text-sm text-[var(--text3)]">Access denied</div>

    const card = "rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm"
    const head = "flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface2)] px-4 py-3 text-sm font-bold text-[var(--text)]"
    const input = "h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] outline-none"

    return (
        <div className="flex flex-col gap-5 p-4 pb-12 lg:p-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#dcfce7] text-[#15803d]"><MessageCircle size={20} /></div>
                    <div>
                        <h1 className="m-0 text-2xl font-bold tracking-tight text-[var(--text)]">WhatsApp</h1>
                        <p className="m-0 mt-0.5 text-[13px] text-[var(--text3)]">Salary slips, inspection reports and alerts on WhatsApp (Meta Cloud API).</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {info && (info.connected
                        ? <span className="flex items-center gap-1.5 rounded-full border border-[#bbf7d0] bg-[#dcfce7] px-3 py-1 text-xs font-bold text-[#15803d]"><CheckCircle2 size={13} /> Connected</span>
                        : <span className="flex items-center gap-1.5 rounded-full border border-[#fde68a] bg-[#fffbeb] px-3 py-1 text-xs font-bold text-[#b45309]"><AlertTriangle size={13} /> Not connected</span>)}
                    <button onClick={() => { load(); loadMsgs() }} aria-label="Refresh" className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text2)]">
                        <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                    </button>
                </div>
            </div>

            {loading && !info ? (
                <div className="flex items-center justify-center gap-2 p-10 text-sm text-[var(--text3)]"><Loader2 size={16} className="animate-spin" /> Loading…</div>
            ) : info && (
                <>
                    {!info.installed && (
                        <div className="rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-[13px] text-[#92400e]">
                            The message log table isn&apos;t created on the database yet — messages can still be sent, but won&apos;t be recorded until it is (scripts/whatsapp.sql).
                        </div>
                    )}

                    {/* Setup */}
                    <div className={card}>
                        <div className={head}>Setup</div>
                        <div className="grid gap-4 p-4 lg:grid-cols-2">
                            <div>
                                <p className="m-0 mb-2 text-[13px] font-semibold text-[var(--text)]">1. Settings on the server (Vercel → Environment Variables)</p>
                                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                                    {ENV_HELP.map(e => (
                                        <li key={e.key} className="flex items-start gap-2 text-[12.5px]">
                                            {info.env[e.key] ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[#16a34a]" /> : <Circle size={15} className="mt-0.5 shrink-0 text-[var(--text3)]" />}
                                            <span><code className="rounded bg-[var(--surface2)] px-1 text-[11.5px] font-semibold">{e.key}</code> <span className="text-[var(--text3)]">— {e.label}</span></span>
                                        </li>
                                    ))}
                                </ul>
                                <p className="m-0 mt-2 text-[11.5px] text-[var(--text3)]">After adding them, redeploy so the server picks them up. Values are never shown here.</p>
                            </div>
                            <div className="flex flex-col gap-3">
                                <div>
                                    <p className="m-0 mb-1.5 text-[13px] font-semibold text-[var(--text)]">2. Webhook (Meta app → WhatsApp → Configuration)</p>
                                    <div className="flex items-center gap-2">
                                        <code className="min-w-0 flex-1 truncate rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-2.5 py-2 text-[12px]">{info.webhookUrl}</code>
                                        <button onClick={() => copy(info.webhookUrl)} className="flex h-9 items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 text-xs font-semibold text-[var(--text2)]"><Copy size={13} /> Copy</button>
                                    </div>
                                    <p className="m-0 mt-1.5 text-[11.5px] text-[var(--text3)]">Verify token = the WHATSAPP_VERIFY_TOKEN value. Subscribe to <b>messages</b> so delivered / read come back.</p>
                                </div>
                                <div>
                                    <p className="m-0 mb-1.5 text-[13px] font-semibold text-[var(--text)]">3. Connected number</p>
                                    {!info.connected ? <p className="m-0 text-[12.5px] text-[var(--text3)]">Not connected yet.</p>
                                        : info.phone?.error ? <p className="m-0 text-[12.5px] text-[#dc2626]">Meta says: {info.phone.error}</p>
                                        : (
                                            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-[var(--text2)]">
                                                <span><b className="text-[var(--text)]">{info.phone?.display_phone_number}</b></span>
                                                <span>Name: <b className="text-[var(--text)]">{info.phone?.verified_name}</b>{info.phone?.name_status ? ` (${info.phone.name_status.toLowerCase().replace(/_/g, " ")})` : ""}</span>
                                                <span>Quality: <b className="text-[var(--text)]">{info.phone?.quality_rating ?? "—"}</b></span>
                                            </div>
                                        )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Events */}
                    <div className={card}>
                        <div className={head}>
                            <span>What gets sent on WhatsApp</span>
                            {canEdit && <button onClick={save} disabled={saving} className="flex h-8 items-center gap-1.5 rounded-lg bg-[#0b5cff] px-3 text-xs font-semibold text-white disabled:opacity-60">{saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save</button>}
                        </div>
                        {info.templatesError && info.connected && <p className="m-0 border-b border-[var(--border)] px-4 py-2 text-[12px] text-[#b45309]">Templates: {info.templatesError}</p>}
                        <div className="divide-y divide-[var(--border)]">
                            {info.events.map(ev => {
                                const s = events[ev.key] ?? { enabled: false, template: "", language: "en" }
                                const set = (p: Partial<EventSetting>) => setEvents(x => ({ ...x, [ev.key]: { ...s, ...p } }))
                                return (
                                    <div key={ev.key} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center">
                                        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                                            <input type="checkbox" className="mt-1 h-4 w-4 accent-[#16a34a]" disabled={!canEdit || !s.template} checked={s.enabled && !!s.template} onChange={e => set({ enabled: e.target.checked })} />
                                            <span className="min-w-0">
                                                <span className="block text-[13px] font-semibold text-[var(--text)]">{ev.label}</span>
                                                <span className="block text-[11.5px] text-[var(--text3)]">{ev.hint}</span>
                                            </span>
                                        </label>
                                        <select className={`${input} md:w-72`} disabled={!canEdit} value={s.template ? `${s.template}|${s.language}` : ""}
                                            onChange={e => { const [template, language] = e.target.value.split("|"); set({ template: template ?? "", language: language ?? "en", enabled: !!template && s.enabled }) }}>
                                            <option value="">— Choose an approved template —</option>
                                            {s.template && !approved.some(t => t.name === s.template && t.language === s.language) && <option value={`${s.template}|${s.language}`}>{s.template} ({s.language}) — not approved / not found</option>}
                                            {approved.map(t => <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>{t.name} ({t.language}) · {t.category.toLowerCase()}</option>)}
                                        </select>
                                    </div>
                                )
                            })}
                        </div>
                        <p className="m-0 border-t border-[var(--border)] px-4 py-2.5 text-[11.5px] text-[var(--text3)]">
                            Templates are created and approved in Meta (WhatsApp Manager → Message templates); approved ones appear here. The actual sending for each event is switched on as each feature is built.
                        </p>
                    </div>

                    {/* Test */}
                    {canEdit && (
                        <div className={card}>
                            <div className={head}>Send a test message</div>
                            <div className="flex flex-wrap items-end gap-3 p-4">
                                <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--text3)]">Mobile
                                    <input className={`${input} w-44`} inputMode="numeric" placeholder="10-digit number" value={test.to} onChange={e => setTest(t => ({ ...t, to: e.target.value }))} />
                                </label>
                                <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs font-semibold text-[var(--text3)]">Template
                                    <select className={input} value={`${test.template}|${test.language}`} onChange={e => { const [template, language] = e.target.value.split("|"); setTest(t => ({ ...t, template, language, body: [] })) }}>
                                        <option value="hello_world|en_US">hello_world (en_US) — Meta&apos;s built-in test</option>
                                        {approved.filter(t => !(t.name === "hello_world" && t.language === "en_US")).map(t => <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>{t.name} ({t.language})</option>)}
                                    </select>
                                </label>
                                {Array.from({ length: testTpl?.params ?? 0 }).map((_, i) => (
                                    <label key={i} className="flex flex-col gap-1 text-xs font-semibold text-[var(--text3)]">{`{{${i + 1}}}`}
                                        <input className={`${input} w-36`} value={test.body[i] ?? ""} onChange={e => setTest(t => { const body = [...t.body]; body[i] = e.target.value; return { ...t, body } })} />
                                    </label>
                                ))}
                                <button onClick={sendTest} disabled={sending || !info.connected} title={info.connected ? undefined : "Connect WhatsApp first"}
                                    className="flex h-10 items-center gap-2 rounded-lg bg-[#16a34a] px-4 text-sm font-semibold text-white disabled:opacity-50">
                                    {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send test
                                </button>
                            </div>
                            {testTpl?.header === "DOCUMENT" && <p className="m-0 px-4 pb-3 text-[11.5px] text-[#b45309]">This template needs a document header — test it from the feature that sends the document.</p>}
                        </div>
                    )}

                    {/* Log */}
                    <div className={card}>
                        <div className={head}>
                            <span>Message log</span>
                            <span className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
                                {["sent", "delivered", "read", "failed"].map(s => (
                                    <span key={s} className={`rounded-full px-2 py-0.5 ${STATUS_STYLE[s]}`}>{s} {info.counts30d[s] ?? 0}</span>
                                ))}
                                <span className="text-[var(--text3)]">· last 30 days</span>
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-2 border-b border-[var(--border)] p-3">
                            <select className={input} value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value, page: 1 }))}>
                                <option value="">All statuses</option>{["queued", "sent", "delivered", "read", "failed"].map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <select className={input} value={filter.event} onChange={e => setFilter(f => ({ ...f, event: e.target.value, page: 1 }))}>
                                <option value="">All types</option><option value="test">Test</option>{info.events.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
                            </select>
                            <input className={`${input} min-w-[180px] flex-1`} placeholder="Search number, name, template…" value={filter.q} onChange={e => setFilter(f => ({ ...f, q: e.target.value, page: 1 }))} />
                        </div>
                        {msgs.rows.length === 0 ? (
                            <p className="m-0 p-8 text-center text-sm text-[var(--text3)]">No messages yet.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full border-collapse text-[12.5px]">
                                    <thead className="bg-[var(--surface2)] text-left text-[var(--text2)]"><tr>
                                        {["When", "To", "Type", "Template", "Status", "Delivered", "Read"].map(h => <th key={h} className="whitespace-nowrap px-3 py-2 font-bold">{h}</th>)}
                                    </tr></thead>
                                    <tbody>
                                        {msgs.rows.map(m => (
                                            <tr key={m.id} className="border-t border-[var(--border)] align-top">
                                                <td className="whitespace-nowrap px-3 py-2 text-[var(--text2)]">{fmtTime(m.createdAt)}</td>
                                                <td className="whitespace-nowrap px-3 py-2"><span className="font-semibold text-[var(--text)]">{m.recipientName || "—"}</span><span className="block text-[11px] text-[var(--text3)]">+{m.toPhone}</span></td>
                                                <td className="whitespace-nowrap px-3 py-2 text-[var(--text2)]">{info.events.find(e => e.key === m.event)?.label ?? (m.event === "test" ? "Test" : m.event)}</td>
                                                <td className="whitespace-nowrap px-3 py-2 text-[var(--text2)]">{m.template}</td>
                                                <td className="px-3 py-2">
                                                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${STATUS_STYLE[m.status] ?? STATUS_STYLE.queued}`}>{m.status}</span>
                                                    {m.error && <span className="mt-1 block max-w-[280px] text-[11px] text-[#dc2626]">{m.error}</span>}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-2 text-[var(--text2)]">{fmtTime(m.deliveredAt)}</td>
                                                <td className="whitespace-nowrap px-3 py-2 text-[var(--text2)]">{fmtTime(m.readAt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {msgs.pages > 1 && (
                            <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--text3)]">
                                <span>{msgs.total} messages</span>
                                <span className="flex gap-2">
                                    <button disabled={filter.page <= 1} onClick={() => setFilter(f => ({ ...f, page: f.page - 1 }))} className="rounded border border-[var(--border)] px-2 py-1 disabled:opacity-40">Prev</button>
                                    <span className="py-1">Page {msgs.page} of {msgs.pages}</span>
                                    <button disabled={filter.page >= msgs.pages} onClick={() => setFilter(f => ({ ...f, page: f.page + 1 }))} className="rounded border border-[var(--border)] px-2 py-1 disabled:opacity-40">Next</button>
                                </span>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
