"use client"
import { ModuleTabs } from "@/components/ModuleTabs"

// Onboarding → Joining checklist. Board: everyone in onboarding (and recent
// joiners with tasks open) by stage, with how long they have been stuck.
// Click a person for their checklist — most tasks tick themselves. Template:
// the tasks, owners, due days and which ones must be done before approval.
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { ArrowLeft, Check, Circle, Loader2, Plus, Trash2, X, Zap } from "lucide-react"
import { AUTO_CHECKS, OWNERS, STAGES, type AutoCheck, type ChecklistSettings, type CheckTask, type Stage } from "@/lib/onboarding-checklist"
import { EMPLOYMENT_TYPES } from "@/lib/employment-type"

type Card = { recordId: string; employeeId: string; code: string; name: string; designation: string | null; site: string | null; recruiter: string | null; stage: Stage; days: number; stuck: boolean; joiningDate: string | null; done: number; total: number; blocking: string[]; overdue: number; nextTask: string | null }
type Board = { settings: ChecklistSettings; cards: Card[]; canManage: boolean; sites: { id: string; name: string }[] }
type TaskState = { id: string; title: string; owner: string; auto: AutoCheck | null; autoLabel: string | null; beforeApproval: boolean; done: boolean; doneAt: string | null; doneBy: string | null; note: string | null; dueDate: string | null; overdue: boolean }

const ORDER: Stage[] = ["DOCS", "POLICIES", "SETUP", "READY", "JOINED", "ON_HOLD"]
const TONE: Record<Stage, string> = { DOCS: "border-t-amber-400", POLICIES: "border-t-violet-400", SETUP: "border-t-blue-400", READY: "border-t-green-500", JOINED: "border-t-teal-500", ON_HOLD: "border-t-gray-400" }
const box = "h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white"
const btn = "h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
const btn2 = "h-9 px-3 rounded-[9px] border border-[var(--border)] bg-white text-[12.5px] font-semibold text-[var(--text2)] inline-flex items-center gap-1.5"
const day = (s: string | null) => s ? new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"

export default function ChecklistPage() {
    const [d, setD] = useState<Board | null>(null)
    const [tab, setTab] = useState<"board" | "template">("board")
    const [open, setOpen] = useState<Card | null>(null)
    const load = useCallback(() => { fetch("/api/onboarding/checklist").then(r => r.json()).then(setD).catch(() => toast.error("Couldn't load")) }, [])
    useEffect(() => { load() }, [load])
    useEffect(() => { // ?id=<employeeId> from the Onboarding list opens that person
        const id = new URLSearchParams(window.location.search).get("id")
        if (id && d) { const c = d.cards.find(x => x.employeeId === id); if (c) setOpen(c) }
    }, [d])
    if (!d) return <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--text3)]" /></div>
    return (
        <div className="max-w-[1400px] mx-auto p-4 md:p-6 lg:p-0 space-y-4">
            <ModuleTabs group="onboarding" />
            <div>
                <h2 className="text-[17px] font-bold text-[var(--text)]">Joining checklist</h2>
                <p className="text-[12.5px] text-[var(--text3)]">Where every new joiner stands, what is holding them up, and who has to act.</p>
            </div>
            <div className="flex gap-1 border-b border-[var(--border)]">
                {([["board", "Board"], ["template", "Checklist & approval rules"]] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px ${tab === k ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text3)]"}`}>{l}</button>
                ))}
            </div>
            {tab === "board" ? <BoardView d={d} onOpen={setOpen} /> : <Template d={d} onSaved={() => { load(); setTab("board") }} />}
            {open && <Person card={open} onClose={() => setOpen(null)} onChanged={load} />}
        </div>
    )
}

