"use client"

// Jobs & Refer — every employee can see open jobs and refer someone (or share
// their personal link), and follow what happened to their referrals.
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { Briefcase, Copy, Gift, IndianRupee, Loader2, MapPin, MessageCircle, Settings2, Trophy, UserPlus, X } from "lucide-react"

const box = "h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white"
const btn = "h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
const btn2 = "h-8 px-3 rounded-[8px] border border-[var(--border)] bg-white text-[12px] font-semibold text-[var(--text2)] inline-flex items-center gap-1 disabled:opacity-50"
const lbl = "block text-[11px] font-semibold uppercase text-[var(--text3)]"
const card = "bg-white border border-[var(--border)] rounded-[12px]"
const th = "text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)] border-b border-[var(--border)] bg-[var(--surface2)]"
const td = "px-3 py-2 border-b border-[var(--border)] text-[12.5px]"
const day = (s: string | null) => s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"
const salary = (j: any) => (j.salaryMin || j.salaryMax) ? `₹${(j.salaryMin ?? j.salaryMax).toLocaleString("en-IN")}${j.salaryMax && j.salaryMin && j.salaryMax !== j.salaryMin ? `–${j.salaryMax.toLocaleString("en-IN")}` : ""}/${j.salaryPeriod === "year" ? "yr" : "mo"}` : null

