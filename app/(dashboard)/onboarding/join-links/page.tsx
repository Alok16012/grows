"use client"
import { ModuleTabs } from "@/components/ModuleTabs"

// Onboarding → Join links. A recruiter's /join link fixed to a site and
// designation, with QR, on/off, expiry and use limit — and per link how many
// opened, started, submitted and were approved. Plus the join form settings.
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { ArrowLeft, Check, Copy, Loader2, Plus, QrCode, X } from "lucide-react"
import { EMPLOYMENT_TYPES } from "@/lib/employment-type"
import { JOIN_DUP_FIELDS, JOIN_OPTIONAL_FIELDS, JOIN_DOCS, type JoinSettings, type JoinDupField, type JoinOptionalField, type JoinDoc } from "@/lib/join-settings"
import { JOIN_LANGS, type JoinLang } from "@/lib/join-i18n"

type JL = {
    id: string; code: string; name: string; recruiterId: string; recruiter: string; siteId: string | null; site: string | null; designation: string | null; employmentType: string | null
    isActive: boolean; expiresAt: string | null; maxUses: number | null; opens: number; starts: number; submits: number; blocked: number; approved: number; state: "OPEN" | "OFF" | "EXPIRED" | "FULL"; createdAt: string
}
type Data = { canManageAll: boolean; me: string; sites: { id: string; name: string }[]; recruiters: { id: string; name: string }[]; links: JL[] }

const th = "text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)] border-b border-[var(--border)] bg-[var(--surface2)] whitespace-nowrap"
const td = "px-3 py-2 border-b border-[var(--border)] text-[12.5px] align-top"
const box = "h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white"
const btn = "h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
const btn2 = "h-9 px-3 rounded-[9px] border border-[var(--border)] bg-white text-[12.5px] font-semibold text-[var(--text2)] inline-flex items-center gap-1.5"
const STATE: Record<JL["state"], [string, string]> = { OPEN: ["Open", "bg-green-50 text-green-700"], OFF: ["Switched off", "bg-gray-100 text-gray-600"], EXPIRED: ["Expired", "bg-amber-50 text-amber-800"], FULL: ["Use limit reached", "bg-amber-50 text-amber-800"] }
const pct = (a: number, b: number) => b ? `${Math.round(a / b * 100)}%` : "—"

export default function JoinLinksPage() {
    const [tab, setTab] = useState<"links" | "settings">("links")
    return (
        <div className="max-w-[1300px] mx-auto p-4 md:p-6 lg:p-0 space-y-4">
            <ModuleTabs group="onboarding" />
            <div>
                <h2 className="text-[17px] font-bold text-[var(--text)]">Join links</h2>
                <p className="text-[12.5px] text-[var(--text3)]">Links and QR codes candidates use to fill the joining form — and which ones bring joiners.</p>
            </div>
            <div className="flex gap-1 border-b border-[var(--border)]">
                {([["links", "Links"], ["settings", "Form settings"]] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px ${tab === k ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text3)]"}`}>{l}</button>
                ))}
            </div>
            {tab === "links" ? <Links /> : <Settings />}
        </div>
    )
}

