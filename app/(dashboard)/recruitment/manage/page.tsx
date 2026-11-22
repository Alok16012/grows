"use client"

// Hiring desk: the recruiter's day, manpower requests, interview calendar,
// reports, data clean-up and recruitment settings. Candidates themselves stay on /recruitment.
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Phone, Plus, X } from "lucide-react"
import { STAGE_LABEL, REQUEST_STATUS, REQUEST_REASONS, INTERVIEW_STATUS, INTERVIEW_RESULT, type RecruitmentSettings } from "@/lib/recruitment"
import { InterviewResult } from "@/components/recruitment/InterviewResult"

const box = "h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white"
const btn = "h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
const btn2 = "h-8 px-3 rounded-[8px] border border-[var(--border)] bg-white text-[12px] font-semibold text-[var(--text2)] inline-flex items-center gap-1 disabled:opacity-50"
const lbl = "block text-[11px] font-semibold uppercase text-[var(--text3)]"
const cardCls = "bg-white border border-[var(--border)] rounded-[12px]"
const th = "text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)] border-b border-[var(--border)] bg-[var(--surface2)]"
const td = "px-3 py-2 border-b border-[var(--border)] text-[12.5px]"
const when = (s: string | null | undefined) => s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"
const day = (s: string | null | undefined) => s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"
const ago = (s: string | null | undefined) => { if (!s) return "—"; const d = Math.floor((Date.now() - new Date(s).getTime()) / 86_400_000); return d <= 0 ? "today" : d === 1 ? "1 day" : `${d} days` }
const iso = (d: Date) => d.toISOString().slice(0, 10)

async function api(url: string, body?: any, method = "POST") {
    const r = await fetch(url, body === undefined ? undefined : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j?.error || "Something went wrong")
    return j
}

type Tab = "day" | "requests" | "interviews" | "reports" | "cleanup" | "settings"
const TABS: [Tab, string][] = [["day", "My day"], ["requests", "Manpower requests"], ["interviews", "Interviews"], ["reports", "Reports"], ["cleanup", "Clean-up"], ["settings", "Settings"]]

export default function HiringDesk() {
    const { data: session } = useSession()
    const perms: string[] = (session?.user as any)?.permissions ?? []
    // Site managers who can only raise requests see just that tab.
    const full = session?.user?.role === "ADMIN" || perms.includes("recruitment.view")
    const tabs = full ? TABS : TABS.filter(t => t[0] === "requests")
    const [tab, setTab] = useState<Tab>("day")
    useEffect(() => { const t = new URLSearchParams(window.location.search).get("tab") as Tab | null; if (t && TABS.some(x => x[0] === t)) setTab(t) }, [])
    useEffect(() => { if (session && !full) setTab("requests") }, [session, full])
    const go = (t: Tab) => { setTab(t); try { history.replaceState(null, "", `?tab=${t}`) } catch { /* ignore */ } }
    return (
        <div className="max-w-[1250px] mx-auto p-4 md:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <Link href="/recruitment" className="text-[12px] text-[var(--accent)] inline-flex items-center gap-1"><ArrowLeft size={12} /> Candidates</Link>
                    <h1 className="text-[22px] font-bold text-[var(--text)]">Hiring desk</h1>
                    <p className="text-[12.5px] text-[var(--text3)]">Requests from sites, today&apos;s work, interviews and how hiring is going.</p>
                </div>
            </div>
            <div className="flex gap-1 border-b border-[var(--border)] overflow-x-auto">
                {tabs.map(([k, l]) => <button key={k} onClick={() => go(k)} className={`px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px whitespace-nowrap ${tab === k ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text3)]"}`}>{l}</button>)}
            </div>
            {tab === "day" && <MyDay />}
            {tab === "requests" && <Requests />}
            {tab === "interviews" && <Interviews />}
            {tab === "reports" && <Reports />}
            {tab === "cleanup" && <Cleanup />}
            {tab === "settings" && <SettingsTab />}
        </div>
    )
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k) }, [onClose])
    return createPortal(
        <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4">
            <div role="dialog" aria-modal="true" aria-label={title} className="bg-white border border-[var(--border)] shadow-xl overflow-y-auto w-full max-w-lg max-h-[92vh] rounded-[14px]">
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[var(--border)] sticky top-0 bg-white"><h3 className="text-[15px] font-semibold">{title}</h3><button onClick={onClose} aria-label="Close" className="p-1 text-[var(--text3)]"><X size={18} /></button></div>
                <div className="p-5 space-y-3">{children}</div>
            </div>
        </div>, document.body)
}
const Spin = () => <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--text3)]" /></div>
const Empty = ({ t }: { t: string }) => <p className="text-[13px] text-[var(--text3)] bg-white border border-[var(--border)] rounded-[12px] p-5 text-center">{t}</p>