function BoardView({ d, onOpen }: { d: Board; onOpen: (c: Card) => void }) {
    const [site, setSite] = useState(""), [rec, setRec] = useState(""), [q, setQ] = useState(""), [stuckOnly, setStuckOnly] = useState(false)
    const sites = Array.from(new Set(d.cards.map(c => c.site ?? "No site"))).sort()
    const recs = Array.from(new Set(d.cards.map(c => c.recruiter ?? "—"))).sort()
    const cards = useMemo(() => d.cards.filter(c => (!site || (c.site ?? "No site") === site) && (!rec || (c.recruiter ?? "—") === rec) && (!stuckOnly || c.stuck) && (!q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()) || c.code.toLowerCase().includes(q.trim().toLowerCase()))), [d.cards, site, rec, q, stuckOnly])
    const stuck = d.cards.filter(c => c.stuck).length
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or code" className={`${box} min-w-[180px]`} />
                <select value={site} onChange={e => setSite(e.target.value)} className={box} aria-label="Site"><option value="">All sites</option>{sites.map(s => <option key={s}>{s}</option>)}</select>
                <select value={rec} onChange={e => setRec(e.target.value)} className={box} aria-label="Recruiter / HR"><option value="">All HR</option>{recs.map(s => <option key={s}>{s}</option>)}</select>
                <label className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" checked={stuckOnly} onChange={e => setStuckOnly(e.target.checked)} /> Only stuck ({stuck})</label>
                <span className="text-[12px] text-[var(--text3)]">Stuck = more than {d.settings.stuckAfterDays} day(s) in a stage, or a joiner with an overdue task.</span>
            </div>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                {ORDER.map(st => {
                    const list = cards.filter(c => c.stage === st)
                    return (
                        <div key={st} className={`bg-[var(--surface2)] rounded-[12px] border border-[var(--border)] border-t-4 ${TONE[st]} p-2 min-h-[120px]`}>
                            <p className="px-1 pb-2 text-[12px] font-bold text-[var(--text2)] flex justify-between"><span>{STAGES[st]}</span><span className="tabular-nums">{list.length}</span></p>
                            <div className="space-y-2 max-h-[65vh] overflow-y-auto">
                                {list.map(c => (
                                    <button key={c.recordId} onClick={() => onOpen(c)} className={`block w-full text-left bg-white rounded-[10px] border p-2.5 hover:border-[var(--accent)] ${c.stuck ? "border-red-300" : "border-[var(--border)]"}`}>
                                        <div className="flex justify-between gap-2"><b className="text-[13px] truncate">{c.name}</b><span className={`text-[11px] font-semibold whitespace-nowrap ${c.stuck ? "text-red-600" : "text-[var(--text3)]"}`}>{c.days}d</span></div>
                                        <p className="text-[11px] text-[var(--text3)] truncate">{[c.designation, c.site].filter(Boolean).join(" · ") || "—"}</p>
                                        <div className="mt-1.5 h-1.5 rounded-full bg-[var(--surface2)] overflow-hidden"><div className="h-full bg-[var(--accent)]" style={{ width: `${c.total ? Math.round(c.done / c.total * 100) : 0}%` }} /></div>
                                        <p className="text-[11px] text-[var(--text2)] mt-1">{c.done}/{c.total} done{c.overdue ? <span className="text-red-600"> · {c.overdue} overdue</span> : null}</p>
                                        {c.blocking.length > 0 && <p className="text-[11px] text-amber-800 mt-0.5 line-clamp-2">Waiting: {c.blocking.join(", ")}</p>}
                                        {st === "JOINED" && c.nextTask && <p className="text-[11px] text-[var(--text3)] mt-0.5 truncate">Next: {c.nextTask}</p>}
                                    </button>
                                ))}
                                {!list.length && <p className="text-[11.5px] text-[var(--text3)] px-1">Nobody here.</p>}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function Person({ card, onClose, onChanged }: { card: Card; onClose: () => void; onChanged: () => void }) {
    const [d, setD] = useState<{ checklist: { tasks: TaskState[]; done: number; total: number } | null; canTick: boolean } | null>(null)
    const [busy, setBusy] = useState<string | null>(null)
    const load = useCallback(() => { fetch(`/api/onboarding/checklist?employeeId=${card.employeeId}`).then(r => r.json()).then(setD).catch(() => toast.error("Couldn't load")) }, [card.employeeId])
    useEffect(() => { load() }, [load])
    useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k) }, [onClose])
    async function tick(t: TaskState, done: boolean) {
        let note: string | null = null
        if (done && t.auto) { note = prompt(`"${t.title}" normally ticks itself (${t.autoLabel}). Tick it by hand anyway? Add a note, e.g. "given on paper":`); if (note === null) return }
        setBusy(t.id)
        try {
            const r = await fetch("/api/onboarding/checklist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeId: card.employeeId, taskId: t.id, done, note }) })
            if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "Could not save")
            load(); onChanged()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
    }
    const groups: [string, (t: TaskState) => boolean][] = [["Before approval", t => t.beforeApproval], ["After joining", t => !t.beforeApproval]]
    return createPortal(
        <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} className="fixed inset-0 z-[1000] bg-black/40 flex justify-end">
            <div role="dialog" aria-modal="true" aria-label={`Checklist for ${card.name}`} className="w-full max-w-md h-full overflow-y-auto bg-white border-l border-[var(--border)] shadow-xl">
                <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-[var(--border)]">
                    <div><h3 className="text-[15px] font-semibold">{card.name}</h3><p className="text-[12px] text-[var(--text3)]">{[card.code.startsWith("PENDING-") ? "Pending" : card.code, card.designation, card.site].filter(Boolean).join(" · ")}{card.joiningDate ? ` · joins ${day(card.joiningDate)}` : ""}</p></div>
                    <button onClick={onClose} aria-label="Close" className="p-1 text-[var(--text3)]"><X size={18} /></button>
                </div>
                {!d ? <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-[var(--text3)]" /></div> : !d.checklist ? <p className="p-5 text-[13px] text-[var(--text3)]">No checklist.</p> : (
                    <div className="p-4 space-y-4">
                        {groups.map(([label, f]) => {
                            const list = d.checklist!.tasks.filter(f)
                            if (!list.length) return null
                            return (
                                <div key={label}>
                                    <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text3)] mb-1.5">{label}</p>
                                    <div className="space-y-1.5">
                                        {list.map(t => (
                                            <div key={t.id} className={`flex items-start gap-2.5 rounded-[10px] border px-3 py-2 ${t.done ? "border-green-200 bg-green-50/50" : t.overdue ? "border-red-200" : "border-[var(--border)]"}`}>
                                                <button disabled={!d.canTick || busy === t.id || (t.done && !!t.auto && !t.doneBy)} onClick={() => tick(t, !t.done)} aria-label={t.done ? `Untick ${t.title}` : `Tick ${t.title}`} className="mt-0.5 disabled:cursor-default">
                                                    {busy === t.id ? <Loader2 size={18} className="animate-spin" /> : t.done ? <Check size={18} className="text-green-600" /> : <Circle size={18} className="text-[var(--text3)]" />}
                                                </button>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[13px] font-medium">{t.title}</p>
                                                    <p className="text-[11px] text-[var(--text3)]">
                                                        {t.owner}{t.dueDate ? ` · due ${day(t.dueDate)}` : ""}{t.overdue ? <span className="text-red-600 font-semibold"> · overdue</span> : null}
                                                        {t.auto && <span className="inline-flex items-center gap-0.5 ml-1"><Zap size={10} /> {t.done && !t.doneBy ? "done automatically" : `ticks itself: ${t.autoLabel?.toLowerCase()}`}</span>}
                                                        {t.doneBy && ` · ticked by ${t.doneBy}`}{t.note ? ` · ${t.note.replace(t.title + " — ", "")}` : ""}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )
                        })}
                        <p className="text-[11.5px] text-[var(--text3)]">Tasks with <Zap size={10} className="inline" /> tick themselves when it really happens — the document is uploaded, the salary is set, the kit is issued in Assets, a course is assigned in Learning.</p>
                        <Link href="/onboarding" className="text-[12.5px] text-[var(--accent)] font-semibold">Review and approve in Onboarding →</Link>
                    </div>
                )}
            </div>
        </div>, document.body)
}

function Template({ d, onSaved }: { d: Board; onSaved: () => void }) {
    const [s, setS] = useState<ChecklistSettings>(d.settings)
    const [busy, setBusy] = useState(false)
    const can = d.canManage
    const setT = (id: string, p: Partial<CheckTask>) => setS(x => ({ ...x, tasks: x.tasks.map(t => t.id === id ? { ...t, ...p } : t) }))
    const move = (i: number, dir: -1 | 1) => setS(x => { const a = [...x.tasks]; const j = i + dir; if (j < 0 || j >= a.length) return x; [a[i], a[j]] = [a[j], a[i]]; return { ...x, tasks: a } })
    async function save() {
        setBusy(true)
        try { const r = await fetch("/api/onboarding/checklist", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) }); if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "Could not save"); toast.success("Checklist saved"); onSaved() }
        catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    const lbl = "block text-[10.5px] font-semibold uppercase text-[var(--text3)]"
    return (
        <div className="space-y-3 max-w-5xl">
            <div className="bg-white border border-[var(--border)] rounded-[12px] p-4 grid sm:grid-cols-2 gap-3 text-[13px]">
                <label className="flex items-center gap-2">With checks still open, who may approve anyway?
                    <select disabled={!can} value={s.override} onChange={e => setS(x => ({ ...x, override: e.target.value as ChecklistSettings["override"] }))} className={box}><option value="approvers">Any approver</option><option value="admins">Only admins</option><option value="none">Nobody</option></select></label>
                <label className="flex items-center gap-2"><input type="checkbox" disabled={!can} checked={s.docsBypass} onChange={e => setS(x => ({ ...x, docsBypass: e.target.checked }))} /> Allow approving without KYC documents <span className="text-[11.5px] text-red-600">(off = nobody becomes Active without them)</span></label>
                <label className="flex items-center gap-2">People added by Excel / CLMS import start as
                    <select disabled={!can} value={s.importAs} onChange={e => setS(x => ({ ...x, importAs: e.target.value as ChecklistSettings["importAs"] }))} className={box}><option value="ONBOARDING">Onboarding — documents and approval first</option><option value="ACTIVE">Active straight away</option></select></label>
                <label className="flex items-center gap-2"><input type="checkbox" disabled={!can} checked={s.blockDuplicates} onChange={e => setS(x => ({ ...x, blockDuplicates: e.target.checked }))} /> Stop approval when Aadhaar / PAN / bank / mobile match another employee</label>
                <label className="flex items-center gap-2">Warn when the joining date is more than<input type="number" min={0} disabled={!can} value={s.oldJoiningDays} onChange={e => setS(x => ({ ...x, oldJoiningDays: Number(e.target.value) }))} className={`${box} w-20`} /> days ago (0 = off)</label>
                <label className="flex items-center gap-2">Stuck after<input type="number" min={1} disabled={!can} value={s.stuckAfterDays} onChange={e => setS(x => ({ ...x, stuckAfterDays: Number(e.target.value) }))} className={`${box} w-20`} /> day(s) in a stage</label>
                <label className="flex items-center gap-2">Keep joiners on the board for<input type="number" min={1} disabled={!can} value={s.followUpDays} onChange={e => setS(x => ({ ...x, followUpDays: Number(e.target.value) }))} className={`${box} w-20`} /> days after approval</label>
            </div>
            <div className="space-y-2">
                {s.tasks.map((t, i) => (
                    <div key={t.id} className="bg-white border border-[var(--border)] rounded-[12px] p-3 grid gap-2 sm:grid-cols-[1fr_130px_200px_90px_auto] items-end">
                        <label className={lbl}>Task<input disabled={!can} value={t.title} onChange={e => setT(t.id, { title: e.target.value })} className={`${box} w-full`} /></label>
                        <label className={lbl}>Owner<select disabled={!can} value={t.owner} onChange={e => setT(t.id, { owner: e.target.value as CheckTask["owner"] })} className={`${box} w-full`}>{OWNERS.map(o => <option key={o}>{o}</option>)}</select></label>
                        <label className={lbl}>Ticks itself when<select disabled={!can} value={t.auto ?? ""} onChange={e => setT(t.id, { auto: (e.target.value || null) as AutoCheck | null })} className={`${box} w-full`}><option value="">— ticked by hand —</option>{(Object.keys(AUTO_CHECKS) as AutoCheck[]).map(k => <option key={k} value={k}>{AUTO_CHECKS[k]}</option>)}</select></label>
                        <label className={lbl}>Due (days after joining)<input type="number" disabled={!can} value={t.dueDays} onChange={e => setT(t.id, { dueDays: Number(e.target.value) })} className={`${box} w-full`} /></label>
                        <div className="flex items-center gap-1.5 pb-1">
                            <label className="flex items-center gap-1 text-[12px] whitespace-nowrap"><input type="checkbox" disabled={!can} checked={t.beforeApproval} onChange={e => setT(t.id, { beforeApproval: e.target.checked })} /> Before approval</label>
                            {can && <><button onClick={() => move(i, -1)} className="px-1 text-[var(--text3)]" aria-label="Move up">↑</button><button onClick={() => move(i, 1)} className="px-1 text-[var(--text3)]" aria-label="Move down">↓</button><button onClick={() => setS(x => ({ ...x, tasks: x.tasks.filter(y => y.id !== t.id) }))} className="text-red-600 p-1" aria-label={`Remove ${t.title}`}><Trash2 size={15} /></button></>}
                        </div>
                        <details className="sm:col-span-5 text-[12px]">
                            <summary className="cursor-pointer text-[var(--text3)]">Only for… {[t.employmentTypes.length && `${t.employmentTypes.length} type(s)`, t.siteIds.length && `${t.siteIds.length} site(s)`, t.designations.length && t.designations.join(", ")].filter(Boolean).join(" · ") || "everyone"}</summary>
                            <div className="grid sm:grid-cols-3 gap-2 mt-2">
                                <label className={lbl}>Employment types<select multiple disabled={!can} value={t.employmentTypes} onChange={e => setT(t.id, { employmentTypes: Array.from(e.target.selectedOptions).map(o => o.value) })} className="w-full h-20 rounded-[9px] border border-[var(--border)] text-[12.5px]">{EMPLOYMENT_TYPES.map(x => <option key={x}>{x}</option>)}</select></label>
                                <label className={lbl}>Sites<select multiple disabled={!can} value={t.siteIds} onChange={e => setT(t.id, { siteIds: Array.from(e.target.selectedOptions).map(o => o.value) })} className="w-full h-20 rounded-[9px] border border-[var(--border)] text-[12.5px]">{d.sites.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
                                <label className={lbl}>Designation contains (comma-separated)<input disabled={!can} value={t.designations.join(", ")} onChange={e => setT(t.id, { designations: e.target.value.split(",").map(x => x.trim()).filter(Boolean) })} className={`${box} w-full`} placeholder="e.g. Inspector, Supervisor" /></label>
                            </div>
                        </details>
                    </div>
                ))}
            </div>
            {can && <div className="flex gap-2"><button className={btn2} onClick={() => setS(x => ({ ...x, tasks: [...x.tasks, { id: `t${Math.random().toString(36).slice(2, 9)}`, title: "New task", owner: "HR", auto: null, beforeApproval: false, dueDays: 0, employmentTypes: [], siteIds: [], designations: [] }] }))}><Plus size={14} /> Add task</button><button className={btn} onClick={save} disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />}Save</button></div>}
        </div>
    )
}
