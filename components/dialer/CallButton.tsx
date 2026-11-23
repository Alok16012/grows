"use client"

// Click-to-call from anywhere in the ERP. The call is placed by the user's paired phone
// (Growus Dialer app): laptop click → phone dials → call syncs back → "What happened?" form.
// Inside the app itself the phone dials at once through the app bridge.
// While the call is on, the panel shows the call script; after it, WhatsApp follow-up messages.
import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, ChevronUp, FileText, Loader2, MessageCircle, Phone, PhoneOff, Smartphone, X } from "lucide-react"
import { COMPANY } from "@/lib/company"
import { fillText, fmtDur, forTarget, type DialerSettings, type Outcome, type TargetType } from "@/lib/dialer"

declare global { interface Window { GrowusDialer?: { dial: (phone: string, requestId: string) => void; isApp?: () => boolean } } }

type Call = { id: string; connected: boolean; durationSec: number; outcome: string | null; notes?: string | null; targetName?: string | null; targetType?: string; phone?: string }

// Settings + my name, loaded once per page.
type Ctx = { settings: DialerSettings | null; me: string }
let ctxCache: Promise<Ctx> | null = null
export function loadDialerCtx(): Promise<Ctx> {
    ctxCache ??= Promise.all([
        fetch("/api/dialer/settings").then(r => r.json()).then(j => j?.settings ?? null),
        fetch("/api/dialer/meta").then(r => r.json()).then(j => j?.name ?? "").catch(() => ""),
    ]).then(([settings, me]) => ({ settings, me })).catch(() => { ctxCache = null; return { settings: null, me: "" } })
    return ctxCache
}
export function loadOutcomes(): Promise<Outcome[]> { return loadDialerCtx().then(c => c.settings?.outcomes ?? []) }
function useDialerCtx() {
    const [c, setC] = useState<Ctx>({ settings: null, me: "" })
    useEffect(() => { loadDialerCtx().then(setC) }, [])
    return c
}

/** WhatsApp click-to-chat link (opens the WhatsApp app on a phone, WhatsApp Web on a laptop). Indian 10-digit numbers get +91. */
export function waLink(phone: string, text: string) {
    let d = String(phone).replace(/\D/g, "")
    if (d.length === 11 && d.startsWith("0")) d = d.slice(1)
    if (d.length === 10) d = "91" + d
    return `https://wa.me/${d}?text=${encodeURIComponent(text)}`
}

const btnS = "inline-flex items-center justify-center gap-1 rounded-[8px] border border-[var(--border)] bg-white text-[var(--text2)] hover:bg-green-50 hover:text-green-700 hover:border-green-300 font-semibold disabled:opacity-50"

export function CallButton({ phone, targetType, targetId, name, label, className }: { phone: string | null | undefined; targetType?: TargetType; targetId?: string; name?: string; label?: string; className?: string }) {
    const [open, setOpen] = useState(false)
    if (!phone) return null
    return (
        <>
            <button type="button" onClick={e => { e.stopPropagation(); setOpen(true) }} className={className ?? `${btnS} h-8 px-2.5 text-[12px]`} title={`Call ${name ?? phone} from your phone`} aria-label={`Call ${name ?? phone}`}>
                <Phone size={12} />{label}
            </button>
            {open && <CallPanel phone={phone} targetType={targetType} targetId={targetId} name={name} onClose={() => setOpen(false)} />}
        </>
    )
}

// Start a call from code that is not a component (e.g. a contact-channel helper). CallHost (in the dashboard layout) opens the panel.
type CallReq = { phone: string; targetType?: TargetType; targetId?: string; name?: string }
export function startCall(r: CallReq) { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<CallReq>("growus:call", { detail: r })) }
export function CallHost() {
    const [r, setR] = useState<(CallReq & { n: number }) | null>(null)
    useEffect(() => { const h = (e: Event) => setR({ ...(e as CustomEvent<CallReq>).detail, n: Date.now() }); window.addEventListener("growus:call", h); return () => window.removeEventListener("growus:call", h) }, [])
    return r ? <CallPanel key={r.n} phone={r.phone} targetType={r.targetType} targetId={r.targetId} name={r.name} onClose={() => setR(null)} /> : null
}