export default function ReferPage() {
    const [d, setD] = useState<any>(null)
    const [tab, setTab] = useState<"jobs" | "mine" | "all">("jobs")
    const [referFor, setReferFor] = useState<any>(null)
    const [settings, setSettings] = useState(false)
    const load = useCallback(() => { fetch("/api/refer").then(r => r.json()).then(setD).catch(() => toast.error("Couldn't load")) }, [])
    useEffect(() => { load() }, [load])
    if (!d) return <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--text3)]" /></div>
    const s = d.settings
    const linkFor = (jobId: string) => `${window.location.origin}/apply/job/${jobId}?ref=${d.me}`
    const shareText = (j: any) => `Job opening: ${j.title}${j.siteName ? ` at ${j.siteName}` : ""}${salary(j) ? `, ${salary(j)}` : ""}. Apply here: ${linkFor(j.id)}`
    return (
        <div className="max-w-[1150px] mx-auto p-4 md:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-[22px] font-bold text-[var(--text)]">Jobs &amp; Refer</h1>
                    <p className="text-[12.5px] text-[var(--text3)]">Know someone good? Refer them for an open job{s.bonusAmount ? <> — <b className="text-green-700">₹{s.bonusAmount.toLocaleString("en-IN")} bonus</b> when they complete {s.bonusAfterDays} days</> : ""}.</p>
                </div>
                <div className="flex gap-2">
                    {d.all && <Link href="/jobs" className={btn2}><Briefcase size={13} /> Manage jobs</Link>}
                    {d.canEditSettings && <button onClick={() => setSettings(true)} className={btn2} aria-label="Referral settings"><Settings2 size={14} /></button>}
                </div>
            </div>
            {s.bonusNote && <p className="text-[12.5px] text-green-800 bg-green-50 border border-green-200 rounded-[10px] px-3 py-2"><Gift size={13} className="inline mr-1" />{s.bonusNote}</p>}
            {!s.enabled && <p className="text-[13px] text-amber-800 bg-amber-50 rounded-[10px] px-3 py-2">Referrals are switched off right now.</p>}
            <div className="flex gap-1 border-b border-[var(--border)] overflow-x-auto">
                {([["jobs", `Open jobs (${d.jobs.length})`], ["mine", `My referrals (${d.mine.length})`], ...(d.all ? [["all", `All referrals (${d.all.referrals.length})`]] : [])] as [string, string][]).map(([k, l]) => (
                    <button key={k} onClick={() => setTab(k as any)} className={`px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px whitespace-nowrap ${tab === k ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text3)]"}`}>{l}</button>
                ))}
            </div>

            {tab === "jobs" && (!d.jobs.length ? <p className={`${card} p-6 text-center text-[13px] text-[var(--text3)]`}>No open jobs right now.</p> : (
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
                    {d.jobs.map((j: any) => (
                        <div key={j.id} className={`${card} p-4 flex flex-col gap-2`}>
                            <div className="flex justify-between gap-2"><b className="text-[15px]">{j.title}</b>{j.priority === "HIGH" && <span className="h-fit px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-[11px] font-semibold">Urgent</span>}</div>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-[var(--text2)]">
                                {(j.siteName || j.jobLocation) && <span className="inline-flex items-center gap-1"><MapPin size={12} />{j.siteName || j.jobLocation}</span>}
                                {salary(j) && <span className="inline-flex items-center gap-1"><IndianRupee size={12} />{salary(j)}</span>}
                                <span>{j.openings} opening{j.openings === 1 ? "" : "s"}</span>
                                {(j.workExpMin != null || j.freshersAllowed) && <span>{j.freshersAllowed && !j.workExpMin ? "Freshers OK" : `${j.workExpMin}${j.workExpMax ? `–${j.workExpMax}` : "+"} yrs`}</span>}
                            </div>
                            {j.description && <p className="text-[12.5px] text-[var(--text3)] line-clamp-3">{j.description}</p>}
                            <div className="flex flex-wrap gap-2 mt-auto pt-1">
                                <button disabled={!s.enabled} onClick={() => setReferFor(j)} className={btn}><UserPlus size={14} /> Refer a friend</button>
                                {s.publicLinks && s.enabled && <>
                                    <button onClick={() => { navigator.clipboard.writeText(shareText(j)); toast.success("Link copied — share it with your friend") }} className={btn2}><Copy size={12} /> Copy link</button>
                                    <a href={`https://wa.me/?text=${encodeURIComponent(shareText(j))}`} target="_blank" rel="noreferrer" className={btn2}><MessageCircle size={12} /> WhatsApp</a>
                                </>}
                            </div>
                        </div>
                    ))}
                </div>
            ))}

            {tab === "mine" && (!d.mine.length ? <p className={`${card} p-6 text-center text-[13px] text-[var(--text3)]`}>You haven&apos;t referred anyone yet. Pick a job under “Open jobs”.</p> : (
                <div className={`${card} overflow-x-auto`}><table className="w-full min-w-[560px]"><thead><tr><th className={th}>Person</th><th className={th}>Job</th><th className={th}>Referred on</th><th className={th}>Where they are</th>{s.bonusAmount > 0 && <th className={th}>Bonus</th>}</tr></thead>
                    <tbody>{d.mine.map((r: any) => {
                        const due = r.joinedAt ? new Date(new Date(r.joinedAt).getTime() + s.bonusAfterDays * 86_400_000) : null
                        return <tr key={r.id}><td className={`${td} font-semibold`}>{r.name}</td><td className={td}>{r.position}</td><td className={td}>{day(r.createdAt)}</td>
                            <td className={td}><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${r.joined ? "bg-green-50 text-green-700" : r.closed ? "bg-gray-100 text-gray-600" : "bg-blue-50 text-blue-700"}`}>{r.stage}</span></td>
                            {s.bonusAmount > 0 && <td className={td}>{!r.joined ? "—" : due && due <= new Date() ? <span className="text-green-700 font-semibold">Eligible</span> : `After ${day(due!.toISOString())}`}</td>}</tr>
                    })}</tbody></table></div>
            ))}

            {tab === "all" && d.all && (
                <div className="space-y-4">
                    <div><p className="text-[13px] font-bold mb-1.5 flex items-center gap-1"><Trophy size={14} className="text-amber-500" /> Top referrers</p>
                        <div className="flex flex-wrap gap-2">{d.all.leaderboard.slice(0, 10).map((x: any, i: number) => <span key={x.name + i} className={`${card} px-3 py-1.5 text-[12.5px]`}>{i + 1}. <b>{x.name}</b> · {x.referred} referred · <span className="text-green-700 font-semibold">{x.joined} joined</span></span>)}</div>
                    </div>
                    <div className={`${card} overflow-x-auto`}><table className="w-full min-w-[760px]"><thead><tr><th className={th}>Candidate</th><th className={th}>Job</th><th className={th}>Referred by</th><th className={th}>Recruiter</th><th className={th}>Stage</th><th className={th}>Date</th></tr></thead>
                        <tbody>{d.all.referrals.map((r: any) => <tr key={r.id}><td className={td}><Link href={`/recruitment?lead=${r.id}`} className="font-semibold hover:text-[var(--accent)]">{r.name}</Link></td><td className={td}>{r.position}</td><td className={td}>{r.referrer}</td><td className={td}>{r.recruiter ?? "—"}</td><td className={td}><span className={r.joined ? "text-green-700 font-semibold" : ""}>{r.stage}</span></td><td className={td}>{day(r.createdAt)}</td></tr>)}</tbody></table></div>
                </div>
            )}

            {referFor && <ReferModal job={referFor} onClose={() => setReferFor(null)} onSaved={() => { setReferFor(null); setTab("mine"); load() }} />}
            {settings && <SettingsModal initial={s} onClose={() => setSettings(false)} onSaved={() => { setSettings(false); load() }} />}
        </div>
    )
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k) }, [onClose])
    return createPortal(
        <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4">
            <div role="dialog" aria-modal="true" aria-label={title} className="bg-white border border-[var(--border)] shadow-xl overflow-y-auto w-full max-w-md max-h-[92vh] rounded-[14px]">
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[var(--border)]"><h3 className="text-[15px] font-semibold">{title}</h3><button onClick={onClose} aria-label="Close" className="p-1 text-[var(--text3)]"><X size={18} /></button></div>
                <div className="p-5 space-y-3">{children}</div>
            </div>
        </div>, document.body)
}

function ReferModal({ job, onClose, onSaved }: { job: any; onClose: () => void; onSaved: () => void }) {
    const [f, setF] = useState({ name: "", phone: "", city: "", experience: "", note: "" })
    const [file, setFile] = useState<File | null>(null)
    const [busy, setBusy] = useState(false)
    async function save() {
        setBusy(true)
        try {
            let resumeUrl: string | undefined
            if (file) {
                const fd = new FormData(); fd.append("file", file); fd.append("kind", "document")
                const u = await fetch("/api/upload", { method: "POST", body: fd }); const uj = await u.json().catch(() => ({}))
                if (!u.ok || !uj.url) throw new Error(uj.error || "Could not upload the resume (max 5 MB)")
                resumeUrl = uj.url
            }
            const r = await fetch("/api/refer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, resumeUrl, jobId: job.id }) })
            const j = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(j.error || "Could not save")
            toast.success(j.existing ? "Already with our recruiters — your referral is noted on their record" : "Thanks! Your referral is with the recruiters")
            onSaved()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    return (
        <Shell title={`Refer for ${job.title}`} onClose={onClose}>
            <label className={lbl}>Their name<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className={`${box} w-full`} /></label>
            <label className={lbl}>Mobile number<input inputMode="numeric" maxLength={10} value={f.phone} onChange={e => setF({ ...f, phone: e.target.value.replace(/\D/g, "") })} className={`${box} w-full`} /></label>
            <div className="grid grid-cols-2 gap-3">
                <label className={lbl}>City<input value={f.city} onChange={e => setF({ ...f, city: e.target.value })} className={`${box} w-full`} /></label>
                <label className={lbl}>Experience (yrs)<input inputMode="decimal" value={f.experience} onChange={e => setF({ ...f, experience: e.target.value })} className={`${box} w-full`} /></label>
            </div>
            <label className={lbl}>How do you know them / why a good fit (optional)<textarea value={f.note} onChange={e => setF({ ...f, note: e.target.value })} rows={2} className="w-full rounded-[9px] border border-[var(--border)] px-2.5 py-1.5 text-[13px]" /></label>
            <label className={lbl}>Resume (optional)<input type="file" accept=".pdf,.doc,.docx,image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} className="block text-[12.5px] mt-1" /></label>
            <p className="text-[11.5px] text-[var(--text3)]">Please tell them you are referring them — a recruiter will call.</p>
            <div className="flex justify-end gap-2"><button onClick={onClose} className={btn2}>Cancel</button><button onClick={save} disabled={busy || f.name.trim().length < 2 || f.phone.length !== 10} className={btn}>{busy && <Loader2 size={14} className="animate-spin" />}Send referral</button></div>
        </Shell>
    )
}

function SettingsModal({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: () => void }) {
    const [s, setS] = useState(initial)
    const [busy, setBusy] = useState(false)
    async function save() {
        setBusy(true)
        try { const r = await fetch("/api/refer", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Could not save"); toast.success("Saved"); onSaved() } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    return (
        <Shell title="Referral settings" onClose={onClose}>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={s.enabled} onChange={e => setS({ ...s, enabled: e.target.checked })} /> Employees can refer people for open jobs</label>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={s.publicLinks} onChange={e => setS({ ...s, publicLinks: e.target.checked })} /> Allow shareable job links (friend fills in their own details, no sign-in)</label>
            <div className="grid grid-cols-2 gap-3">
                <label className={lbl}>Bonus per joiner (₹, 0 = none)<input type="number" min={0} value={s.bonusAmount} onChange={e => setS({ ...s, bonusAmount: Number(e.target.value) })} className={`${box} w-full`} /></label>
                <label className={lbl}>Paid after (days worked)<input type="number" min={0} value={s.bonusAfterDays} onChange={e => setS({ ...s, bonusAfterDays: Number(e.target.value) })} className={`${box} w-full`} /></label>
            </div>
            <label className={lbl}>Note shown to employees (optional)<textarea value={s.bonusNote} onChange={e => setS({ ...s, bonusNote: e.target.value })} rows={2} placeholder="e.g. Bonus is paid with the next salary after the joiner completes 90 days." className="w-full rounded-[9px] border border-[var(--border)] px-2.5 py-1.5 text-[13px]" /></label>
            <p className="text-[11.5px] text-[var(--text3)]">The bonus is shown to employees only; payment is still done by HR.</p>
            <div className="flex justify-end gap-2"><button onClick={onClose} className={btn2}>Cancel</button><button onClick={save} disabled={busy} className={btn}>Save</button></div>
        </Shell>
    )
}
