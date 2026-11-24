"use client"

// Public job page from a shared referral link: /apply/job/<jobId>?ref=<employee>.
// The person fills in a few details and lands in Recruitment as a referral.
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Briefcase, CheckCircle2, Clock, IndianRupee, Loader2, MapPin, Send } from "lucide-react"

const inp = "w-full h-11 rounded-[10px] border border-gray-300 px-3 text-[15px] bg-white outline-none focus:border-[var(--accent)]"

export default function PublicJob() {
    const { id } = useParams<{ id: string }>()
    const [d, setD] = useState<any>(null)
    const [err, setErr] = useState("")
    const [ref, setRef] = useState("")
    const [f, setF] = useState({ name: "", phone: "", city: "", experience: "", note: "", website: "" })
    const [busy, setBusy] = useState(false)
    const [done, setDone] = useState(false)
    useEffect(() => {
        const r = new URLSearchParams(window.location.search).get("ref") || ""
        setRef(r)
        fetch(`/api/refer/public?job=${encodeURIComponent(id)}${r ? `&ref=${encodeURIComponent(r)}` : ""}`).then(async x => { const j = await x.json(); if (!x.ok) setErr(j.error || "This job is not available."); else setD(j) }).catch(() => setErr("Could not load. Check your internet."))
    }, [id])
    async function send(e: React.FormEvent) {
        e.preventDefault(); setBusy(true); setErr("")
        try {
            const r = await fetch("/api/refer/public", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, jobId: id, ref }) })
            const j = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(j.error || "Could not send")
            setDone(true)
        } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
    }
    if (!d && !err) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-gray-400" /></div>
    const j = d?.job
    const sal = j && (j.salaryMin || j.salaryMax) ? `₹${(j.salaryMin ?? j.salaryMax).toLocaleString("en-IN")}${j.salaryMax && j.salaryMin && j.salaryMax !== j.salaryMin ? ` – ₹${j.salaryMax.toLocaleString("en-IN")}` : ""} / ${j.salaryPeriod || "month"}` : null
    const exp = j ? (j.freshersAllowed && !j.workExpMin ? "Freshers welcome" : j.workExpMin != null ? `${j.workExpMin}${j.workExpMax ? `–${j.workExpMax}` : "+"} years experience` : null) : null
    return (
        <div className="min-h-screen bg-[#f3f6fb] py-6 px-4">
            <div className="max-w-[560px] mx-auto space-y-4">
                <p className="text-center text-[13px] font-semibold text-gray-500">{d?.company ?? ""}</p>
                {err && !j && <div className="bg-white rounded-[16px] p-6 text-center text-gray-600">{err}</div>}
                {j && (
                    <div className="bg-white rounded-[16px] p-5 shadow-sm space-y-3">
                        {d.referrer && <p className="text-[13px] text-[var(--accent-text)] bg-[var(--accent-light)] rounded-[10px] px-3 py-2">{d.referrer} thinks you&apos;d be a good fit for this job.</p>}
                        <h1 className="text-[22px] font-bold text-gray-900 flex items-start gap-2"><Briefcase className="mt-1 shrink-0 text-[var(--accent)]" size={20} />{j.title}</h1>
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13.5px] text-gray-700">
                            {(j.siteName || j.jobLocation || j.plantLocation) && <span className="inline-flex items-center gap-1"><MapPin size={14} />{j.jobLocation || j.plantLocation || j.siteName}</span>}
                            {sal && <span className="inline-flex items-center gap-1"><IndianRupee size={14} />{sal}</span>}
                            {exp && <span className="inline-flex items-center gap-1"><Clock size={14} />{exp}</span>}
                            {j.shiftType && <span>{j.shiftType} shift</span>}
                            {j.openings > 1 && <span>{j.openings} openings</span>}
                        </div>
                        {[j.canteenAvailable && "Canteen", (j.transportAvailable || j.busFacility) && "Transport", j.accommodationAvailable && "Accommodation", ...(j.perks ?? [])].filter(Boolean).length > 0 && (
                            <div className="flex flex-wrap gap-1.5">{[j.canteenAvailable && "Canteen", (j.transportAvailable || j.busFacility) && "Transport", j.accommodationAvailable && "Accommodation", ...(j.perks ?? [])].filter(Boolean).map((p: string) => <span key={p} className="px-2.5 py-1 rounded-full bg-green-50 text-green-800 text-[12px]">{p}</span>)}</div>
                        )}
                        {j.description && <p className="text-[14px] text-gray-700 whitespace-pre-wrap">{j.description}</p>}
                    </div>
                )}
                {j && (done ? (
                    <div className="bg-white rounded-[16px] p-6 shadow-sm text-center space-y-2"><CheckCircle2 className="mx-auto text-green-600" size={40} /><p className="text-[17px] font-bold">Thank you! We got your details.</p><p className="text-[14px] text-gray-600">Our recruiter will call you soon.</p></div>
                ) : (
                    <form onSubmit={send} className="bg-white rounded-[16px] p-5 shadow-sm space-y-3">
                        <p className="text-[16px] font-bold">Interested? Send your details</p>
                        <input aria-label="Full name" required placeholder="Full name *" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className={inp} />
                        <input aria-label="Mobile number" required inputMode="numeric" maxLength={10} placeholder="Mobile number *" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value.replace(/\D/g, "") })} className={inp} />
                        <div className="grid grid-cols-2 gap-3">
                            <input aria-label="City" placeholder="City" value={f.city} onChange={e => setF({ ...f, city: e.target.value })} className={inp} />
                            <input aria-label="Experience in years" inputMode="decimal" placeholder="Experience (years)" value={f.experience} onChange={e => setF({ ...f, experience: e.target.value })} className={inp} />
                        </div>
                        <textarea aria-label="Anything else" placeholder="Anything you want to tell us (optional)" rows={3} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} className="w-full rounded-[10px] border border-gray-300 px-3 py-2 text-[15px] outline-none focus:border-[var(--accent)]" />
                        <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={e => setF({ ...f, website: e.target.value })} className="hidden" />
                        {err && <p className="text-[13px] text-red-600">{err}</p>}
                        <button disabled={busy || f.name.trim().length < 2 || f.phone.length !== 10} className="w-full h-12 rounded-[12px] bg-[var(--accent)] text-white text-[15px] font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2">{busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={17} />}Send my details</button>
                        <p className="text-[11.5px] text-gray-500 text-center">Your details are used only for this job application.</p>
                    </form>
                ))}
            </div>
        </div>
    )
}