type State = { step: "starting" | "waiting" | "dialing" | "done" | "error" | "pair"; msg?: string; requestId?: string; deviceName?: string | null; online?: boolean; call?: Call | null }
/** How a call panel ended — auto-dial uses it to go on or stop. */
export type CallEnd = "saved" | "closed" | "failed"

export function CallPanel({ phone, targetType, targetId, name, onClose, onDone, banner }: {
    phone: string; targetType?: TargetType; targetId?: string; name?: string; onClose: () => void
    onDone?: (how: CallEnd) => void; banner?: React.ReactNode
}) {
    const [s, setS] = useState<State>({ step: "starting" })
    const [mounted, setMounted] = useState(false)
    const started = useRef(false)
    const finish = (how: CallEnd) => { onDone?.(how); onClose() }
    useEffect(() => setMounted(true), [])
    useEffect(() => {
        if (started.current) return
        started.current = true
        ;(async () => {
            const r = await fetch("/api/dialer/dial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, targetType, targetId }) })
            const j = await r.json().catch(() => ({}))
            if (r.status === 403) { window.location.href = `tel:${phone}`; onDone?.("failed"); onClose(); return }
            if (!r.ok) { setS({ step: j?.needsPairing ? "pair" : "error", msg: j?.error }); return }
            if (window.GrowusDialer) { try { window.GrowusDialer.dial(phone, j.id) } catch {} }
            setS({ step: "waiting", requestId: j.id, deviceName: j.deviceName, online: j.online })
        })().catch(() => setS({ step: "error", msg: "Network error" }))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    // Follow the request until the call has synced (up to 30 minutes for long calls).
    useEffect(() => {
        if (!s.requestId || s.step === "done" || s.step === "error") return
        const t0 = Date.now()
        const t = setInterval(async () => {
            if (Date.now() - t0 > 30 * 60_000) { clearInterval(t); return }
            const j = await fetch(`/api/dialer/dial?id=${s.requestId}`).then(r => r.json()).catch(() => null)
            if (!j) return
            if (j.status === "DIALING") setS(p => p.step === "waiting" ? { ...p, step: "dialing" } : p)
            else if (j.status === "DONE" && j.call) { clearInterval(t); setS(p => ({ ...p, step: "done", call: j.call })) }
            else if (j.status === "EXPIRED" || j.status === "FAILED") { clearInterval(t); setS(p => ({ ...p, step: "error", msg: j.status === "EXPIRED" ? "Your phone did not pick up the request in 2 minutes. Open the Growus Dialer app on your phone and check it is online." : "Your phone could not place the call." })) }
        }, 2000)
        return () => clearInterval(t)
    }, [s.requestId, s.step])
    const cancel = async () => { if (s.requestId && s.step === "waiting") await fetch(`/api/dialer/dial?id=${s.requestId}`, { method: "DELETE" }).catch(() => {}); finish(s.step === "error" || s.step === "pair" ? "failed" : "closed") }
    if (!mounted) return null
    return createPortal(
        <div className="fixed bottom-4 right-4 z-[80] w-[380px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[14px] border border-[var(--border)] bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            {banner}
            <div className="flex items-center justify-between px-4 pt-3">
                <div className="min-w-0">
                    <div className="text-[14px] font-bold text-[var(--text)] truncate">{name || phone}</div>
                    <div className="text-[12px] text-[var(--text3)] tabular-nums">{phone}</div>
                </div>
                <button onClick={cancel} className="p-1 rounded hover:bg-gray-100" aria-label="Close"><X size={16} /></button>
            </div>
            <div className="p-4 pt-3 text-[13px] space-y-3">
                {s.step === "starting" && <div className="flex items-center gap-2 text-[var(--text2)]"><Loader2 size={15} className="animate-spin" /> Sending to your phone…</div>}
                {(s.step === "waiting" || s.step === "dialing") && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 font-semibold text-green-700">
                            {s.step === "dialing" ? <Phone size={15} className="animate-pulse" /> : <Smartphone size={15} className="animate-pulse" />}
                            {s.step === "dialing" ? "Calling from your phone…" : `Waiting for ${s.deviceName || "your phone"}…`}
                        </div>
                        {s.step === "waiting" && s.online === false && <p className="text-[12px] text-amber-700">Your phone has not checked in for a while. Open the Growus Dialer app on it.</p>}
                        <p className="text-[12px] text-[var(--text3)]">When the call ends it syncs here and you can note what happened.</p>
                    </div>
                )}
                {s.step === "pair" && (
                    <div className="space-y-2">
                        <p className="text-[var(--text2)]">{s.msg}</p>
                        <div className="flex gap-2">
                            <a href="/dialer?tab=phone" className="h-8 px-3 rounded-[8px] bg-[var(--accent)] text-white text-[12px] font-semibold inline-flex items-center">Pair my phone</a>
                            <a href={`tel:${phone}`} className="h-8 px-3 rounded-[8px] border border-[var(--border)] text-[12px] font-semibold inline-flex items-center">Call from this device</a>
                        </div>
                    </div>
                )}
                {s.step === "error" && <div className="flex items-start gap-2 text-red-700"><PhoneOff size={15} className="mt-0.5 shrink-0" /> {s.msg || "Could not call"}</div>}
                {s.step !== "done" && s.step !== "pair" && <Script targetType={targetType} name={name} />}
                {s.step === "done" && s.call && <OutcomeForm call={{ ...s.call, phone, targetName: name ?? null, targetType }} onSaved={() => finish("saved")} />}
            </div>
        </div>, document.body)
}

/** The talking points for this kind of call, with the person's name filled in. */
function Script({ targetType, name }: { targetType?: string; name?: string }) {
    const { settings, me } = useDialerCtx()
    const list = useMemo(() => forTarget(settings?.scripts ?? [], targetType ?? "UNKNOWN"), [settings, targetType])
    const [open, setOpen] = useState(true)
    const [pick, setPick] = useState(0)
    if (!list.length) return null
    const sc = list[Math.min(pick, list.length - 1)]
    return (
        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface2)]/40">
            <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2 text-[12.5px] font-semibold text-[var(--text)]">
                <span className="inline-flex items-center gap-1.5"><FileText size={13} /> Script{list.length === 1 ? `: ${sc.title}` : ""}</span>{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {open && (
                <div className="px-3 pb-3 space-y-2">
                    {list.length > 1 && <div className="flex flex-wrap gap-1">{list.map((x, i) => <button key={x.key} type="button" onClick={() => setPick(i)} className={`px-2 py-0.5 rounded-full border text-[11.5px] ${i === pick ? "bg-gray-900 text-white border-gray-900" : "bg-white border-[var(--border)] text-[var(--text2)]"}`}>{x.title}</button>)}</div>}
                    <div className="text-[12.5px] leading-relaxed text-[var(--text2)] whitespace-pre-line">{fillText(sc.body, { name, me, ourCompany: COMPANY.name })}</div>
                </div>
            )}
        </div>
    )
}

export function OutcomeForm({ call, onSaved, compact }: { call: Call; onSaved: (c: any) => void; compact?: boolean }) {
    const { settings, me } = useDialerCtx()
    const outcomes = settings?.outcomes ?? []
    const wa = forTarget(settings?.waTemplates ?? [], call.targetType ?? "UNKNOWN")
    const [outcome, setOutcome] = useState(call.outcome ?? "")
    const [notes, setNotes] = useState(call.notes ?? "")
    const [follow, setFollow] = useState("")
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState("")
    const o = outcomes.find(x => x.key === outcome)
    const quick = (days: number) => { const d = new Date(Date.now() + days * 86400_000); d.setHours(days === 0 ? d.getHours() + 2 : 11, 0, 0, 0); const p = (n: number) => String(n).padStart(2, "0"); setFollow(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`) }
    // Opening a WhatsApp message also notes it on the call.
    const sentWa = (title: string) => setNotes(n => n.includes(`WhatsApp: ${title}`) ? n : `${n ? n.trimEnd() + "\n" : ""}WhatsApp: ${title}`)
    const save = async () => {
        if (!outcome) { setErr("Pick what happened"); return }
        setBusy(true); setErr("")
        const r = await fetch(`/api/dialer/calls/${call.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outcome, notes, ...(follow ? { followUpAt: new Date(follow).toISOString() } : {}) }) })
        const j = await r.json().catch(() => ({}))
        setBusy(false)
        if (!r.ok) { setErr(j?.error || "Could not save"); return }
        onSaved(j.call)
    }
    return (
        <div className="space-y-2.5">
            {!compact && <div className={`text-[12.5px] font-semibold ${call.connected ? "text-green-700" : "text-amber-700"}`}>{call.connected ? `Call ended · talked ${fmtDur(call.durationSec)}` : "Not connected"}</div>}
            <div className="flex flex-wrap gap-1.5">
                {outcomes.map(x => <button key={x.key} type="button" onClick={() => { setOutcome(x.key); if (x.followUp && !follow) quick(1) }} className={`px-2.5 py-1 rounded-full border text-[12px] ${outcome === x.key ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "bg-white border-[var(--border)] text-[var(--text2)]"}`}>{x.label}</button>)}
            </div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="w-full rounded-[9px] border border-[var(--border)] px-2.5 py-1.5 text-[13px]" />
            {(o?.followUp || follow) && (
                <div className="space-y-1">
                    <div className="text-[11px] font-semibold uppercase text-[var(--text3)]">Follow-up</div>
                    <div className="flex flex-wrap gap-1.5 items-center">
                        <input type="datetime-local" value={follow} onChange={e => setFollow(e.target.value)} className="h-8 rounded-[8px] border border-[var(--border)] px-2 text-[12px]" />
                        <button type="button" onClick={() => quick(0)} className="text-[11.5px] underline text-[var(--text3)]">In 2 h</button>
                        <button type="button" onClick={() => quick(1)} className="text-[11.5px] underline text-[var(--text3)]">Tomorrow</button>
                        <button type="button" onClick={() => quick(3)} className="text-[11.5px] underline text-[var(--text3)]">3 days</button>
                        {follow && <button type="button" onClick={() => setFollow("")} className="text-[11.5px] underline text-[var(--text3)]">None</button>}
                    </div>
                </div>
            )}
            {call.phone && wa.length > 0 && (
                <div className="space-y-1">
                    <div className="text-[11px] font-semibold uppercase text-[var(--text3)] inline-flex items-center gap-1"><MessageCircle size={12} /> Send on WhatsApp</div>
                    <div className="flex flex-wrap gap-1.5">
                        {wa.map(t => <a key={t.key} href={waLink(call.phone!, fillText(t.body, { name: call.targetName, me, ourCompany: COMPANY.name }))} target="_blank" rel="noopener noreferrer" onClick={() => sentWa(t.title)} className="px-2.5 py-1 rounded-full border border-green-300 bg-green-50 text-green-800 text-[12px] font-medium hover:bg-green-100">{t.title}</a>)}
                    </div>
                </div>
            )}
            {err && <div className="text-[12px] text-red-600">{err}</div>}
            <button onClick={save} disabled={busy} className="h-9 w-full rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-1.5">{busy && <Loader2 size={14} className="animate-spin" />} Save</button>
        </div>
    )
}
