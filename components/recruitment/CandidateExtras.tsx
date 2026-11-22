"use client"

// Candidate drawer additions (Recruitment v2):
//  • JobLinkOffer — which job opening / manpower request the candidate is for, and the offer → personal join link.
//  • InterviewRounds — every interview round with scorecard and result.
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Briefcase, CalendarPlus, Copy, Gift, Loader2, MessageCircle } from "lucide-react"
import { INTERVIEW_STATUS, INTERVIEW_RESULT } from "@/lib/recruitment"
import { InterviewResult } from "@/components/recruitment/InterviewResult"

const box = "h-8 rounded-[8px] border border-[var(--border)] px-2 text-[12.5px] bg-white"
const btn = "h-8 px-3 rounded-[8px] bg-[var(--accent)] text-white text-[12px] font-semibold disabled:opacity-50 inline-flex items-center gap-1"
const btn2 = "h-8 px-3 rounded-[8px] border border-[var(--border)] bg-white text-[12px] font-semibold text-[var(--text2)] inline-flex items-center gap-1 disabled:opacity-50"
const lbl = "block text-[10.5px] font-semibold uppercase text-[var(--text3)]"

type Links = { jobs: { id: string; title: string; siteName: string | null; status: string }[]; requests: { id: string; reqNo: string; position: string; siteName: string | null; siteId: string | null; headcount: number; jobId: string | null }[]; sites: { id: string; name: string }[]; scoreItems: string[] }
let linksCache: Promise<Links> | null = null
const getLinks = () => (linksCache ??= fetch("/api/recruitment/links").then(r => r.ok ? r.json() : { jobs: [], requests: [], sites: [], scoreItems: [] }))

async function post(url: string, body: any, method = "POST") {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j?.error || "Could not save")
    return j
}