// ── My day ───────────────────────────────────────────────────────────────────
function Person({ l, extra }: { l: any; extra?: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-2 py-2 border-b border-[var(--border)] last:border-b-0">
            <div className="min-w-0">
                <Link href={`/recruitment?lead=${l.id}`} className="text-[13px] font-semibold hover:text-[var(--accent)]">{l.candidateName}</Link>
                <p className="text-[11.5px] text-[var(--text3)] truncate">{l.position} · {STAGE_LABEL[l.status] ?? l.status}{l.assignee?.name ? ` · ${l.assignee.name}` : ""}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0 text-[11.5px]">{extra}<a href={`tel:${l.phone}`} className={btn2} aria-label={`Call ${l.candidateName}`}><Phone size={12} /></a></div>
        </div>
    )
}
function Section({ title, count, tone, children }: { title: string; count: number; tone?: "red" | "amber"; children: React.ReactNode }) {
    return (
        <div className={`${cardCls} p-4`}>
            <p className="text-[13px] font-bold mb-1 flex items-center gap-2">{title}<span className={`px-2 py-0.5 rounded-full text-[11px] ${tone === "red" && count ? "bg-red-50 text-red-700" : tone === "amber" && count ? "bg-amber-50 text-amber-800" : "bg-[var(--surface2)] text-[var(--text2)]"}`}>{count}</span></p>
            {count ? <div className="max-h-[340px] overflow-y-auto">{children}</div> : <p className="text-[12px] text-[var(--text3)] py-2">Nothing here.</p>}
        </div>
    )
}
function MyDay() {
    const [all, setAll] = useState(false)
    const [d, setD] = useState<any>(null)
    const [busy, setBusy] = useState(false)
    const load = useCallback(() => { setD(null); fetch(`/api/recruitment/myday${all ? "?all=1" : ""}`).then(r => r.json()).then(setD).catch(() => toast.error("Couldn't load")) }, [all])
    useEffect(() => { load() }, [load])
    async function share() {
        if (!confirm(`Share ${d.unassigned} candidate(s) without a recruiter between the recruiters picked in Settings?`)) return
        setBusy(true)
        try { const r = await api("/api/recruitment/myday", { action: "assignUnassigned" }); toast.success(`${r.assigned} candidate(s) shared between ${r.recruiters} recruiter(s)`); load() } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    if (!d) return <Spin />
    if (d.error) return <Empty t={d.error} />
    const stuckDays = (s: string) => d.settings?.stuckDays?.[s]
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                {d.can?.all && <div className="inline-flex rounded-[9px] border border-[var(--border)] overflow-hidden text-[12.5px]"><button onClick={() => setAll(false)} className={`px-3 h-8 ${!all ? "bg-[var(--accent)] text-white" : "bg-white"}`}>Mine</button><button onClick={() => setAll(true)} className={`px-3 h-8 ${all ? "bg-[var(--accent)] text-white" : "bg-white"}`}>Everyone</button></div>}
                <span className="text-[12px] text-[var(--text3)]">{d.newToday} new candidate(s) today</span>
                {d.unassigned > 0 && <span className="ml-auto inline-flex items-center gap-2 text-[12.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-[9px] px-3 py-1.5"><AlertTriangle size={13} />{d.unassigned} open candidate(s) have no recruiter{d.can?.all && <button disabled={busy} onClick={share} className="font-semibold underline">Share them out</button>}</span>}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
                <Section title="Interviews today" count={d.interviews.length}>{d.interviews.map((i: any) => <Person key={i.id} l={i.lead} extra={<span className="text-[var(--text2)]">{new Date(i.scheduledAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })} · {i.title}</span>} />)}</Section>
                <Section title="Follow-ups due" count={d.followUps.length} tone="amber">{d.followUps.map((f: any) => <Person key={f.id} l={f.lead} extra={<span className={new Date(f.scheduledAt) < new Date() ? "text-red-600 font-semibold" : "text-[var(--text2)]"}>{f.type.toLowerCase()} · {when(f.scheduledAt)}</span>} />)}</Section>
                <Section title="Stuck candidates" count={d.stuck.length} tone="red">{d.stuck.map((l: any) => <Person key={l.id} l={l} extra={<span className="text-red-600">{ago(l.stageChangedAt)} in stage{stuckDays(l.status) ? ` (limit ${stuckDays(l.status)})` : ""}</span>} />)}</Section>
                <Section title="Offered, not joined yet" count={d.offers.length}>{d.offers.map((l: any) => <Person key={l.id} l={l} extra={<span className="text-[var(--text2)]">offered {ago(l.offeredAt)} ago{l.offerJoiningDate ? ` · joins ${day(l.offerJoiningDate)}` : ""}</span>} />)}</Section>
            </div>
        </div>
    )
}

