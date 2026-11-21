"use client"

// On-the-job training sign-off — built for the supervisor's phone: pick the
// site, the person and the skill, choose the level they reached, sign off.
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, CheckCircle2, Loader2, Search } from "lucide-react"

const LEVELS = [
    { n: 1, label: "Theory done", hint: "Knows the steps, hasn't practised yet" },
    { n: 2, label: "Under supervision", hint: "Works with a supervisor watching" },
    { n: 3, label: "Independent", hint: "Works alone to the standard" },
    { n: 4, label: "Can train others", hint: "Can teach and check others" },
]
const TONE = ["bg-[var(--surface2)] text-[var(--text3)]", "bg-[#fef3c7] text-[#92400e]", "bg-[#dbeafe] text-[#1e40af]", "bg-[#dcfce7] text-[#166534]", "bg-[#166534] text-white"]

async function api<T = any>(url: string, body?: unknown): Promise<T> {
    const r = await fetch(url, body !== undefined ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d?.error || "Something went wrong")
    return d as T
}

export default function OjtPage() {
    const [sites, setSites] = useState<{ id: string; name: string }[] | null>(null)
    const [siteId, setSiteId] = useState("")
    const [data, setData] = useState<{ employees: any[]; skills: any[] } | null>(null)
    const [q, setQ] = useState("")
    const [emp, setEmp] = useState<any>(null)
    const [mine, setMine] = useState<{ levels: { skillId: string; level: number }[]; history: any[] }>({ levels: [], history: [] })
    const [skillId, setSkillId] = useState("")
    const [level, setLevel] = useState(3)
    const [notes, setNotes] = useState("")
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => { api<{ sites: any[] }>("/api/lms/ojt").then(d => { setSites(d.sites); if (d.sites.length === 1) setSiteId(d.sites[0].id) }).catch(e => setError(e.message)) }, [])
    useEffect(() => {
        setData(null); setEmp(null)
        if (siteId) api(`/api/lms/ojt?siteId=${siteId}`).then(setData).catch(e => toast.error(e.message))
    }, [siteId])
    useEffect(() => {
        if (emp) api(`/api/lms/ojt?siteId=${siteId}&employeeId=${emp.id}`).then(d => setMine({ levels: d.levels, history: d.history })).catch(() => {})
    }, [emp, siteId])

    const shown = useMemo(() => (data?.employees ?? []).filter(e => !q || `${e.firstName} ${e.lastName} ${e.employeeId}`.toLowerCase().includes(q.toLowerCase())), [data, q])
    const current = (sid: string) => mine.levels.find(l => l.skillId === sid)?.level ?? 0
    const skillName = (sid: string) => data?.skills.find(s => s.id === sid)?.name ?? "Skill"

    async function sign() {
        setBusy(true)
        try {
            await api("/api/lms/ojt", { employeeId: emp.id, skillId, level, notes })
            toast.success(`Signed off: ${skillName(skillId)} level ${level}`)
            setSkillId(""); setNotes("")
            const d = await api(`/api/lms/ojt?siteId=${siteId}&employeeId=${emp.id}`); setMine({ levels: d.levels, history: d.history })
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }

    if (error) return <div className="p-6 text-[13px] text-[#dc2626]">{error}</div>
    return (
        <div className="max-w-[560px] mx-auto space-y-3 pb-10">
            <Link href="/lms" className="inline-flex items-center gap-1 text-[12.5px] text-[var(--text3)]"><ArrowLeft className="h-3.5 w-3.5" /> Training</Link>
            <div>
                <h1 className="text-[22px] font-bold tracking-[-0.4px] text-[var(--text)]">On-the-job sign-off</h1>
                <p className="text-[13px] text-[var(--text3)]">Record the level a person has reached on a skill after training them on the line.</p>
            </div>

            <select className="w-full h-11 rounded-[10px] border border-[var(--border)] bg-white px-3 text-[14px]" value={siteId} onChange={e => setSiteId(e.target.value)}>
                <option value="">{sites === null ? "Loading sites…" : sites.length ? "Pick your site…" : "No sites assigned to you"}</option>
                {(sites ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>

            {siteId && !emp && (
                <div className="bg-white border border-[var(--border)] rounded-[12px]">
                    <div className="relative p-2 border-b border-[var(--border)]"><Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text3)]" /><input className="w-full h-10 pl-8 pr-3 rounded-[9px] bg-[var(--surface2)] text-[14px] outline-none" placeholder="Search person…" value={q} onChange={e => setQ(e.target.value)} /></div>
                    {!data ? <div className="p-4"><Loader2 className="h-5 w-5 animate-spin text-[var(--text3)]" /></div> : (
                        <div className="max-h-[60vh] overflow-y-auto divide-y divide-[var(--border)]">
                            {shown.map(e => (
                                <button key={e.id} onClick={() => setEmp(e)} className="w-full text-left px-4 py-3 active:bg-[var(--surface2)]">
                                    <p className="text-[14px] font-medium text-[var(--text)]">{e.firstName} {e.lastName}</p>
                                    <p className="text-[12px] text-[var(--text3)]">{e.employeeId}{e.designation ? ` · ${e.designation}` : ""}</p>
                                </button>
                            ))}
                            {!shown.length && <p className="p-4 text-[13px] text-[var(--text3)]">Nobody found.</p>}
                        </div>
                    )}
                </div>
            )}

            {emp && data && (
                <div className="space-y-3">
                    <div className="bg-white border border-[var(--border)] rounded-[12px] p-4 flex items-center justify-between">
                        <div><p className="text-[15px] font-semibold">{emp.firstName} {emp.lastName}</p><p className="text-[12px] text-[var(--text3)]">{emp.employeeId}{emp.designation ? ` · ${emp.designation}` : ""}</p></div>
                        <button className="text-[12.5px] text-[var(--accent)]" onClick={() => setEmp(null)}>Change</button>
                    </div>
                    <div className="bg-white border border-[var(--border)] rounded-[12px] p-4 space-y-2">
                        <p className="text-[12px] font-semibold text-[var(--text3)] uppercase tracking-wide">Skill</p>
                        {data.skills.length === 0 ? <p className="text-[13px] text-[var(--text3)]">No skills set up for this site yet (Training → Skill matrix).</p> : data.skills.map(s => (
                            <button key={s.id} onClick={() => { setSkillId(s.id); setLevel(Math.min(4, Math.max(3, current(s.id) + 1))) }}
                                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-[10px] border text-left ${skillId === s.id ? "border-[var(--accent)] bg-[var(--accent-light)]" : "border-[var(--border)]"}`}>
                                <span className="text-[13.5px]">{s.name}</span>
                                <span className={`h-6 w-7 shrink-0 rounded-[5px] font-mono text-[12px] font-semibold flex items-center justify-center ${TONE[current(s.id)]}`}>{current(s.id)}</span>
                            </button>
                        ))}
                    </div>
                    {skillId && (
                        <div className="bg-white border border-[var(--border)] rounded-[12px] p-4 space-y-2">
                            <p className="text-[12px] font-semibold text-[var(--text3)] uppercase tracking-wide">Level reached</p>
                            {LEVELS.map(l => (
                                <button key={l.n} onClick={() => setLevel(l.n)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] border text-left ${level === l.n ? "border-[var(--accent)] bg-[var(--accent-light)]" : "border-[var(--border)]"}`}>
                                    <span className={`h-7 w-8 shrink-0 rounded-[6px] font-mono font-semibold flex items-center justify-center ${TONE[l.n]}`}>{l.n}</span>
                                    <span><span className="block text-[13.5px] font-medium">{l.label}</span><span className="block text-[11.5px] text-[var(--text3)]">{l.hint}</span></span>
                                </button>
                            ))}
                            <textarea rows={2} className="w-full rounded-[10px] border border-[var(--border)] p-2.5 text-[13.5px] outline-none" placeholder="Notes (what was checked, parts, shift)…" value={notes} onChange={e => setNotes(e.target.value)} />
                            <button onClick={sign} disabled={busy} className="w-full h-11 rounded-[10px] bg-[var(--accent)] text-white text-[14px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Sign off level {level}
                            </button>
                        </div>
                    )}
                    {mine.history.length > 0 && (
                        <div className="bg-white border border-[var(--border)] rounded-[12px] p-4">
                            <p className="text-[12px] font-semibold text-[var(--text3)] uppercase tracking-wide mb-2">Recent sign-offs</p>
                            {mine.history.map(h => <p key={h.id} className="text-[12.5px] text-[var(--text2)] py-0.5">{new Date(h.signedAt).toLocaleDateString("en-GB")} · {skillName(h.skillId)} → level {h.level}{h.notes ? ` · ${h.notes}` : ""}</p>)}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
