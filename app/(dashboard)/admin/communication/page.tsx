"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import {
    AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Circle, Copy, Loader2, Mail, MessageCircle,
    Bell, RefreshCw, RotateCcw, Save, Send, Trash2, Megaphone, Users, Building2,
} from "lucide-react"
import { can, canAny } from "@/lib/can"
import { fillTemplate, sampleData, type Channel, type CommEvent } from "@/lib/comm/events"

type EventChannels = {
    whatsapp: { enabled: boolean; template: string; language: string }
    email: { enabled: boolean; subject: string; body: string }
    inapp: { enabled: boolean }
}
type Settings = { events: Record<string, EventChannels>; quietStart: string; quietEnd: string; emailFromName: string }
type Template = { name: string; language: string; status: string; category: string; body: string; params: number; header: string | null }
type Info = {
    events: CommEvent[]
    settings: Settings
    whatsapp: { connected: boolean; env: Record<string, boolean>; phone: any; templates: Template[]; templatesError: string | null; webhookUrl: string }
    email: { configured: boolean; provider: string; from: string | null }
    installed: boolean
    counts: { channel: string; status: string; n: number }[]
    queue: { due: number; waiting: number }
}
type Msg = { id: string; channel: string; event: string; recipientType: string; recipientName: string | null; toAddress: string; subject: string | null; status: string; error: string | null; attempts: number; nextAttemptAt: string; createdAt: string; deliveredAt: string | null; readAt: string | null }
type OptOut = { id: string; channel: string; address: string; reason: string | null; createdAt: string }
type Tab = "events" | "channels" | "log" | "optouts"

const CH_ICON: Record<Channel, typeof Mail> = { whatsapp: MessageCircle, email: Mail, inapp: Bell }
const CH_LABEL: Record<Channel, string> = { whatsapp: "WhatsApp", email: "Email", inapp: "In-app" }
const STATUS: Record<string, string> = {
    queued: "bg-[var(--surface2)] text-[var(--text2)]", sending: "bg-[var(--surface2)] text-[var(--text2)]",
    sent: "bg-[#e8effe] text-[#0b5cff]", delivered: "bg-[#f5f3ff] text-[#7c3aed]", read: "bg-[#dcfce7] text-[#15803d]",
    failed: "bg-[#fef2f2] text-[#dc2626]", skipped: "bg-[#fffbeb] text-[#b45309]",
}
const WA_ENV = [
    ["WHATSAPP_TOKEN", "Permanent access token (System User)"],
    ["WHATSAPP_PHONE_NUMBER_ID", "Phone number ID"],
    ["WHATSAPP_WABA_ID", "WhatsApp Business Account ID"],
    ["WHATSAPP_APP_SECRET", "App secret (checks delivery receipts)"],
    ["WHATSAPP_VERIFY_TOKEN", "Any long random text, also typed into the webhook"],
]
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—")