// ── Manpower requests ────────────────────────────────────────────────────────
function Requests() {
    const [status, setStatus] = useState("OPEN")
    const [d, setD] = useState<any>(null)
    const [creating, setCreating] = useState(false)
    const load = useCallback(() => { setD(null); fetch(`/api/recruitment/requests?status=${status}`).then(r => r.json()).then(setD).catch(() => toast.error("Couldn't load")) }, [status])
    useEffect(() => { load() }, [load])
    async function act(id: string, action: string, ask?: string) {
        let note: string | null = null
        if (ask) { note = prompt(ask); if (note === null) return }
        try { await api(`/api/recruitment/requests/${id}`, { action, note }); toast.success("Saved"); load() } catch (e: any) { toast.error(e.message) }
    }
    const tone: Record<string, string> = { PENDING: "bg-amber-50 text-amber-800", APPROVED: "bg-blue-50 text-blue-700", FILLED: "bg-green-50 text-green-700", REJECTED: "bg-red-50 text-red-700", CANCELLED: "bg-gray-100 text-gray-600" }
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
                <select value={status} onChange={e => setStatus(e.target.value)} className={box} aria-label="Status"><option value="OPEN">Open (waiting + hiring)</option><option value="PENDING">Waiting for approval</option><option value="APPROVED">Hiring</option><option value="FILLED">Filled</option><option value="ALL">All</option></select>
                <button onClick={() => setCreating(true)} className={`${btn} ml-auto`}><Plus size={14} /> New request</button>
            </div>
            {!d ? <Spin /> : d.error ? <Empty t={d.error} /> : !d.requests.length ? <Empty t="No requests here. A site manager can ask for people with “New request”." /> : (
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
                    {d.requests.map((r: any) => {
                        const pct = Math.min(100, Math.round(r.seats.joined / r.headcount * 100))
                        return (
                            <div key={r.id} className={`${cardCls} p-4 space-y-2`}>
                                <div className="flex justify-between gap-2"><div><b className="text-[14px]">{r.headcount} × {r.position}</b><p className="text-[12px] text-[var(--text3)]">{r.reqNo} · {r.siteName ?? "No site"} · {REQUEST_REASONS[r.reason] ?? r.reason}</p></div><span className={`h-fit px-2 py-0.5 rounded-full text-[11px] font-semibold ${tone[r.status] ?? ""}`}>{REQUEST_STATUS[r.status] ?? r.status}</span></div>
                                <div>
                                    <div className="h-2 rounded-full bg-[var(--surface2)] overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${pct}%` }} /></div>
                                    <p className="text-[11.5px] text-[var(--text2)] mt-1"><b>{r.seats.joined}</b> joined of {r.headcount} · {r.seats.inPipeline} in pipeline{r.neededBy ? ` · needed by ${day(r.neededBy)}` : ""}</p>
                                </div>
                                {(r.salaryMin || r.salaryMax) && <p className="text-[12px]">Salary ₹{r.salaryMin?.toLocaleString("en-IN") ?? "?"} – ₹{r.salaryMax?.toLocaleString("en-IN") ?? "?"}</p>}
                                {r.notes && <p className="text-[12px] text-[var(--text2)] whitespace-pre-wrap">{r.notes}</p>}
                                <p className="text-[11px] text-[var(--text3)]">Asked by {r.requestedByName} · {day(r.createdAt)}{r.decidedByName ? ` · ${r.status === "REJECTED" ? "rejected" : "approved"} by ${r.decidedByName}` : ""}{r.decisionNote ? ` — ${r.decisionNote}` : ""}</p>
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                    {r.status === "PENDING" && d.can.approve && <><button onClick={() => act(r.id, "approve")} className={btn2}><CheckCircle2 size={12} /> Approve</button><button onClick={() => act(r.id, "reject", "Why is it rejected?")} className={btn2}>Reject</button></>}
                                    {r.status === "APPROVED" && r.jobId && <Link href={`/jobs/${r.jobId}`} className={btn2}>Job opening</Link>}
                                    {r.status === "APPROVED" && !r.jobId && (d.can.manage || d.can.approve) && <button onClick={() => act(r.id, "makeJob")} className={btn2}>Make job opening</button>}
                                    {r.status === "APPROVED" && (d.can.manage || d.can.approve) && <button onClick={() => act(r.id, "fill")} className={btn2}>Mark filled</button>}
                                    {(r.status === "FILLED" || r.status === "CANCELLED") && (d.can.manage || d.can.approve) && <button onClick={() => act(r.id, "reopen")} className={btn2}>Reopen</button>}
                                    {(r.status === "PENDING" || r.status === "APPROVED") && <button onClick={() => act(r.id, "cancel", "Cancel this request? Reason (optional):")} className="h-8 px-2 text-[12px] font-semibold text-red-600">Cancel</button>}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
            {creating && <NewRequest onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load() }} />}
        </div>
    )
}
function NewRequest({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
    const [sites, setSites] = useState<{ id: string; name: string }[]>([])
    const [f, setF] = useState({ siteId: "", position: "", headcount: "1", reason: "NEW", neededBy: "", salaryMin: "", salaryMax: "", priority: "MEDIUM", notes: "" })
    const [busy, setBusy] = useState(false)
    useEffect(() => { fetch("/api/join").then(r => r.json()).then(j => setSites(j.sites ?? [])).catch(() => {}) }, [])
    const set = (k: keyof typeof f, v: string) => setF(x => ({ ...x, [k]: v }))
    async function save() { setBusy(true); try { await api("/api/recruitment/requests", f); toast.success("Request sent"); onSaved() } catch (e: any) { toast.error(e.message) } finally { setBusy(false) } }
    return (
        <Shell title="Ask for people" onClose={onClose}>
            <div className="grid grid-cols-2 gap-3">
                <label className={`${lbl} col-span-2`}>Site<select value={f.siteId} onChange={e => set("siteId", e.target.value)} className={`${box} w-full`}><option value="">— pick site —</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                <label className={lbl}>Position<input value={f.position} onChange={e => set("position", e.target.value)} placeholder="e.g. Quality Inspector" className={`${box} w-full`} /></label>
                <label className={lbl}>How many<input type="number" min={1} value={f.headcount} onChange={e => set("headcount", e.target.value)} className={`${box} w-full`} /></label>
                <label className={lbl}>Why<select value={f.reason} onChange={e => set("reason", e.target.value)} className={`${box} w-full`}>{Object.entries(REQUEST_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label className={lbl}>Needed by<input type="date" value={f.neededBy} onChange={e => set("neededBy", e.target.value)} className={`${box} w-full`} /></label>
                <label className={lbl}>Salary from (₹/month)<input type="number" value={f.salaryMin} onChange={e => set("salaryMin", e.target.value)} className={`${box} w-full`} /></label>
                <label className={lbl}>Salary up to<input type="number" value={f.salaryMax} onChange={e => set("salaryMax", e.target.value)} className={`${box} w-full`} /></label>
                <label className={lbl}>Priority<select value={f.priority} onChange={e => set("priority", e.target.value)} className={`${box} w-full`}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></label>
            </div>
            <label className={lbl}>Notes (skills, shift, experience…)<textarea value={f.notes} onChange={e => set("notes", e.target.value)} rows={3} className="w-full rounded-[9px] border border-[var(--border)] px-2.5 py-1.5 text-[13px]" /></label>
            <div className="flex justify-end gap-2"><button onClick={onClose} className={btn2}>Cancel</button><button onClick={save} disabled={busy || !f.position.trim()} className={btn}>{busy && <Loader2 size={14} className="animate-spin" />}Send request</button></div>
        </Shell>
    )
}

// ── Interviews ───────────────────────────────────────────────────────────────
function Interviews() {
    const [from, setFrom] = useState(iso(new Date(Date.now() - 86_400_000)))
    const [to, setTo] = useState(iso(new Date(Date.now() + 14 * 86_400_000)))
    const [mine, setMine] = useState(false)
    const [d, setD] = useState<any>(null)
    const [open, setOpen] = useState<any>(null)
    const load = useCallback(() => { setD(null); fetch(`/api/recruitment/interviews?from=${from}&to=${to}${mine ? "&mine=1" : ""}`).then(r => r.json()).then(setD).catch(() => toast.error("Couldn't load")) }, [from, to, mine])
    useEffect(() => { load() }, [load])
    const byDay = new Map<string, any[]>()
    for (const i of d?.interviews ?? []) { const k = new Date(i.scheduledAt).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" }); byDay.set(k, [...(byDay.get(k) ?? []), i]) }
    const tone: Record<string, string> = { SCHEDULED: "text-blue-700", DONE: "text-green-700", NO_SHOW: "text-red-600", CANCELLED: "text-gray-500" }
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2 items-center text-[13px]">From<input type="date" value={from} onChange={e => setFrom(e.target.value)} className={box} />to<input type="date" value={to} onChange={e => setTo(e.target.value)} className={box} /><label className="flex items-center gap-1.5 ml-2"><input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)} /> Only mine</label></div>
            {!d ? <Spin /> : d.error ? <Empty t={d.error} /> : !d.interviews.length ? <Empty t="No interviews in these dates. Schedule rounds from a candidate's card." /> : Array.from(byDay.entries()).map(([k, list]) => (
                <div key={k}><p className="text-[12px] font-bold text-[var(--text2)] mb-1.5">{k}</p>
                    <div className={`${cardCls} px-4`}>{list.map(i => (
                        <button key={i.id} onClick={() => setOpen(i)} className="w-full text-left flex items-center justify-between gap-3 py-2.5 border-b border-[var(--border)] last:border-b-0">
                            <span className="min-w-0"><b className="text-[13px]">{new Date(i.scheduledAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })} · {i.lead.candidateName}</b><span className="block text-[11.5px] text-[var(--text3)] truncate">{i.title} (round {i.round}) · {i.lead.position}{i.mode ? ` · ${i.mode}` : ""}{i.interviewerName ? ` · with ${i.interviewerName}` : ""}</span></span>
                            <span className={`text-[12px] font-semibold shrink-0 ${tone[i.status] ?? ""}`}>{INTERVIEW_STATUS[i.status] ?? i.status}{i.result ? ` · ${INTERVIEW_RESULT[i.result]}` : ""}</span>
                        </button>
                    ))}</div>
                </div>
            ))}
            {open && <InterviewResult iv={open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load() }} />}
        </div>
    )
}
// ── Reports ──────────────────────────────────────────────────────────────────
function Reports() {
    const [from, setFrom] = useState(iso(new Date(Date.now() - 30 * 86_400_000)))
    const [to, setTo] = useState(iso(new Date()))
    const [d, setD] = useState<any>(null)
    useEffect(() => { setD(null); fetch(`/api/recruitment/report?from=${from}&to=${to}`).then(r => r.json()).then(setD).catch(() => toast.error("Couldn't load")) }, [from, to])
    const Tile = ({ k, v, s }: { k: string; v: any; s?: string }) => <div className={`${cardCls} p-3`}><p className="text-[11px] uppercase font-semibold text-[var(--text3)]">{k}</p><p className="text-[22px] font-bold">{v ?? "—"}</p>{s && <p className="text-[11px] text-[var(--text3)]">{s}</p>}</div>
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center text-[13px]">From<input type="date" value={from} onChange={e => setFrom(e.target.value)} className={box} />to<input type="date" value={to} onChange={e => setTo(e.target.value)} className={box} /></div>
            {!d ? <Spin /> : d.error ? <Empty t={d.error} /> : <>
                <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
                    <Tile k="Candidates added" v={d.totals.added} /><Tile k="Interviews done" v={d.totals.interviews} /><Tile k="Offers made" v={d.totals.offers} /><Tile k="Joined" v={d.totals.joined} s={d.totals.added ? `${Math.round(d.totals.joined / d.totals.added * 100)}% of added` : undefined} /><Tile k="Days to join" v={d.avgDaysToJoin} s="average, added → joined" />
                </div>
                <div>
                    <p className="text-[13px] font-bold mb-1.5">Recruiter scoreboard</p>
                    <div className={`${cardCls} overflow-x-auto`}><table className="w-full min-w-[680px]"><thead><tr><th className={th}>Recruiter</th><th className={th}>Added</th><th className={th}>Interviews</th><th className={th}>Passed</th><th className={th}>Offers</th><th className={th}>Joined</th><th className={th}>Joined %</th><th className={th}>Days to join</th></tr></thead>
                        <tbody>{d.recruiters.map((r: any) => <tr key={r.userId ?? "none"}><td className={`${td} font-semibold`}>{r.name}</td><td className={td}>{r.added}</td><td className={td}>{r.interviews}</td><td className={td}>{r.passed}</td><td className={td}>{r.offers}</td><td className={`${td} font-semibold`}>{r.joined}</td><td className={td}>{r.conversion !== null ? `${r.conversion}%` : "—"}</td><td className={td}>{r.avgDaysToJoin ?? "—"}</td></tr>)}</tbody></table></div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                    <div><p className="text-[13px] font-bold mb-1.5">Where candidates come from</p>
                        <div className={`${cardCls} overflow-x-auto`}><table className="w-full"><thead><tr><th className={th}>Source</th><th className={th}>Added</th><th className={th}>Joined (in period)</th></tr></thead><tbody>{d.sources.map((s: any) => <tr key={s.source}><td className={`${td} font-semibold`}>{s.source}</td><td className={td}>{s.added}</td><td className={td}>{s.joined}</td></tr>)}</tbody></table></div>
                    </div>
                    <div><p className="text-[13px] font-bold mb-1.5">Open seats by site (approved requests)</p>
                        {!d.openSeats.length ? <Empty t="No approved requests open." /> : <div className={`${cardCls} overflow-x-auto`}><table className="w-full"><thead><tr><th className={th}>Site</th><th className={th}>Asked</th><th className={th}>Joined</th><th className={th}>Still open</th><th className={th}>In pipeline</th></tr></thead><tbody>{d.openSeats.map((s: any) => <tr key={s.site}><td className={`${td} font-semibold`}>{s.site}</td><td className={td}>{s.asked}</td><td className={td}>{s.joined}</td><td className={`${td} ${s.asked - s.joined > 0 ? "text-red-600 font-semibold" : ""}`}>{Math.max(0, s.asked - s.joined)}</td><td className={td}>{s.inPipeline}</td></tr>)}</tbody></table></div>}
                    </div>
                </div>
                <div><p className="text-[13px] font-bold mb-1.5">Where candidates added in this period are now</p>
                    <div className="flex flex-wrap gap-2">{d.funnel.sort((a: any, b: any) => b.n - a.n).map((f: any) => <span key={f.status} className={`${cardCls} px-3 py-1.5 text-[12.5px]`}>{STAGE_LABEL[f.status] ?? f.status}: <b>{f.n}</b></span>)}</div>
                </div>
            </>}
        </div>
    )
}

// ── Clean-up ─────────────────────────────────────────────────────────────────
function Cleanup() {
    const [d, setD] = useState<any>(null)
    const [busy, setBusy] = useState(false)
    const [showAll, setShowAll] = useState(false)
    const load = useCallback(() => { setD(null); fetch("/api/recruitment/cleanup").then(r => r.json()).then(setD).catch(() => toast.error("Couldn't load")) }, [])
    useEffect(() => { load() }, [load])
    async function run(what: "duplicates" | "names") {
        const n = what === "duplicates" ? d.groups.filter((g: any) => !g.conflict).length : d.names.positions.length + d.names.sources.length
        if (!confirm(what === "duplicates" ? `Merge ${n} group(s) of duplicate candidates? Each group keeps the most advanced record; notes, documents, follow-ups and interviews move onto it, and a full copy of every removed record is kept in the merge log.` : `Tidy ${n} name group(s)?`)) return
        setBusy(true)
        try { const r = await api("/api/recruitment/cleanup", { what }); toast.success(what === "duplicates" ? `${r.removed} duplicate record(s) merged into ${r.groups} candidate(s)` : `${r.updated} record(s) tidied`); load() } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    if (!d) return <Spin />
    if (d.error) return <Empty t={d.error} />
    const safe = d.groups.filter((g: any) => !g.conflict)
    const conflicts = d.groups.filter((g: any) => g.conflict)
    return (
        <div className="space-y-4">
            <div className={`${cardCls} p-4 space-y-2`}>
                <div className="flex items-center justify-between gap-2 flex-wrap"><div><p className="text-[14px] font-bold">Duplicate candidates (same mobile)</p><p className="text-[12px] text-[var(--text3)]">{safe.length} group(s) can be merged{conflicts.length ? ` · ${conflicts.length} left alone (the number belongs to two different employees)` : ""}. New duplicates are now stopped at entry.</p></div>
                    <button disabled={busy || !safe.length} onClick={() => run("duplicates")} className={btn}>{busy && <Loader2 size={14} className="animate-spin" />}Merge {safe.length} group(s)</button></div>
                {safe.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[640px]"><thead><tr><th className={th}>Mobile</th><th className={th}>Records (✓ = kept)</th></tr></thead><tbody>
                    {(showAll ? safe : safe.slice(0, 15)).map((g: any) => <tr key={g.phone}><td className={`${td} whitespace-nowrap`}>{g.phone}</td><td className={td}>{g.rows.map((r: any) => <span key={r.id} className={`inline-block mr-3 ${r.keep ? "font-semibold text-green-700" : "text-[var(--text2)]"}`}>{r.keep ? "✓ " : ""}{r.candidateName} · {STAGE_LABEL[r.status] ?? r.status} · {r.source}</span>)}</td></tr>)}
                </tbody></table>{safe.length > 15 && !showAll && <button onClick={() => setShowAll(true)} className="text-[12px] text-[var(--accent)] mt-2">Show all {safe.length}</button>}</div>}
            </div>
            <div className={`${cardCls} p-4 space-y-2`}>
                <div className="flex items-center justify-between gap-2 flex-wrap"><div><p className="text-[14px] font-bold">Position and source names</p><p className="text-[12px] text-[var(--text3)]">Spellings that differ only in capitals or spaces, and known source names (Workindia → WorkIndia).</p></div>
                    <button disabled={busy || !(d.names.positions.length + d.names.sources.length)} onClick={() => run("names")} className={btn}>Tidy names</button></div>
                {[...d.names.positions.map((p: any) => ({ ...p, kind: "Position" })), ...d.names.sources.map((p: any) => ({ ...p, kind: "Source" }))].slice(0, 30).map((p: any) => (
                    <p key={p.kind + p.to} className="text-[12.5px]"><span className="text-[var(--text3)]">{p.kind}:</span> {p.from.map((f: any) => `“${f.value}” (${f.n})`).join(", ")} → <b>{p.to}</b></p>
                ))}
                {!(d.names.positions.length + d.names.sources.length) && <p className="text-[12px] text-green-700">All tidy.</p>}
            </div>
        </div>
    )
}

// ── Settings ─────────────────────────────────────────────────────────────────
function SettingsTab() {
    const [d, setD] = useState<{ settings: RecruitmentSettings; recruiters: { id: string; name: string }[]; canEdit: boolean } | null>(null)
    const [s, setS] = useState<RecruitmentSettings | null>(null)
    const [busy, setBusy] = useState(false)
    useEffect(() => { fetch("/api/recruitment/settings").then(r => r.json()).then(j => { setD(j); setS(j.settings) }).catch(() => toast.error("Couldn't load")) }, [])
    if (!d || !s) return <Spin />
    async function save() { setBusy(true); try { const j = await api("/api/recruitment/settings", s, "PUT"); setS(j.settings); toast.success("Saved") } catch (e: any) { toast.error(e.message) } finally { setBusy(false) } }
    const dis = !d.canEdit
    return (
        <div className={`${cardCls} p-5 space-y-5 text-[13px] max-w-[760px]`}>
            {dis && <p className="text-[12px] text-amber-800 bg-amber-50 rounded-[9px] px-3 py-2">Only Admin or Recruitment → Approve can change these.</p>}
            <fieldset disabled={dis} className="space-y-5">
                <div className="space-y-2">
                    <p className="font-bold">Auto-assign new candidates</p>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={s.autoAssign} onChange={e => setS({ ...s, autoAssign: e.target.checked })} /> Give every new candidate without a recruiter to one automatically</label>
                    <label className="flex items-center gap-2">How<select value={s.assignMode} onChange={e => setS({ ...s, assignMode: e.target.value as any })} className={box}><option value="round_robin">In turn (round robin)</option><option value="least_open">Whoever has the fewest open candidates</option></select></label>
                    <p className="text-[12px] text-[var(--text3)]">Recruiters taking part ({s.recruiterIds.length} picked):</p>
                    <div className="flex flex-wrap gap-1.5 max-h-[180px] overflow-y-auto">{d.recruiters.map(r => { const on = s.recruiterIds.includes(r.id); return <button type="button" key={r.id} onClick={() => setS({ ...s, recruiterIds: on ? s.recruiterIds.filter(x => x !== r.id) : [...s.recruiterIds, r.id] })} className={`px-2.5 py-1 rounded-full text-[12px] border ${on ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "bg-white border-[var(--border)]"}`}>{r.name}</button> })}</div>
                </div>
                <div className="space-y-2">
                    <p className="font-bold">Stuck after (days in one stage, 0 = never)</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{Object.keys(s.stuckDays).map(k => <label key={k} className="text-[12px]">{STAGE_LABEL[k] ?? k}<input type="number" min={0} max={365} value={s.stuckDays[k]} onChange={e => setS({ ...s, stuckDays: { ...s.stuckDays, [k]: Number(e.target.value) } })} className={`${box} w-full`} /></label>)}</div>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={s.dailyDigest} onChange={e => setS({ ...s, dailyDigest: e.target.checked })} /> Each morning, tell every recruiter about their interviews, follow-ups and stuck candidates (in-app)</label>
                </div>
                <div className="space-y-2">
                    <p className="font-bold">Manpower requests</p>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={s.requestNeedsApproval} onChange={e => setS({ ...s, requestNeedsApproval: e.target.checked })} /> Requests need approval (Recruitment → Approve) before hiring starts</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={s.autoCreateJob} onChange={e => setS({ ...s, autoCreateJob: e.target.checked })} /> On approval, make a draft job opening from the request</label>
                </div>
                <div className="space-y-2">
                    <p className="font-bold">Interview scorecard (each scored 1–5)</p>
                    <input value={s.scoreItems.join(", ")} onChange={e => setS({ ...s, scoreItems: e.target.value.split(",").map(x => x.trim()).filter(Boolean) })} className={`${box} w-full`} />
                </div>
                <div className="space-y-2">
                    <p className="font-bold">Offer message</p>
                    <textarea value={s.offerMessage} onChange={e => setS({ ...s, offerMessage: e.target.value })} rows={4} className="w-full rounded-[9px] border border-[var(--border)] px-2.5 py-1.5 text-[13px]" />
                    <p className="text-[11.5px] text-[var(--text3)]">Fills in: {"{name} {designation} {site} {salary} {date} {link} {company}"}. The recruiter sends it from their own WhatsApp; the system never sends it by itself.</p>
                </div>
            </fieldset>
            {!dis && <div className="flex justify-end"><button onClick={save} disabled={busy} className={btn}>Save settings</button></div>}
        </div>
    )
}