function Links() {
    const [d, setD] = useState<Data | null>(null)
    const [open, setOpen] = useState(false)
    const [qr, setQr] = useState<JL | null>(null)
    const [copied, setCopied] = useState<string | null>(null)
    const load = useCallback(() => { fetch("/api/onboarding/join-links").then(r => r.json()).then(setD).catch(() => toast.error("Couldn't load")) }, [])
    useEffect(() => { load() }, [load])
    const url = (l: JL) => `${window.location.origin}/join?l=${l.code}`
    async function copy(l: JL) { await navigator.clipboard.writeText(url(l)).catch(() => {}); setCopied(l.id); setTimeout(() => setCopied(null), 1500) }
    async function toggle(l: JL) {
        const r = await fetch(`/api/onboarding/join-links/${l.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !l.isActive }) })
        if (!r.ok) toast.error((await r.json().catch(() => ({})))?.error || "Could not save"); else { toast.success(l.isActive ? "Link switched off" : "Link switched on"); load() }
    }
    if (!d) return <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-[var(--text3)]" /></div>
    const tot = d.links.reduce((a, l) => ({ opens: a.opens + l.opens, starts: a.starts + l.starts, submits: a.submits + l.submits, approved: a.approved + l.approved, blocked: a.blocked + l.blocked }), { opens: 0, starts: 0, submits: 0, approved: 0, blocked: 0 })
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {([["Opened", tot.opens, ""], ["Started filling", tot.starts, pct(tot.starts, tot.opens) + " of opened"], ["Submitted", tot.submits, pct(tot.submits, tot.starts) + " of started"], ["Approved", tot.approved, pct(tot.approved, tot.submits) + " of submitted"], ["Blocked (already registered)", tot.blocked, ""]] as const).map(([l, v, s]) => (
                    <div key={l} className="bg-white border border-[var(--border)] rounded-[12px] p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)]">{l}</p><p className="text-[22px] font-bold tabular-nums">{v}</p><p className="text-[11px] text-[var(--text3)]">{s}</p></div>
                ))}
            </div>
            <div className="flex justify-between items-center gap-2 flex-wrap">
                <p className="text-[12px] text-[var(--text3)]">Old personal links (<code>/join?ref=…</code>) keep working; links made here also fix the site and designation and are counted.</p>
                <button className={btn} onClick={() => setOpen(true)}><Plus size={14} /> New link</button>
            </div>
            <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-x-auto">
                <table className="w-full min-w-[1000px]">
                    <thead><tr><th className={th}>Link</th><th className={th}>Recruiter</th><th className={th}>Fixed to</th><th className={th}>Opened → started → submitted → approved</th><th className={th}>Limits</th><th className={th}>Status</th><th className={th}></th></tr></thead>
                    <tbody>
                        {!d.links.length && <tr><td colSpan={7} className={`${td} text-center text-[var(--text3)] py-8`}>No links yet — make one for a site and print its QR at the gate.</td></tr>}
                        {d.links.map(l => (
                            <tr key={l.id}>
                                <td className={td}><b>{l.name}</b><span className="block font-mono text-[11px] text-[var(--text3)]">/join?l={l.code}</span></td>
                                <td className={td}>{l.recruiter}</td>
                                <td className={`${td} text-[var(--text2)]`}>{[l.site, l.designation, l.employmentType].filter(Boolean).join(" · ") || "—"}</td>
                                <td className={`${td} tabular-nums`}>{l.opens} → {l.starts} → <b>{l.submits}</b> → <b className="text-green-700">{l.approved}</b>{l.blocked > 0 && <span className="block text-[11px] text-amber-700">{l.blocked} blocked as already registered</span>}</td>
                                <td className={`${td} text-[11.5px] text-[var(--text3)]`}>{l.expiresAt ? `until ${new Date(l.expiresAt).toLocaleDateString("en-IN")}` : "no expiry"}<br />{l.maxUses ? `max ${l.maxUses} forms` : "no limit"}</td>
                                <td className={td}><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATE[l.state][1]}`}>{STATE[l.state][0]}</span></td>
                                <td className={`${td} whitespace-nowrap text-right`}>
                                    <button className={btn2} onClick={() => copy(l)} aria-label={`Copy link ${l.name}`}>{copied === l.id ? <Check size={13} /> : <Copy size={13} />}{copied === l.id ? "Copied" : "Copy"}</button>{" "}
                                    <button className={btn2} onClick={() => setQr(l)} aria-label={`QR code for ${l.name}`}><QrCode size={13} /> QR</button>{" "}
                                    <button className={btn2} onClick={() => toggle(l)}>{l.isActive ? "Switch off" : "Switch on"}</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {open && <NewLink d={d} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load() }} />}
            {qr && <QrModal link={qr} url={url(qr)} onClose={() => setQr(null)} />}
        </div>
    )
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k) }, [onClose])
    return createPortal(
        <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4">
            <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-white rounded-[14px] border border-[var(--border)] shadow-xl">
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[var(--border)]"><h3 className="text-[15px] font-semibold">{title}</h3><button onClick={onClose} aria-label="Close" className="p-1 text-[var(--text3)]"><X size={18} /></button></div>
                <div className="p-5 space-y-3">{children}</div>
            </div>
        </div>, document.body)
}