export function JobLinkOffer({ lead, canEdit, onChanged }: { lead: any; canEdit: boolean; onChanged: (updated?: any) => void }) {
    const [links, setLinks] = useState<Links | null>(null)
    const [offer, setOffer] = useState<{ link: string | null; message: string | null; phone: string; offer: any } | null>(null)
    const [editing, setEditing] = useState(false)
    const [f, setF] = useState({ salary: "", designation: "", joiningDate: "", siteId: "" })
    const [busy, setBusy] = useState(false)
    useEffect(() => { getLinks().then(setLinks).catch(() => {}) }, [])
    const loadOffer = useCallback(() => { fetch(`/api/recruitment/${lead.id}/offer`).then(r => r.ok ? r.json() : null).then(setOffer).catch(() => {}) }, [lead.id])
    useEffect(() => { if (lead.offeredAt || ["SELECTED", "OFFERED"].includes(lead.status)) loadOffer() }, [lead.id, lead.offeredAt, lead.status, loadOffer])

    async function link(field: "jobId" | "requestId", value: string) {
        try {
            const body: any = { [field]: value || null }
            if (field === "requestId" && value) { const r = links?.requests.find(x => x.id === value); if (r?.jobId && !lead.jobId) body.jobId = r.jobId }
            const u = await post(`/api/recruitment/${lead.id}`, body, "PATCH"); toast.success("Linked"); onChanged(u)
        } catch (e: any) { toast.error(e.message) }
    }
    function startOffer() {
        const o = offer?.offer
        setF({ salary: String(o?.salary ?? lead.expectedSalary ?? ""), designation: o?.designation ?? lead.position ?? "", joiningDate: o?.joiningDate ? String(o.joiningDate).slice(0, 10) : "", siteId: o?.siteId ?? lead.siteId ?? "" })
        setEditing(true)
    }
    async function saveOffer() {
        setBusy(true)
        try { const j = await post(`/api/recruitment/${lead.id}/offer`, f); setOffer(j); setEditing(false); toast.success("Offer saved — share the joining link"); onChanged() } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    const wa = offer?.message ? `https://wa.me/91${String(offer.phone).replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(offer.message)}` : null
    const canOffer = canEdit && !lead.convertedEmployeeId && ["INTERVIEW_DONE", "SELECTED", "OFFERED"].includes(lead.status)

    return (
        <div className="mb-4 space-y-3">
            <div className="p-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface2)]/40 space-y-2">
                <p className="text-[11px] font-semibold uppercase text-[var(--text3)] flex items-center gap-1"><Briefcase size={12} /> Hiring for</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className={lbl}>Manpower request<select disabled={!canEdit || !links} value={lead.requestId ?? ""} onChange={e => link("requestId", e.target.value)} className={`${box} w-full`}><option value="">— none —</option>{links?.requests.map(r => <option key={r.id} value={r.id}>{r.reqNo} · {r.headcount} × {r.position}{r.siteName ? ` @ ${r.siteName}` : ""}</option>)}</select></label>
                    <label className={lbl}>Job opening<select disabled={!canEdit || !links} value={lead.jobId ?? ""} onChange={e => link("jobId", e.target.value)} className={`${box} w-full`}><option value="">— none —</option>{links?.jobs.map(j => <option key={j.id} value={j.id}>{j.title}{j.siteName ? ` @ ${j.siteName}` : ""}{j.status === "DRAFT" ? " (draft)" : ""}</option>)}</select></label>
                </div>
            </div>

            {(canOffer || offer?.link) && (
                <div className="p-3 rounded-[10px] border border-green-200 bg-green-50/60 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-[12.5px] font-semibold text-green-800 flex items-center gap-1"><Gift size={14} /> {offer?.link ? "Offer made" : "Ready for an offer"}</p>
                        {canOffer && !editing && <button onClick={startOffer} className={offer?.link ? btn2 : btn}>{offer?.link ? "Change offer" : "Make offer"}</button>}
                    </div>
                    {offer?.link && !editing && (
                        <>
                            <p className="text-[12px] text-green-900">{offer.offer.designation} · ₹{offer.offer.salary ? Math.round(offer.offer.salary).toLocaleString("en-IN") : "—"}/month{offer.offer.joiningDate ? ` · joining ${new Date(offer.offer.joiningDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}</p>
                            <p className="text-[11.5px] text-[var(--text2)]">Personal joining link — when they fill it, this candidate moves to Joined and becomes an employee (no duplicate).</p>
                            <div className="flex flex-wrap gap-2">
                                <button onClick={() => { navigator.clipboard.writeText(offer.message ?? offer.link ?? ""); toast.success("Offer message copied") }} className={btn2}><Copy size={12} /> Copy message</button>
                                <button onClick={() => { navigator.clipboard.writeText(offer.link ?? ""); toast.success("Link copied") }} className={btn2}><Copy size={12} /> Copy link only</button>
                                {wa && <a href={wa} target="_blank" rel="noreferrer" className={btn2}><MessageCircle size={12} /> Open in WhatsApp</a>}
                            </div>
                        </>
                    )}
                    {editing && (
                        <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <label className={lbl}>Designation<input value={f.designation} onChange={e => setF({ ...f, designation: e.target.value })} className={`${box} w-full`} /></label>
                                <label className={lbl}>Salary (₹/month)<input type="number" value={f.salary} onChange={e => setF({ ...f, salary: e.target.value })} className={`${box} w-full`} /></label>
                                <label className={lbl}>Joining date<input type="date" value={f.joiningDate} onChange={e => setF({ ...f, joiningDate: e.target.value })} className={`${box} w-full`} /></label>
                                <label className={lbl}>Site<select value={f.siteId} onChange={e => setF({ ...f, siteId: e.target.value })} className={`${box} w-full`}><option value="">—</option>{links?.sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                            </div>
                            <div className="flex justify-end gap-2"><button onClick={() => setEditing(false)} className={btn2}>Cancel</button><button onClick={saveOffer} disabled={busy || !f.designation.trim()} className={btn}>{busy && <Loader2 size={12} className="animate-spin" />}Save offer</button></div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export function InterviewRounds({ lead, users, canEdit, onChanged }: { lead: any; users: { id: string; name: string }[]; canEdit: boolean; onChanged: () => void }) {
    const [rows, setRows] = useState<any[] | null>(null)
    const [adding, setAdding] = useState(false)
    const [f, setF] = useState({ title: "", scheduledAt: "", mode: "In-person", location: "", interviewerId: "" })
    const [busy, setBusy] = useState(false)
    const [open, setOpen] = useState<any>(null)
    const load = useCallback(() => { fetch(`/api/recruitment/interviews?leadId=${lead.id}`).then(r => r.json()).then(j => setRows(j.interviews ?? [])).catch(() => setRows([])) }, [lead.id])
    useEffect(() => { load() }, [load])
    async function add() {
        setBusy(true)
        try { await post("/api/recruitment/interviews", { leadId: lead.id, ...f, scheduledAt: f.scheduledAt ? new Date(f.scheduledAt).toISOString() : "" }); toast.success("Interview scheduled"); setAdding(false); setF({ title: "", scheduledAt: "", mode: "In-person", location: "", interviewerId: "" }); load(); onChanged() } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    const tone: Record<string, string> = { SCHEDULED: "text-blue-700", DONE: "text-green-700", NO_SHOW: "text-red-600", CANCELLED: "text-gray-500" }
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between"><p className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wider">Interview rounds</p>{canEdit && !adding && <button onClick={() => setAdding(true)} className={btn2}><CalendarPlus size={12} /> Schedule round {((rows?.length ?? 0) + 1)}</button>}</div>
            {rows === null ? <Loader2 size={16} className="animate-spin text-[var(--text3)]" /> : !rows.length && !adding ? <p className="text-[12px] text-[var(--text3)]">No rounds yet.</p> : rows.map(r => {
                const sc = r.scores ? Object.values(r.scores as Record<string, number>) : []
                const avg = sc.length ? (sc.reduce((a, b) => a + b, 0) / sc.length).toFixed(1) : null
                return (
                    <button key={r.id} onClick={() => setOpen(r)} className="w-full text-left p-2.5 rounded-[9px] border border-[var(--border)] hover:border-[var(--accent)]">
                        <div className="flex justify-between gap-2 text-[12.5px]"><b>Round {r.round} · {r.title}</b><span className={`font-semibold ${tone[r.status] ?? ""}`}>{INTERVIEW_STATUS[r.status] ?? r.status}{r.result ? ` · ${INTERVIEW_RESULT[r.result]}` : ""}</span></div>
                        <p className="text-[11.5px] text-[var(--text3)]">{new Date(r.scheduledAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}{r.mode ? ` · ${r.mode}` : ""}{r.interviewerName ? ` · ${r.interviewerName}` : ""}{avg ? ` · score ${avg}/5` : ""}</p>
                        {r.feedback && <p className="text-[12px] text-[var(--text2)] mt-1 line-clamp-2">{r.feedback}</p>}
                    </button>
                )
            })}
            {adding && (
                <div className="p-3 rounded-[10px] border border-[var(--border)] space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                        <label className={lbl}>Round name<input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder={(rows?.length ?? 0) === 0 ? "HR round" : "Technical round"} className={`${box} w-full`} /></label>
                        <label className={lbl}>When<input type="datetime-local" value={f.scheduledAt} onChange={e => setF({ ...f, scheduledAt: e.target.value })} className={`${box} w-full`} /></label>
                        <label className={lbl}>Mode<select value={f.mode} onChange={e => setF({ ...f, mode: e.target.value })} className={`${box} w-full`}>{["In-person", "Phone", "Video Call", "WhatsApp Video"].map(m => <option key={m}>{m}</option>)}</select></label>
                        <label className={lbl}>Interviewer<select value={f.interviewerId} onChange={e => setF({ ...f, interviewerId: e.target.value })} className={`${box} w-full`}><option value="">—</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
                        <label className={`${lbl} col-span-2`}>Place / link (optional)<input value={f.location} onChange={e => setF({ ...f, location: e.target.value })} className={`${box} w-full`} /></label>
                    </div>
                    <div className="flex justify-end gap-2"><button onClick={() => setAdding(false)} className={btn2}>Cancel</button><button onClick={add} disabled={busy || !f.scheduledAt} className={btn}>Schedule</button></div>
                </div>
            )}
            {open && <InterviewResult iv={open} candidate={lead.candidateName} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); onChanged() }} />}
        </div>
    )
}