export default function CommunicationCenterPage() {
    const { data: session } = useSession()
    const canEdit = can(session, "whatsapp.edit")
    const [tab, setTab] = useState<Tab>("events")
    const [info, setInfo] = useState<Info | null>(null)
    const [settings, setSettings] = useState<Settings | null>(null)
    const [dirty, setDirty] = useState(false)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const r = await fetch("/api/comm"); const d = await r.json()
            if (!r.ok) throw new Error(d?.error || "Could not load")
            setInfo(d); setSettings(d.settings); setDirty(false)
        } catch (e: any) { toast.error(e.message) } finally { setLoading(false) }
    }, [])
    useEffect(() => { load() }, [load])

    const patchEvent = (key: string, ch: Channel, p: Record<string, unknown>) => {
        setSettings(s => s ? { ...s, events: { ...s.events, [key]: { ...s.events[key], [ch]: { ...s.events[key][ch], ...p } } } } : s)
        setDirty(true)
    }
    const save = async () => {
        if (!settings) return
        setSaving(true)
        try {
            const r = await fetch("/api/comm", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) })
            const d = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(d?.error || "Could not save")
            setSettings(d.settings); setDirty(false); toast.success("Saved")
        } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
    }

    if (session && !canAny(session, ["whatsapp.view", "whatsapp.edit"])) return <div className="p-8 text-center text-sm text-[var(--text3)]">Access denied</div>

    const tabs: [Tab, string][] = [["events", "Events"], ["channels", "Channels"], ["log", "Message log"], ["optouts", "Opt-outs"]]
    return (
        <div className="flex flex-col gap-5 p-4 pb-24 lg:p-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8effe] text-[#0b5cff]"><Megaphone size={20} /></div>
                    <div>
                        <h1 className="m-0 text-2xl font-bold tracking-tight text-[var(--text)]">Communication Center</h1>
                        <p className="m-0 mt-0.5 text-[13px] text-[var(--text3)]">What employees and customers are told, and on which channel — WhatsApp, email, in-app.</p>
                    </div>
                </div>
                {info && (
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                        <ChannelPill ok={info.whatsapp.connected} label="WhatsApp" />
                        <ChannelPill ok={info.email.configured} label={`Email${info.email.configured ? ` · ${info.email.provider}` : ""}`} />
                        <button onClick={load} aria-label="Refresh" className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text2)]"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /></button>
                    </div>
                )}
            </div>

            <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)]">
                {tabs.map(([k, l]) => (
                    <button key={k} onClick={() => setTab(k)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-semibold ${tab === k ? "border-[#0b5cff] text-[#0b5cff]" : "border-transparent text-[var(--text3)] hover:text-[var(--text)]"}`}>{l}</button>
                ))}
            </div>

            {loading && !info ? (
                <div className="flex items-center justify-center gap-2 p-10 text-sm text-[var(--text3)]"><Loader2 size={16} className="animate-spin" /> Loading…</div>
            ) : info && settings && (
                <>
                    {!info.installed && <div className="rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-[13px] text-[#92400e]">The message tables aren&apos;t created on the database yet (scripts/comm.sql) — nothing can be sent until they are.</div>}
                    {tab === "events" && <EventsTab info={info} settings={settings} canEdit={canEdit} patch={patchEvent} />}
                    {tab === "channels" && <ChannelsTab info={info} settings={settings} canEdit={canEdit} set={(p) => { setSettings(s => s ? { ...s, ...p } : s); setDirty(true) }} />}
                    {tab === "log" && <LogTab info={info} canEdit={canEdit} onChanged={load} />}
                    {tab === "optouts" && <OptOutsTab canEdit={canEdit} />}
                </>
            )}

            {canEdit && dirty && (tab === "events" || tab === "channels") && (
                <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 shadow-lg">
                    <span className="text-[13px] text-[var(--text2)]">Unsaved changes</span>
                    <button onClick={load} className="h-8 rounded-lg border border-[var(--border)] px-3 text-xs font-semibold text-[var(--text2)]">Discard</button>
                    <button onClick={save} disabled={saving} className="flex h-8 items-center gap-1.5 rounded-lg bg-[#0b5cff] px-3 text-xs font-semibold text-white disabled:opacity-60">{saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save</button>
                </div>
            )}
        </div>
    )
}

function ChannelPill({ ok, label }: { ok: boolean; label: string }) {
    return ok
        ? <span className="flex items-center gap-1 rounded-full border border-[#bbf7d0] bg-[#dcfce7] px-2.5 py-1 text-[#15803d]"><CheckCircle2 size={12} /> {label}</span>
        : <span className="flex items-center gap-1 rounded-full border border-[#fde68a] bg-[#fffbeb] px-2.5 py-1 text-[#b45309]"><AlertTriangle size={12} /> {label} not set up</span>
}

const card = "rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm"
const input = "h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none"

// ─── Events ──────────────────────────────────────────────────────────────────
function EventsTab({ info, settings, canEdit, patch }: { info: Info; settings: Settings; canEdit: boolean; patch: (k: string, c: Channel, p: Record<string, unknown>) => void }) {
    const [open, setOpen] = useState<string | null>(null)
    const groups: { key: "employee" | "customer"; label: string; icon: typeof Users }[] = [
        { key: "employee", label: "To employees", icon: Users },
        { key: "customer", label: "To customers", icon: Building2 },
    ]
    return (
        <div className="flex flex-col gap-4">
            {groups.map(gr => (
                <div key={gr.key} className={card}>
                    <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface2)] px-4 py-2.5">
                        <span className="flex items-center gap-2 text-sm font-bold text-[var(--text)]"><gr.icon size={15} className="text-[var(--accent)]" /> {gr.label}</span>
                        <span className="hidden gap-6 pr-10 text-[11px] font-bold uppercase tracking-wide text-[var(--text3)] sm:flex">{(["whatsapp", "email", "inapp"] as Channel[]).map(c => <span key={c} className="w-16 text-center">{CH_LABEL[c]}</span>)}</span>
                    </div>
                    <div className="divide-y divide-[var(--border)]">
                        {info.events.filter(e => e.audience === gr.key).map(ev => {
                            const s = settings.events[ev.key]
                            const isOpen = open === ev.key
                            return (
                                <div key={ev.key}>
                                    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                                        <button onClick={() => setOpen(isOpen ? null : ev.key)} className="flex min-w-0 flex-1 items-start gap-2 text-left">
                                            {isOpen ? <ChevronDown size={15} className="mt-0.5 shrink-0 text-[var(--text3)]" /> : <ChevronRight size={15} className="mt-0.5 shrink-0 text-[var(--text3)]" />}
                                            <span className="min-w-0">
                                                <span className="block text-[13.5px] font-semibold text-[var(--text)]">{ev.label}{ev.connected === false && <span className="ml-2 rounded-full bg-[var(--surface2)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--text3)]">Not connected yet</span>}</span>
                                                <span className="block text-[11.5px] text-[var(--text3)]">{ev.description}</span>
                                            </span>
                                        </button>
                                        <div className="flex gap-6 pl-6 sm:pl-0 sm:pr-10">
                                            {(["whatsapp", "email", "inapp"] as Channel[]).map(c => {
                                                const Icon = CH_ICON[c]
                                                if (c === "inapp" && ev.inappBuiltIn) return (
                                                    <span key={c} title="This module already puts it in the bell" className="flex w-16 flex-col items-center gap-1 text-[10.5px] font-semibold text-[#16a34a]"><Icon size={14} /> Always</span>
                                                )
                                                const needsTemplate = c === "whatsapp" && !s.whatsapp.template
                                                const on = s[c].enabled
                                                return (
                                                    <label key={c} title={needsTemplate ? "Choose a WhatsApp template first (open the event)" : `${CH_LABEL[c]} ${on ? "on" : "off"}`}
                                                        className={`flex w-16 cursor-pointer flex-col items-center gap-1 ${needsTemplate || !canEdit ? "cursor-not-allowed opacity-50" : ""}`}>
                                                        <Icon size={14} className={on ? "text-[#16a34a]" : "text-[var(--text3)]"} />
                                                        <input type="checkbox" className="h-4 w-4 accent-[#16a34a]" disabled={!canEdit || needsTemplate} checked={on}
                                                            onChange={e => patch(ev.key, c, { enabled: e.target.checked })} aria-label={`${ev.label} — ${CH_LABEL[c]}`} />
                                                    </label>
                                                )
                                            })}
                                        </div>
                                    </div>
                                    {isOpen && <EventEditor ev={ev} s={s} info={info} canEdit={canEdit} patch={(c, p) => patch(ev.key, c, p)} />}
                                </div>
                            )
                        })}
                    </div>
                </div>
            ))}
            <p className="m-0 text-[11.5px] text-[var(--text3)]">Everything starts switched off. An event is sent only on the channels ticked here — and only once the feature that raises it is connected (customer reports and employee events come in the next phases).</p>
        </div>
    )
}

function EventEditor({ ev, s, info, canEdit, patch }: { ev: CommEvent; s: EventChannels; info: Info; canEdit: boolean; patch: (c: Channel, p: Record<string, unknown>) => void }) {
    const sample = useMemo(() => sampleData(ev), [ev])
    const approved = info.whatsapp.templates.filter(t => t.status === "APPROVED")
    const tpl = approved.find(t => t.name === s.whatsapp.template && t.language === s.whatsapp.language)
    const [test, setTest] = useState<{ channel: Channel; to: string; busy: boolean }>({ channel: "email", to: "", busy: false })
    const insert = (key: string) => patch("email", { body: `${s.email.body}{${key}}` })

    const sendTest = async () => {
        setTest(t => ({ ...t, busy: true }))
        try {
            const r = await fetch("/api/comm/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: ev.key, channel: test.channel, to: test.to }) })
            const d = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(d?.error || "Not sent")
            toast.success(test.channel === "inapp" ? "Sent — check your bell" : "Sent — see the Message log")
        } catch (e: any) { toast.error(e.message) } finally { setTest(t => ({ ...t, busy: false })) }
    }

    return (
        <div className="grid gap-4 border-t border-[var(--border)] bg-[var(--surface2)] px-4 py-4 lg:grid-cols-2">
            {/* WhatsApp */}
            <div className="flex flex-col gap-2">
                <p className="m-0 flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--text)]"><MessageCircle size={14} /> WhatsApp template</p>
                <select className={input} disabled={!canEdit} value={s.whatsapp.template ? `${s.whatsapp.template}|${s.whatsapp.language}` : ""}
                    onChange={e => { const [template, language] = e.target.value.split("|"); patch("whatsapp", { template: template ?? "", language: language ?? "en", enabled: template ? s.whatsapp.enabled : false }) }}>
                    <option value="">— Choose an approved template —</option>
                    {s.whatsapp.template && !tpl && <option value={`${s.whatsapp.template}|${s.whatsapp.language}`}>{s.whatsapp.template} ({s.whatsapp.language}) — not approved / not found</option>}
                    {approved.map(t => <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>{t.name} ({t.language}) · {t.category.toLowerCase()}</option>)}
                </select>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 text-[11.5px] text-[var(--text2)]">
                    <div className="mb-1 font-semibold text-[var(--text)]">Create it in Meta with these values:</div>
                    {ev.waParams.map((k, i) => <div key={k}><code className="font-semibold">{`{{${i + 1}}}`}</code> = {ev.vars.find(v => v.key === k)?.label} <span className="text-[var(--text3)]">(e.g. {sample[k]})</span></div>)}
                    {ev.waDocument && <div className="mt-1 text-[#b45309]">Header: <b>Document</b> (the PDF is attached automatically).</div>}
                    {tpl && <div className="mt-2 border-t border-[var(--border)] pt-2 italic text-[var(--text3)]">“{tpl.body}”</div>}
                    {tpl && tpl.params !== ev.waParams.length && <div className="mt-1 text-[#dc2626]">This template has {tpl.params} value(s); this event fills {ev.waParams.length}.</div>}
                </div>
            </div>

            {/* Email */}
            <div className="flex flex-col gap-2">
                <p className="m-0 flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--text)]"><Mail size={14} /> Email (also used for the in-app text)</p>
                <input className={input} disabled={!canEdit} value={s.email.subject} onChange={e => patch("email", { subject: e.target.value })} placeholder="Subject" />
                <textarea className="min-h-[120px] rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-[13px] leading-relaxed text-[var(--text)] outline-none" disabled={!canEdit}
                    value={s.email.body} onChange={e => patch("email", { body: e.target.value })} />
                <div className="flex flex-wrap gap-1">
                    {ev.vars.map(v => (
                        <button key={v.key} disabled={!canEdit} onClick={() => insert(v.key)} title={`Insert ${v.label}`}
                            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--text2)] hover:border-[#0b5cff] hover:text-[#0b5cff]">{`{${v.key}}`}</button>
                    ))}
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-[12px]">
                    <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-[var(--text3)]">Preview</div>
                    <div className="font-semibold text-[var(--text)]">{fillTemplate(s.email.subject, sample)}</div>
                    <div className="mt-1 whitespace-pre-line text-[var(--text2)]">{fillTemplate(s.email.body, sample)}</div>
                </div>
            </div>

            {canEdit && (
                <div className="flex flex-wrap items-end gap-2 lg:col-span-2">
                    <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--text3)]">Test on
                        <select className={input} value={test.channel} onChange={e => setTest(t => ({ ...t, channel: e.target.value as Channel }))}>
                            <option value="email">Email</option><option value="whatsapp" disabled={!s.whatsapp.template || ev.waDocument}>WhatsApp</option><option value="inapp">In-app (to me)</option>
                        </select>
                    </label>
                    {test.channel !== "inapp" && (
                        <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--text3)]">{test.channel === "email" ? "Email address" : "Mobile"}
                            <input className={`${input} w-56`} value={test.to} onChange={e => setTest(t => ({ ...t, to: e.target.value }))} placeholder={test.channel === "email" ? "you@company.com" : "10-digit number"} />
                        </label>
                    )}
                    <button onClick={sendTest} disabled={test.busy || (test.channel !== "inapp" && !test.to.trim())}
                        className="flex h-9 items-center gap-1.5 rounded-lg bg-[#0b5cff] px-3 text-[13px] font-semibold text-white disabled:opacity-50">
                        {test.busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send test
                    </button>
                    <span className="pb-2 text-[11px] text-[var(--text3)]">Uses the saved settings and sample values{test.channel === "email" ? " — save first if you changed the wording" : ""}.</span>
                </div>
            )}
        </div>
    )
}

// ─── Channels ────────────────────────────────────────────────────────────────
function ChannelsTab({ info, settings, canEdit, set }: { info: Info; settings: Settings; canEdit: boolean; set: (p: Partial<Settings>) => void }) {
    const wa = info.whatsapp
    const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => toast.success("Copied")).catch(() => {})
    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <div className={card}>
                <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface2)] px-4 py-2.5 text-sm font-bold text-[var(--text)]"><span className="flex items-center gap-2"><MessageCircle size={15} /> WhatsApp (Meta Cloud API)</span><ChannelPill ok={wa.connected} label="WhatsApp" /></div>
                <div className="flex flex-col gap-3 p-4 text-[12.5px]">
                    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                        {WA_ENV.map(([k, l]) => (
                            <li key={k} className="flex items-start gap-2">{wa.env[k] ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[#16a34a]" /> : <Circle size={15} className="mt-0.5 shrink-0 text-[var(--text3)]" />}
                                <span><code className="rounded bg-[var(--surface2)] px-1 text-[11.5px] font-semibold">{k}</code> <span className="text-[var(--text3)]">— {l}</span></span></li>
                        ))}
                    </ul>
                    <div>
                        <div className="mb-1 font-semibold text-[var(--text)]">Webhook (Meta app → WhatsApp → Configuration)</div>
                        <div className="flex gap-2"><code className="min-w-0 flex-1 truncate rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-2.5 py-2 text-[12px]">{wa.webhookUrl}</code>
                            <button onClick={() => copy(wa.webhookUrl)} className="flex h-9 items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 text-xs font-semibold text-[var(--text2)]"><Copy size={13} /> Copy</button></div>
                        <div className="mt-1 text-[11.5px] text-[var(--text3)]">Verify token = WHATSAPP_VERIFY_TOKEN. Subscribe to <b>messages</b>.</div>
                    </div>
                    <div>
                        <div className="mb-1 font-semibold text-[var(--text)]">Connected number</div>
                        {!wa.connected ? <span className="text-[var(--text3)]">Not connected.</span>
                            : wa.phone?.error ? <span className="text-[#dc2626]">Meta says: {wa.phone.error}</span>
                            : <span className="text-[var(--text2)]"><b className="text-[var(--text)]">{wa.phone?.display_phone_number}</b> · {wa.phone?.verified_name} · quality {wa.phone?.quality_rating ?? "—"}</span>}
                        {wa.templatesError && wa.connected && <div className="mt-1 text-[#b45309]">Templates: {wa.templatesError}</div>}
                        {wa.connected && <div className="mt-1 text-[var(--text3)]">{wa.templates.filter(t => t.status === "APPROVED").length} approved template(s).</div>}
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-4">
                <div className={card}>
                    <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface2)] px-4 py-2.5 text-sm font-bold text-[var(--text)]"><span className="flex items-center gap-2"><Mail size={15} /> Email</span><ChannelPill ok={info.email.configured} label="Email" /></div>
                    <div className="flex flex-col gap-3 p-4 text-[12.5px] text-[var(--text2)]">
                        <div>Sending through <b className="text-[var(--text)]">{info.email.provider === "smtp" ? "SMTP service" : "Gmail"}</b>{info.email.from ? <> as <b className="text-[var(--text)]">{info.email.from}</b></> : null}.</div>
                        {info.email.provider !== "smtp" && <div className="rounded-lg border border-[#fde68a] bg-[#fffbeb] p-2.5 text-[11.5px] text-[#92400e]">Gmail allows about 500 emails a day and bulk mail may land in spam. For broadcasts, use a business email service (Amazon SES, Zoho ZeptoMail, Resend…): set <code>EMAIL_PROVIDER=smtp</code>, <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code>, <code>EMAIL_FROM</code> in Vercel.</div>}
                        <label className="flex flex-col gap-1 font-semibold text-[var(--text3)]">Sender name
                            <input className={input} disabled={!canEdit} value={settings.emailFromName} placeholder="Growus Auto India Pvt. Ltd." onChange={e => set({ emailFromName: e.target.value })} />
                        </label>
                    </div>
                </div>
                <div className={card}>
                    <div className="border-b border-[var(--border)] bg-[var(--surface2)] px-4 py-2.5 text-sm font-bold text-[var(--text)]">Quiet hours</div>
                    <div className="flex flex-col gap-2 p-4 text-[12.5px] text-[var(--text2)]">
                        <span>WhatsApp messages to employees wait until quiet hours end. Customer messages and email go at once.</span>
                        <div className="flex flex-wrap items-center gap-2">
                            <span>From</span><input type="time" className={input} disabled={!canEdit} value={settings.quietStart} onChange={e => set({ quietStart: e.target.value })} />
                            <span>to</span><input type="time" className={input} disabled={!canEdit} value={settings.quietEnd} onChange={e => set({ quietEnd: e.target.value })} />
                            {canEdit && <button onClick={() => set({ quietStart: "", quietEnd: "" })} className="text-[11.5px] font-semibold text-[var(--text3)] hover:text-[#dc2626]">No quiet hours</button>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─── Message log ─────────────────────────────────────────────────────────────
function LogTab({ info, canEdit, onChanged }: { info: Info; canEdit: boolean; onChanged: () => void }) {
    const [f, setF] = useState({ channel: "", status: "", event: "", audience: "", q: "", page: 1 })
    const [data, setData] = useState<{ rows: Msg[]; total: number; page: number; pages: number }>({ rows: [], total: 0, page: 1, pages: 0 })
    const [busy, setBusy] = useState<string | null>(null)
    const load = useCallback(async () => {
        const qs = new URLSearchParams({ page: String(f.page) })
        for (const k of ["channel", "status", "event", "audience", "q"] as const) if (f[k]) qs.set(k, f[k])
        const r = await fetch(`/api/comm/messages?${qs}`); const d = await r.json().catch(() => ({}))
        if (r.ok) setData(d)
    }, [f])
    useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

    const resend = async (id: string) => {
        setBusy(id)
        try {
            const r = await fetch("/api/comm/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
            const d = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(d?.error || "Failed")
            if (d.ok) toast.success("Sent"); else toast.error(d.error || `Status: ${d.status}`)
            load()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
    }
    const runQueue = async () => {
        setBusy("queue")
        try {
            const r = await fetch("/api/comm/worker", { method: "POST" }); const d = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(d?.error || "Failed")
            toast.success(`Processed ${d.processed}: ${d.sent} sent, ${d.failed} failed${d.remaining ? `, ${d.remaining} still due` : ""}`)
            load(); onChanged()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
    }
    const total = (ch: string, st: string[]) => info.counts.filter(c => c.channel === ch && st.includes(c.status)).reduce((t, c) => t + c.n, 0)
    const evLabel = (k: string) => info.events.find(e => e.key === k)?.label ?? k

    return (
        <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-4">
                {(["whatsapp", "email", "inapp"] as Channel[]).map(c => {
                    const Icon = CH_ICON[c]
                    return (
                        <div key={c} className={`${card} p-3`}>
                            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--text3)]"><Icon size={13} /> {CH_LABEL[c]} · 30 days</div>
                            <div className="mt-1 text-lg font-bold text-[var(--text)]">{total(c, ["sent", "delivered", "read"])} <span className="text-[12px] font-semibold text-[var(--text3)]">sent</span></div>
                            <div className="text-[11.5px] text-[var(--text3)]">{c === "whatsapp" ? `${total(c, ["read"])} read · ` : ""}{total(c, ["failed"])} failed · {total(c, ["skipped"])} skipped</div>
                        </div>
                    )
                })}
                <div className={`${card} flex flex-col justify-between p-3`}>
                    <div className="text-[12px] font-semibold text-[var(--text3)]">Queue</div>
                    <div className="text-[13px] text-[var(--text2)]"><b className="text-[var(--text)]">{info.queue.due}</b> due · <b className="text-[var(--text)]">{info.queue.waiting}</b> waiting (quiet hours / retry)</div>
                    {canEdit && <button onClick={runQueue} disabled={busy === "queue"} className="mt-1 flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] text-xs font-semibold text-[var(--text2)] disabled:opacity-50">{busy === "queue" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Process queue now</button>}
                </div>
            </div>

            <div className={card}>
                <div className="flex flex-wrap gap-2 border-b border-[var(--border)] p-3">
                    <select className={input} value={f.channel} onChange={e => setF(x => ({ ...x, channel: e.target.value, page: 1 }))}><option value="">All channels</option>{(["whatsapp", "email", "inapp"] as Channel[]).map(c => <option key={c} value={c}>{CH_LABEL[c]}</option>)}</select>
                    <select className={input} value={f.status} onChange={e => setF(x => ({ ...x, status: e.target.value, page: 1 }))}><option value="">All statuses</option>{Object.keys(STATUS).map(s => <option key={s} value={s}>{s}</option>)}</select>
                    <select className={input} value={f.audience} onChange={e => setF(x => ({ ...x, audience: e.target.value, page: 1 }))}><option value="">Employees & customers</option><option value="employee">Employees</option><option value="customer">Customers</option></select>
                    <select className={input} value={f.event} onChange={e => setF(x => ({ ...x, event: e.target.value, page: 1 }))}><option value="">All events</option>{info.events.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}</select>
                    <input className={`${input} min-w-[180px] flex-1`} placeholder="Search name, number, email, subject…" value={f.q} onChange={e => setF(x => ({ ...x, q: e.target.value, page: 1 }))} />
                </div>
                {data.rows.length === 0 ? <p className="m-0 p-8 text-center text-sm text-[var(--text3)]">No messages yet.</p> : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-[12.5px]">
                            <thead className="bg-[var(--surface2)] text-left text-[var(--text2)]"><tr>{["When", "To", "Channel", "Event", "Status", "Delivered", "Read", ""].map(h => <th key={h} className="whitespace-nowrap px-3 py-2 font-bold">{h}</th>)}</tr></thead>
                            <tbody>
                                {data.rows.map(m => {
                                    const Icon = CH_ICON[m.channel as Channel] ?? Mail
                                    return (
                                        <tr key={m.id} className="border-t border-[var(--border)] align-top">
                                            <td className="whitespace-nowrap px-3 py-2 text-[var(--text2)]">{fmt(m.createdAt)}</td>
                                            <td className="px-3 py-2"><span className="font-semibold text-[var(--text)]">{m.recipientName || "—"}</span><span className="block text-[11px] text-[var(--text3)]">{m.channel === "inapp" ? "App" : m.channel === "whatsapp" && m.toAddress ? `+${m.toAddress}` : m.toAddress} · {m.recipientType}</span></td>
                                            <td className="whitespace-nowrap px-3 py-2 text-[var(--text2)]"><span className="flex items-center gap-1"><Icon size={13} /> {CH_LABEL[m.channel as Channel] ?? m.channel}</span></td>
                                            <td className="px-3 py-2 text-[var(--text2)]">{evLabel(m.event)}{m.subject && <span className="block max-w-[260px] truncate text-[11px] text-[var(--text3)]">{m.subject}</span>}</td>
                                            <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${STATUS[m.status] ?? STATUS.queued}`}>{m.status}</span>
                                                {m.status === "queued" && new Date(m.nextAttemptAt) > new Date() && <span className="block text-[10.5px] text-[var(--text3)]">at {fmt(m.nextAttemptAt)}</span>}
                                                {m.error && <span className="mt-1 block max-w-[260px] text-[11px] text-[#dc2626]">{m.error}</span>}</td>
                                            <td className="whitespace-nowrap px-3 py-2 text-[var(--text2)]">{fmt(m.deliveredAt)}</td>
                                            <td className="whitespace-nowrap px-3 py-2 text-[var(--text2)]">{fmt(m.readAt)}</td>
                                            <td className="px-3 py-2 text-right">{canEdit && ["failed", "skipped"].includes(m.status) && m.toAddress && (
                                                <button onClick={() => resend(m.id)} disabled={busy === m.id} className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] font-semibold text-[var(--text2)] hover:border-[#0b5cff] hover:text-[#0b5cff] disabled:opacity-50">
                                                    {busy === m.id ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />} Resend</button>)}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                {data.pages > 1 && (
                    <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--text3)]">
                        <span>{data.total} messages</span>
                        <span className="flex gap-2">
                            <button disabled={f.page <= 1} onClick={() => setF(x => ({ ...x, page: x.page - 1 }))} className="rounded border border-[var(--border)] px-2 py-1 disabled:opacity-40">Prev</button>
                            <span className="py-1">Page {data.page} of {data.pages}</span>
                            <button disabled={f.page >= data.pages} onClick={() => setF(x => ({ ...x, page: x.page + 1 }))} className="rounded border border-[var(--border)] px-2 py-1 disabled:opacity-40">Next</button>
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}

// ─── Opt-outs ────────────────────────────────────────────────────────────────
function OptOutsTab({ canEdit }: { canEdit: boolean }) {
    const [rows, setRows] = useState<OptOut[]>([])
    const [form, setForm] = useState({ channel: "whatsapp", address: "", reason: "" })
    const [busy, setBusy] = useState(false)
    const load = useCallback(async () => { const r = await fetch("/api/comm/optouts"); const d = await r.json().catch(() => ({})); if (r.ok) setRows(d.rows ?? []) }, [])
    useEffect(() => { load() }, [load])
    const add = async () => {
        setBusy(true)
        try {
            const r = await fetch("/api/comm/optouts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
            const d = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(d?.error || "Failed")
            setForm(f => ({ ...f, address: "", reason: "" })); toast.success("Added"); load()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    const remove = async (id: string) => {
        if (!confirm("Let this person receive messages on this channel again?")) return
        const r = await fetch(`/api/comm/optouts?id=${id}`, { method: "DELETE" })
        if (r.ok) { toast.success("Removed"); load() } else toast.error("Could not remove")
    }
    return (
        <div className={card}>
            <div className="border-b border-[var(--border)] bg-[var(--surface2)] px-4 py-2.5 text-sm font-bold text-[var(--text)]">People who don&apos;t want messages</div>
            {canEdit && (
                <div className="flex flex-wrap items-end gap-2 border-b border-[var(--border)] p-3">
                    <select className={input} value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select>
                    <input className={`${input} w-56`} placeholder={form.channel === "whatsapp" ? "Mobile number" : "Email address"} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                    <input className={`${input} min-w-[160px] flex-1`} placeholder="Reason (optional)" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
                    <button onClick={add} disabled={busy || !form.address.trim()} className="flex h-9 items-center gap-1.5 rounded-lg bg-[#0b5cff] px-3 text-[13px] font-semibold text-white disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" /> : null} Add</button>
                </div>
            )}
            {rows.length === 0 ? <p className="m-0 p-8 text-center text-sm text-[var(--text3)]">Nobody has opted out.</p> : (
                <table className="w-full border-collapse text-[12.5px]">
                    <thead className="bg-[var(--surface2)] text-left text-[var(--text2)]"><tr>{["Channel", "Address", "Reason", "Since", ""].map(h => <th key={h} className="px-3 py-2 font-bold">{h}</th>)}</tr></thead>
                    <tbody>{rows.map(o => (
                        <tr key={o.id} className="border-t border-[var(--border)]">
                            <td className="px-3 py-2 text-[var(--text2)]">{CH_LABEL[o.channel as Channel] ?? o.channel}</td>
                            <td className="px-3 py-2 font-semibold text-[var(--text)]">{o.channel === "whatsapp" ? `+${o.address}` : o.address}</td>
                            <td className="px-3 py-2 text-[var(--text2)]">{o.reason || "—"}</td>
                            <td className="px-3 py-2 text-[var(--text2)]">{fmt(o.createdAt)}</td>
                            <td className="px-3 py-2 text-right">{canEdit && <button onClick={() => remove(o.id)} aria-label="Remove" className="text-[var(--text3)] hover:text-[#dc2626]"><Trash2 size={14} /></button>}</td>
                        </tr>
                    ))}</tbody>
                </table>
            )}
        </div>
    )
}