function NewLink({ d, onClose, onSaved }: { d: Data; onClose: () => void; onSaved: () => void }) {
    const [f, setF] = useState({ name: "", recruiterId: d.me, siteId: "", designation: "", employmentType: "", expiresAt: "", maxUses: "" })
    const [busy, setBusy] = useState(false)
    const set = (k: keyof typeof f, v: string) => setF(x => ({ ...x, [k]: v }))
    async function save() {
        setBusy(true)
        try {
            const r = await fetch("/api/onboarding/join-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) })
            const j = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(j?.error || "Could not save")
            toast.success("Link made — copy it or print its QR"); onSaved()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    const lbl = "block text-[11px] font-semibold uppercase text-[var(--text3)]"
    return (
        <Shell title="New join link" onClose={onClose}>
            <label className={lbl}>Name<input value={f.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Chakan gate - inspectors" className={`${box} w-full`} /></label>
            {d.canManageAll && <label className={lbl}>Recruiter (HR contact)<select value={f.recruiterId} onChange={e => set("recruiterId", e.target.value)} className={`${box} w-full`}>{!d.recruiters.some(r => r.id === d.me) && <option value={d.me}>Me</option>}{d.recruiters.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}
            <label className={lbl}>Site (optional — fixed on the form)<select value={f.siteId} onChange={e => set("siteId", e.target.value)} className={`${box} w-full`}><option value="">Candidate picks</option>{d.sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <div className="grid grid-cols-2 gap-3">
                <label className={lbl}>Designation (optional)<input value={f.designation} onChange={e => set("designation", e.target.value)} placeholder="e.g. Quality Inspector" className={`${box} w-full`} /></label>
                <label className={lbl}>Employment type<select value={f.employmentType} onChange={e => set("employmentType", e.target.value)} className={`${box} w-full`}><option value="">Candidate picks</option>{EMPLOYMENT_TYPES.map(x => <option key={x}>{x}</option>)}</select></label>
                <label className={lbl}>Closes after (optional)<input type="date" value={f.expiresAt} onChange={e => set("expiresAt", e.target.value)} className={`${box} w-full`} /></label>
                <label className={lbl}>At most this many forms<input type="number" min={1} value={f.maxUses} onChange={e => set("maxUses", e.target.value)} placeholder="no limit" className={`${box} w-full`} /></label>
            </div>
            <div className="flex justify-end gap-2"><button onClick={onClose} className={btn2}>Cancel</button><button onClick={save} disabled={busy || !f.name.trim()} className={btn}>{busy && <Loader2 size={14} className="animate-spin" />}Make link</button></div>
        </Shell>
    )
}

function QrModal({ link, url, onClose }: { link: JL; url: string; onClose: () => void }) {
    const [img, setImg] = useState<string | null>(null)
    useEffect(() => {
        (async () => { const QR: any = await import("qrcode"); const toUrl = QR.toDataURL ?? QR.default?.toDataURL; setImg(await toUrl(url, { margin: 1, width: 420 })) })().catch(() => toast.error("Couldn't make the QR"))
    }, [url])
    function print() {
        if (!img) return
        const w = window.open("", "_blank"); if (!w) return
        const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!))
        w.document.write(`<html><head><title>${esc(link.name)}</title><style>body{font-family:sans-serif;text-align:center;padding:40px}h1{font-size:28px;margin:0 0 6px}p{font-size:16px;color:#444;margin:4px 0}img{width:340px;margin:24px auto}</style></head><body><h1>Join us — scan to fill your joining form</h1><p>${esc([link.site, link.designation].filter(Boolean).join(" · "))}</p><img src="${img}" alt="QR"/><p style="font-family:monospace">${esc(url)}</p><script>onload=()=>{print()}</script></body></html>`)
        w.document.close()
    }
    return (
        <Shell title={`QR — ${link.name}`} onClose={onClose}>
            <div className="flex flex-col items-center gap-2">
                {img ? <img src={img} alt={`QR code for ${link.name}`} className="w-[260px] h-[260px]" /> : <Loader2 className="h-6 w-6 animate-spin text-[var(--text3)]" />}
                <p className="font-mono text-[11.5px] text-[var(--text3)] break-all text-center">{url}</p>
            </div>
            <div className="flex justify-end gap-2">
                {img && <a href={img} download={`join-${link.code}.png`} className={btn2}>Download PNG</a>}
                <button onClick={print} disabled={!img} className={btn}>Print poster</button>
            </div>
        </Shell>
    )
}

function Settings() {
    const [s, setS] = useState<JoinSettings | null>(null)
    const [canEdit, setCanEdit] = useState(false)
    const [busy, setBusy] = useState(false)
    useEffect(() => { fetch("/api/onboarding/join-settings").then(r => r.json()).then(j => { setS(j.settings); setCanEdit(!!j.canEdit) }).catch(() => toast.error("Couldn't load")) }, [])
    if (!s) return <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-[var(--text3)]" /></div>
    async function save() {
        setBusy(true)
        try { const r = await fetch("/api/onboarding/join-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) }); if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "Could not save"); setS((await r.json()).settings); toast.success("Join form settings saved") }
        catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    const dup = (k: JoinDupField, on: boolean) => setS(x => x && ({ ...x, duplicates: { ...x.duplicates, fields: on ? [...x.duplicates.fields, k] : x.duplicates.fields.filter(f => f !== k) } }))
    const al = (p: Partial<JoinSettings["alerts"]>) => setS(x => x && ({ ...x, alerts: { ...x.alerts, ...p } }))
    const card = "bg-white border border-[var(--border)] rounded-[12px] p-4 space-y-2"
    const fm = (p: Partial<JoinSettings["form"]>) => setS(x => x && ({ ...x, form: { ...x.form, ...p } }))
    const toggle = <T extends string>(list: T[], k: T, on: boolean) => on ? Array.from(new Set([...list, k])) : list.filter(x => x !== k)
    return (
        <div className="space-y-3 max-w-3xl">
            <div className={card}>
                <p className="text-[13px] font-semibold">What the form asks for</p>
                <p className="text-[12px] text-[var(--text3)]">Name, mobile, address, site, designation, joining date, bank and Aadhaar are always required. Tick the others the candidate must fill:</p>
                <div className="grid sm:grid-cols-3 gap-x-4 gap-y-1">{(Object.keys(JOIN_OPTIONAL_FIELDS) as JoinOptionalField[]).map(k => <label key={k} className="flex items-center gap-2 text-[13px]"><input type="checkbox" disabled={!canEdit} checked={s.form.required.includes(k)} onChange={e => fm({ required: toggle(s.form.required, k, e.target.checked) })} /> {JOIN_OPTIONAL_FIELDS[k]}</label>)}</div>
                <p className="text-[12px] text-[var(--text3)] pt-1">Documents that must be uploaded:</p>
                <div className="grid sm:grid-cols-3 gap-x-4 gap-y-1">{(Object.keys(JOIN_DOCS) as JoinDoc[]).map(k => <label key={k} className="flex items-center gap-2 text-[13px]"><input type="checkbox" disabled={!canEdit} checked={s.form.docs.includes(k)} onChange={e => fm({ docs: toggle(s.form.docs, k, e.target.checked) })} /> {JOIN_DOCS[k]}</label>)}</div>
                <p className="text-[12px] text-[var(--text3)] pt-1">Languages the candidate can switch to:</p>
                <div className="flex flex-wrap gap-x-5 gap-y-1">{(Object.keys(JOIN_LANGS) as JoinLang[]).map(k => <label key={k} className="flex items-center gap-2 text-[13px]"><input type="checkbox" disabled={!canEdit || k === "en"} checked={s.form.languages.includes(k)} onChange={e => fm({ languages: toggle(s.form.languages, k, e.target.checked) })} /> {JOIN_LANGS[k]}</label>)}</div>
            </div>
            <div className={card}>
                <p className="text-[13px] font-semibold">Already registered?</p>
                <p className="text-[12px] text-[var(--text3)]">Strict rule, always on: a form is blocked when its mobile, email, Aadhaar, PAN, bank account or UAN already belongs to an employee — on every way of adding employees (join form, HR form, imports, onboarding link, self-service), and a duplicate can never be approved.</p>
                <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" disabled={!canEdit} checked={s.duplicates.rejoinAlert} onChange={e => setS(x => x && ({ ...x, duplicates: { ...x.duplicates, rejoinAlert: e.target.checked } }))} /> If it matches someone who has left, alert HR and add a <b>Rejoin request</b> to the recruiter&apos;s pipeline</label>
                <p className="text-[11.5px] text-[var(--text3)]">The candidate only sees “already registered — HR will contact you”; nothing about the other record is shown.</p>
            </div>
            <div className={card}>
                <p className="text-[13px] font-semibold">Alerts when a form comes in</p>
                <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" disabled={!canEdit} checked={s.alerts.recruiter} onChange={e => al({ recruiter: e.target.checked })} /> Tell the recruiter whose link was used</label>
                <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" disabled={!canEdit} checked={s.alerts.approvers} onChange={e => al({ approvers: e.target.checked })} /> Tell everyone who approves onboarding</label>
                <label className="flex items-center gap-2 text-[13px]">Remind approvers daily when forms wait more than<input type="number" min={0} max={720} disabled={!canEdit} value={s.alerts.waitingAfterHours} onChange={e => al({ waitingAfterHours: Number(e.target.value) })} className={`${box} w-20`} /> hours <span className="text-[11.5px] text-[var(--text3)]">(0 = off)</span></label>
            </div>
            {canEdit && <div className="flex justify-end"><button onClick={save} disabled={busy} className={btn}>{busy && <Loader2 size={14} className="animate-spin" />}Save</button></div>}
        </div>
    )
}
