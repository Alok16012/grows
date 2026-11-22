"use client"

// Tasks: assign work to people (or a whole site / department), track it to done,
// approve or send back, talk in comments. My tasks · Assigned by me · Team board · Report.
import { useCallback, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { AlertTriangle, CheckCircle2, Loader2, MessageSquare, Paperclip, Plus, Settings2, X } from "lucide-react"
import { PRIORITIES, TASK_STATUS, type Priority, type TaskStatus, type TaskSettings } from "@/lib/tasks"

type Task = { id: string; taskNo: string; title: string; description: string | null; priority: Priority; status: TaskStatus; dueAt: string | null; assigneeId: string; assigneeName: string; createdBy: string; createdByName: string; needsApproval: boolean; completedAt: string | null; completionNote: string | null; returnedNote: string | null; comments: number; attachments: { name: string; url: string }[] | null; createdAt: string; groupId: string | null }
type List = { me: string; canAssign: boolean; canSeeTeam: boolean; counts: { myOpen: number; myOverdue: number; awaitingMine: number }; tasks: Task[] }
const box = "h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white"
const btn = "h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
const btn2 = "h-8 px-3 rounded-[8px] border border-[var(--border)] bg-white text-[12px] font-semibold text-[var(--text2)] inline-flex items-center gap-1 disabled:opacity-50"
const lbl = "block text-[11px] font-semibold uppercase text-[var(--text3)]"
const PCOLOR: Record<Priority, string> = { LOW: "bg-gray-100 text-gray-600", MEDIUM: "bg-blue-50 text-blue-700", HIGH: "bg-amber-50 text-amber-800", URGENT: "bg-red-50 text-red-700" }
const SCOLOR: Record<TaskStatus, string> = { TODO: "border-t-gray-400", IN_PROGRESS: "border-t-blue-500", AWAITING_APPROVAL: "border-t-amber-500", DONE: "border-t-green-500", CANCELLED: "border-t-gray-300" }
const when = (s: string | null) => s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "No due date"
const overdue = (t: Task) => !!t.dueAt && (t.status === "TODO" || t.status === "IN_PROGRESS") && new Date(t.dueAt) < new Date()

async function api(url: string, body?: any, method = "POST") {
    const r = await fetch(url, body === undefined ? undefined : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j?.error || "Something went wrong")
    return j
}
async function uploadFiles(files: File[]) {
    const out: { name: string; url: string }[] = []
    for (const f of files) {
        const fd = new FormData(); fd.append("file", f); fd.append("kind", "attachment")
        const r = await fetch("/api/upload", { method: "POST", body: fd }); const j = await r.json().catch(() => ({}))
        if (!r.ok || !j.url) throw new Error(j.error || `Could not upload ${f.name} (max 5 MB)`)
        out.push({ name: f.name, url: j.url })
    }
    return out
}

export default function TasksPage() {
    const [view, setView] = useState<"mine" | "byme" | "team" | "report">("mine")
    const [status, setStatus] = useState("open")
    const [q, setQ] = useState("")
    const [d, setD] = useState<List | null>(null)
    const [open, setOpen] = useState<string | null>(null)
    const [creating, setCreating] = useState(false)
    const [settings, setSettings] = useState(false)
    const [meta, setMeta] = useState<{ canEditSettings: boolean } | null>(null)
    const load = useCallback(() => {
        if (view === "report") return
        fetch(`/api/tasks?${new URLSearchParams({ view, status: view === "team" ? "all" : status, q })}`).then(r => r.json()).then(setD).catch(() => toast.error("Couldn't load"))
    }, [view, status, q])
    useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t) }, [load, q])
    useEffect(() => { fetch("/api/tasks/meta").then(r => r.json()).then(setMeta).catch(() => {}) }, [])
    const c = d?.counts
    return (
        <div className="max-w-[1250px] mx-auto p-4 md:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-[22px] font-bold text-[var(--text)]">Tasks</h1>
                    <p className="text-[12.5px] text-[var(--text3)]">{c ? <>{c.myOpen} open for you{c.myOverdue ? <span className="text-red-600 font-semibold"> · {c.myOverdue} overdue</span> : null}{c.awaitingMine ? <span className="text-amber-700 font-semibold"> · {c.awaitingMine} waiting for your approval</span> : null}</> : "Assign work, track it to done."}</p>
                </div>
                <div className="flex gap-2">
                    {meta?.canEditSettings && <button onClick={() => setSettings(true)} className={btn2} aria-label="Task settings"><Settings2 size={14} /></button>}
                    {d?.canAssign && <button onClick={() => setCreating(true)} className={btn}><Plus size={14} /> New task</button>}
                </div>
            </div>
            <div className="flex gap-1 border-b border-[var(--border)] overflow-x-auto">
                {([["mine", "My tasks"], ["byme", "Assigned by me"], ...(d?.canSeeTeam ? [["team", "Team board"], ["report", "Report"]] : [])] as [string, string][]).map(([k, l]) => (
                    <button key={k} onClick={() => setView(k as any)} className={`px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px whitespace-nowrap ${view === k ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text3)]"}`}>{l}</button>
                ))}
            </div>
            {view === "report" ? <Report /> : (
                <>
                    <div className="flex flex-wrap items-center gap-2">
                        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search task or TSK no." className={`${box} min-w-[200px] flex-1`} />
                        {view !== "team" && <select value={status} onChange={e => setStatus(e.target.value)} className={box} aria-label="Status"><option value="open">Open</option><option value="AWAITING_APPROVAL">Waiting for approval</option><option value="done">Done</option><option value="all">All</option></select>}
                    </div>
                    {!d ? <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--text3)]" /></div>
                        : view === "team" ? <Board tasks={d.tasks} onOpen={setOpen} />
                            : <ListView tasks={d.tasks} view={view} onOpen={setOpen} />}
                </>
            )}
            {open && <Drawer id={open} onClose={() => setOpen(null)} onChanged={load} />}
            {creating && <NewTask onClose={() => setCreating(false)} onSaved={() => { setCreating(false); setView("byme"); load() }} />}
            {settings && <SettingsModal onClose={() => setSettings(false)} />}
        </div>
    )
}

function TaskCard({ t, who, onOpen }: { t: Task; who: string; onOpen: () => void }) {
    return (
        <button onClick={onOpen} className={`block w-full text-left bg-white rounded-[10px] border p-3 hover:border-[var(--accent)] ${overdue(t) ? "border-red-300" : "border-[var(--border)]"}`}>
            <div className="flex items-start justify-between gap-2"><b className="text-[13px]">{t.title}</b><span className={`px-1.5 py-0.5 rounded text-[10.5px] font-semibold shrink-0 ${PCOLOR[t.priority]}`}>{PRIORITIES[t.priority]}</span></div>
            <p className="text-[11.5px] text-[var(--text3)] mt-0.5">{t.taskNo} · {who}</p>
            <div className="flex items-center gap-3 mt-1 text-[11.5px]">
                <span className={overdue(t) ? "text-red-600 font-semibold" : "text-[var(--text2)]"}>{overdue(t) && <AlertTriangle size={11} className="inline mr-0.5" />}{when(t.dueAt)}</span>
                {t.comments > 0 && <span className="text-[var(--text3)] inline-flex items-center gap-0.5"><MessageSquare size={11} />{t.comments}</span>}
                {t.attachments?.length ? <span className="text-[var(--text3)] inline-flex items-center gap-0.5"><Paperclip size={11} />{t.attachments.length}</span> : null}
                {t.needsApproval && <span className="text-[var(--text3)]">needs approval</span>}
            </div>
            {t.returnedNote && t.status === "IN_PROGRESS" && <p className="text-[11.5px] text-amber-800 mt-1">Sent back: {t.returnedNote}</p>}
        </button>
    )
}

function ListView({ tasks, view, onOpen }: { tasks: Task[]; view: string; onOpen: (id: string) => void }) {
    const order: TaskStatus[] = ["AWAITING_APPROVAL", "IN_PROGRESS", "TODO", "DONE", "CANCELLED"]
    const groups = order.map(s => [s, tasks.filter(t => t.status === s)] as const).filter(([, l]) => l.length)
    if (!tasks.length) return <p className="text-[13px] text-[var(--text3)] bg-white border border-[var(--border)] rounded-[12px] p-6 text-center">{view === "mine" ? "Nothing on your list. 🎉" : "No tasks here."}</p>
    return <div className="space-y-4">{groups.map(([s, l]) => (
        <div key={s}><p className="text-[12px] font-bold text-[var(--text2)] mb-1.5">{TASK_STATUS[s]} ({l.length})</p>
            <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(270px,1fr))]">{l.map(t => <TaskCard key={t.id} t={t} who={view === "mine" ? `from ${t.createdByName}` : `for ${t.assigneeName}`} onOpen={() => onOpen(t.id)} />)}</div>
        </div>
    ))}</div>
}

function Board({ tasks, onOpen }: { tasks: Task[]; onOpen: (id: string) => void }) {
    const [who, setWho] = useState("")
    const people = Array.from(new Set(tasks.map(t => t.assigneeName))).sort()
    const list = tasks.filter(t => !who || t.assigneeName === who)
    const cols: TaskStatus[] = ["TODO", "IN_PROGRESS", "AWAITING_APPROVAL", "DONE"]
    return (
        <div className="space-y-2">
            <div className="flex gap-2 items-center flex-wrap">
                <select value={who} onChange={e => setWho(e.target.value)} className={box} aria-label="Person"><option value="">Everyone</option>{people.map(p => <option key={p}>{p}</option>)}</select>
                <span className="text-[12px] text-[var(--text3)]">{list.filter(overdue).length} overdue · cancelled tasks hidden</span>
            </div>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
                {cols.map(s => { const l = list.filter(t => t.status === s); return (
                    <div key={s} className={`bg-[var(--surface2)] rounded-[12px] border border-[var(--border)] border-t-4 ${SCOLOR[s]} p-2 min-h-[120px]`}>
                        <p className="px-1 pb-2 text-[12px] font-bold text-[var(--text2)] flex justify-between"><span>{TASK_STATUS[s]}</span><span>{l.length}</span></p>
                        <div className="space-y-2 max-h-[65vh] overflow-y-auto">{l.map(t => <TaskCard key={t.id} t={t} who={t.assigneeName} onOpen={() => onOpen(t.id)} />)}</div>
                    </div>
                ) })}
            </div>
        </div>
    )
}

function Shell({ title, onClose, children, side }: { title: string; onClose: () => void; children: React.ReactNode; side?: boolean }) {
    useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k) }, [onClose])
    return createPortal(
        <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} className={`fixed inset-0 z-[1000] bg-black/40 flex ${side ? "justify-end" : "items-center justify-center p-4"}`}>
            <div role="dialog" aria-modal="true" aria-label={title} className={`bg-white border border-[var(--border)] shadow-xl overflow-y-auto ${side ? "w-full max-w-lg h-full" : "w-full max-w-lg max-h-[92vh] rounded-[14px]"}`}>
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[var(--border)] sticky top-0 bg-white"><h3 className="text-[15px] font-semibold">{title}</h3><button onClick={onClose} aria-label="Close" className="p-1 text-[var(--text3)]"><X size={18} /></button></div>
                <div className="p-5 space-y-3">{children}</div>
            </div>
        </div>, document.body)
}

function Drawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
    const [d, setD] = useState<any>(null)
    const [busy, setBusy] = useState(false)
    const [comment, setComment] = useState("")
    const [files, setFiles] = useState<File[]>([])
    const load = useCallback(() => { fetch(`/api/tasks/${id}`).then(r => r.json()).then(setD).catch(() => toast.error("Couldn't load")) }, [id])
    useEffect(() => { load() }, [load])
    async function act(action: string, extra: any = {}, ok = "Saved") {
        setBusy(true)
        try { await api(`/api/tasks/${id}`, { action, ...extra }); toast.success(ok); load(); onChanged() } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    async function send() {
        setBusy(true)
        try { const attachments = files.length ? await uploadFiles(files) : []; await api(`/api/tasks/${id}`, { comment, attachments }); setComment(""); setFiles([]); load(); onChanged() } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    async function reassign() {
        const q = prompt("Reassign to — type a name or employee code:"); if (!q) return
        const j = await fetch(`/api/tasks/meta?q=${encodeURIComponent(q)}`).then(r => r.json()).catch(() => ({ people: [] }))
        if (!j.people?.length) return toast.error("Nobody found")
        const p = j.people.length === 1 ? j.people[0] : j.people.find((x: any) => confirm(`Give it to ${x.name}${x.code ? ` (${x.code})` : ""}?`))
        if (p) act("reassign", { assigneeId: p.id }, `Given to ${p.name}`)
    }
    if (!d) return <Shell title="Task" onClose={onClose} side><Loader2 className="h-5 w-5 animate-spin text-[var(--text3)]" /></Shell>
    const t = d.task, can = d.can
    return (
        <Shell title={`${t.taskNo} · ${TASK_STATUS[t.status as TaskStatus]}`} onClose={onClose} side>
            <h2 className="text-[17px] font-bold">{t.title}</h2>
            <div className="flex flex-wrap gap-2 text-[12px]">
                <span className={`px-2 py-0.5 rounded-full font-semibold ${PCOLOR[t.priority as Priority]}`}>{PRIORITIES[t.priority as Priority]}</span>
                <span className={overdue(t) ? "text-red-600 font-semibold" : "text-[var(--text2)]"}>Due {when(t.dueAt)}</span>
                <span className="text-[var(--text3)]">For <b>{t.assigneeName}</b> · from <b>{t.createdByName}</b></span>
                {t.needsApproval && <span className="text-[var(--text3)]">· needs approval</span>}
            </div>
            {t.description && <p className="text-[13px] whitespace-pre-wrap text-[var(--text2)]">{t.description}</p>}
            {t.attachments?.length > 0 && <div className="flex flex-wrap gap-2">{t.attachments.map((a: any, i: number) => <a key={i} href={a.url} target="_blank" rel="noreferrer" className={btn2}><Paperclip size={12} />{a.name}</a>)}</div>}
            {d.group?.length > 0 && <p className="text-[11.5px] text-[var(--text3)]">Same task for others: {d.group.map((g: any) => `${g.n} ${TASK_STATUS[g.status as TaskStatus].toLowerCase()}`).join(", ")}</p>}
            {t.completionNote && <div className="rounded-[10px] bg-green-50 text-green-800 px-3 py-2 text-[12.5px]">Done note: {t.completionNote}</div>}
            {t.returnedNote && t.status === "IN_PROGRESS" && <div className="rounded-[10px] bg-amber-50 text-amber-800 px-3 py-2 text-[12.5px]">Sent back: {t.returnedNote}</div>}
            {t.approvedByName && <p className="text-[12px] text-green-700"><CheckCircle2 size={12} className="inline" /> Approved by {t.approvedByName} · {when(t.approvedAt)}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
                {can.work && t.status === "TODO" && <button disabled={busy} onClick={() => act("start", {}, "Started")} className={btn2}>Start</button>}
                {(can.work || can.manage) && (t.status === "TODO" || t.status === "IN_PROGRESS") && <button disabled={busy} onClick={() => { const note = prompt(t.needsApproval ? "What was done? (sent for approval)" : "What was done? (optional)"); if (note !== null) act("complete", { note }, t.needsApproval ? "Sent for approval" : "Marked done") }} className={btn}>Mark done</button>}
                {can.approve && t.status === "AWAITING_APPROVAL" && <button disabled={busy} onClick={() => act("approve", {}, "Approved")} className={btn}>Approve</button>}
                {can.approve && (t.status === "AWAITING_APPROVAL" || t.status === "DONE") && <button disabled={busy} onClick={() => { const note = prompt("What still needs doing?"); if (note) act("return", { note }, "Sent back") }} className={btn2}>Send back</button>}
                {can.manage && (t.status === "DONE" || t.status === "CANCELLED") && <button disabled={busy} onClick={() => act("reopen", {}, "Reopened")} className={btn2}>Reopen</button>}
                {can.manage && t.status !== "DONE" && t.status !== "CANCELLED" && <button disabled={busy} onClick={reassign} className={btn2}>Reassign</button>}
                {can.manage && t.status !== "DONE" && t.status !== "CANCELLED" && <button disabled={busy} onClick={() => { const v = prompt("New due date and time (YYYY-MM-DD HH:MM), empty for none:", t.dueAt ? new Date(t.dueAt).toISOString().slice(0, 16).replace("T", " ") : ""); if (v !== null) act("edit", { dueAt: v ? new Date(v.replace(" ", "T")).toISOString() : null }, "Due date changed") }} className={btn2}>Change due</button>}
                {can.manage && t.status !== "CANCELLED" && t.status !== "DONE" && <button disabled={busy} onClick={() => confirm("Cancel this task?") && act("cancel", {}, "Cancelled")} className="h-8 px-3 rounded-[8px] text-[12px] font-semibold text-red-600">Cancel task</button>}
            </div>
            <div className="border-t border-[var(--border)] pt-3 space-y-2">
                <p className="text-[12px] font-bold text-[var(--text2)]">Comments</p>
                {t.comments.map((c: any) => (
                    <div key={c.id} className="text-[12.5px]"><b>{c.userName}</b> <span className="text-[11px] text-[var(--text3)]">{when(c.createdAt)}</span><p className="whitespace-pre-wrap">{c.body}</p>{c.attachments?.map((a: any, i: number) => <a key={i} href={a.url} target="_blank" rel="noreferrer" className="text-[var(--accent)] text-[12px] mr-2">📎 {a.name}</a>)}</div>
                ))}
                <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} placeholder="Write a comment…" className="w-full rounded-[9px] border border-[var(--border)] px-2.5 py-1.5 text-[13px]" />
                <div className="flex items-center justify-between gap-2"><input type="file" multiple onChange={e => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} className="text-[12px]" /><button disabled={busy || (!comment.trim() && !files.length)} onClick={send} className={btn2}>Send</button></div>
            </div>
        </Shell>
    )
}

function NewTask({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
    const [meta, setMeta] = useState<{ sites: { id: string; name: string }[]; departments: { id: string; name: string }[]; settings: TaskSettings } | null>(null)
    const [f, setF] = useState({ title: "", description: "", priority: "MEDIUM", due: "", needsApproval: false })
    const [people, setPeople] = useState<Map<string, string>>(new Map())
    const [siteIds, setSiteIds] = useState<string[]>([]), [deptIds, setDeptIds] = useState<string[]>([])
    const [q, setQ] = useState(""), [found, setFound] = useState<any[]>([])
    const [files, setFiles] = useState<File[]>([])
    const [busy, setBusy] = useState(false)
    useEffect(() => { fetch("/api/tasks/meta").then(r => r.json()).then(j => { setMeta(j); setF(x => ({ ...x, needsApproval: !!j.settings?.defaultNeedsApproval })) }).catch(() => {}) }, [])
    useEffect(() => { if (q.trim().length < 2) { setFound([]); return } const t = setTimeout(() => fetch(`/api/tasks/meta?q=${encodeURIComponent(q)}`).then(r => r.json()).then(j => setFound(j.people ?? [])).catch(() => {}), 250); return () => clearTimeout(t) }, [q])
    const count = useMemo(() => people.size + siteIds.length + deptIds.length, [people, siteIds, deptIds])
    async function save() {
        setBusy(true)
        try {
            const attachments = files.length ? await uploadFiles(files) : []
            const j = await api("/api/tasks", { title: f.title, description: f.description, priority: f.priority, dueAt: f.due ? new Date(f.due).toISOString() : null, needsApproval: f.needsApproval, attachments, userIds: Array.from(people.keys()), siteIds, departmentIds: deptIds })
            toast.success(`Task assigned to ${j.created} person(s)`); onSaved()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    return (
        <Shell title="New task" onClose={onClose}>
            <label className={lbl}>What needs doing<input value={f.title} onChange={e => setF(x => ({ ...x, title: e.target.value }))} className={`${box} w-full`} placeholder="e.g. Submit site attendance for October" /></label>
            <label className={lbl}>Details (optional)<textarea value={f.description} onChange={e => setF(x => ({ ...x, description: e.target.value }))} rows={3} className="w-full rounded-[9px] border border-[var(--border)] px-2.5 py-1.5 text-[13px]" /></label>
            <div>
                <label className={lbl}>Who should do it — people<input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or employee code" className={`${box} w-full`} /></label>
                {found.length > 0 && <div className="border border-[var(--border)] rounded-[9px] mt-1 max-h-[150px] overflow-y-auto">{found.map(p => <button key={p.id} onClick={() => { setPeople(m => new Map(m).set(p.id, p.name)); setQ(""); setFound([]) }} className="block w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-[var(--surface2)]"><b>{p.name}</b> <span className="text-[var(--text3)]">{[p.code, p.designation, p.site].filter(Boolean).join(" · ")}</span></button>)}</div>}
                <div className="flex flex-wrap gap-1 mt-1.5">{Array.from(people.entries()).map(([id, n]) => <span key={id} className="px-2 py-0.5 rounded-full bg-[var(--accent)]/10 text-[12px]">{n} <button onClick={() => setPeople(m => { const x = new Map(m); x.delete(id); return x })} aria-label={`Remove ${n}`}>×</button></span>)}</div>
            </div>
            {meta && <div className="grid grid-cols-2 gap-3">
                <label className={lbl}>…or everyone at sites<select multiple value={siteIds} onChange={e => setSiteIds(Array.from(e.target.selectedOptions).map(o => o.value))} className="w-full h-24 rounded-[9px] border border-[var(--border)] text-[12.5px]">{meta.sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                <label className={lbl}>…or departments<select multiple value={deptIds} onChange={e => setDeptIds(Array.from(e.target.selectedOptions).map(o => o.value))} className="w-full h-24 rounded-[9px] border border-[var(--border)] text-[12.5px]">{meta.departments.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            </div>}
            <div className="grid grid-cols-2 gap-3">
                <label className={lbl}>Priority<select value={f.priority} onChange={e => setF(x => ({ ...x, priority: e.target.value }))} className={`${box} w-full`}>{Object.entries(PRIORITIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                <label className={lbl}>Due<input type="datetime-local" value={f.due} onChange={e => setF(x => ({ ...x, due: e.target.value }))} className={`${box} w-full`} /></label>
            </div>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={f.needsApproval} onChange={e => setF(x => ({ ...x, needsApproval: e.target.checked }))} /> I confirm it&apos;s done (they mark done → you approve or send back)</label>
            <label className={lbl}>Attachments (optional, max 5 MB each)<input type="file" multiple onChange={e => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} className="block text-[12.5px] mt-1" /></label>
            <p className="text-[11.5px] text-[var(--text3)]">Each person gets their own copy of the task and an in-app note. Sites / departments include everyone posted there who can sign in.</p>
            <div className="flex justify-end gap-2"><button onClick={onClose} className={btn2}>Cancel</button><button onClick={save} disabled={busy || !f.title.trim() || !count} className={btn}>{busy && <Loader2 size={14} className="animate-spin" />}Assign</button></div>
        </Shell>
    )
}

function Report() {
    const [from, setFrom] = useState(new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10))
    const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
    const [rows, setRows] = useState<any[] | null>(null)
    useEffect(() => { setRows(null); fetch(`/api/tasks/report?from=${from}&to=${to}`).then(r => r.json()).then(j => setRows(j.rows ?? [])).catch(() => setRows([])) }, [from, to])
    const th = "text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)] border-b border-[var(--border)] bg-[var(--surface2)]"
    const td = "px-3 py-2 border-b border-[var(--border)] text-[12.5px]"
    return (
        <div className="space-y-3">
            <div className="flex gap-2 items-center text-[13px]">Tasks due from<input type="date" value={from} onChange={e => setFrom(e.target.value)} className={box} />to<input type="date" value={to} onChange={e => setTo(e.target.value)} className={box} /></div>
            {!rows ? <Loader2 className="h-5 w-5 animate-spin text-[var(--text3)]" /> : !rows.length ? <p className="text-[13px] text-[var(--text3)]">No tasks in this period.</p> : (
                <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-x-auto">
                    <table className="w-full min-w-[640px]">
                        <thead><tr><th className={th}>Person</th><th className={th}>Tasks</th><th className={th}>Done</th><th className={th}>On time</th><th className={th}>Late</th><th className={th}>Open</th><th className={th}>Overdue now</th></tr></thead>
                        <tbody>{rows.map(r => <tr key={r.userId}><td className={`${td} font-semibold`}>{r.name}</td><td className={td}>{r.total}</td><td className={td}>{r.done}</td><td className={td}>{r.onTime}{r.onTimePct !== null && <span className={`ml-1 text-[11px] ${r.onTimePct >= 80 ? "text-green-700" : r.onTimePct >= 50 ? "text-amber-700" : "text-red-600"}`}>({r.onTimePct}%)</span>}</td><td className={td}>{r.late}</td><td className={td}>{r.open}</td><td className={`${td} ${r.openOverdue ? "text-red-600 font-semibold" : ""}`}>{r.openOverdue}</td></tr>)}</tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

function SettingsModal({ onClose }: { onClose: () => void }) {
    const [s, setS] = useState<TaskSettings | null>(null)
    const [busy, setBusy] = useState(false)
    useEffect(() => { fetch("/api/tasks/meta").then(r => r.json()).then(j => setS(j.settings)).catch(() => {}) }, [])
    async function save() {
        setBusy(true)
        try { await api("/api/tasks/meta", s, "PUT"); toast.success("Saved"); onClose() } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    return (
        <Shell title="Task settings" onClose={onClose}>
            {!s ? <Loader2 className="h-5 w-5 animate-spin text-[var(--text3)]" /> : <div className="space-y-3 text-[13px]">
                <label className="flex items-center gap-2"><input type="checkbox" checked={s.anyoneCanAssign} onChange={e => setS({ ...s, anyoneCanAssign: e.target.checked })} /> Anyone who can sign in may assign tasks (off: only roles with Tasks → Create)</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={s.defaultNeedsApproval} onChange={e => setS({ ...s, defaultNeedsApproval: e.target.checked })} /> New tasks need the assigner&apos;s approval by default</label>
                <label className="flex items-center gap-2">Remind<input type="number" min={0} max={720} value={s.remindHoursBefore} onChange={e => setS({ ...s, remindHoursBefore: Number(e.target.value) })} className={`${box} w-20`} />hours before the due time (0 = off)</label>
                <label className="flex items-center gap-2">Overdue reminder every<input type="number" min={0} max={720} value={s.overdueRemindEveryHours} onChange={e => setS({ ...s, overdueRemindEveryHours: Number(e.target.value) })} className={`${box} w-20`} />hours (0 = off)</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={s.notifyAssignerOnOverdue} onChange={e => setS({ ...s, notifyAssignerOnOverdue: e.target.checked })} /> Also tell the person who assigned it when a task is overdue</label>
                <div className="flex justify-end gap-2"><button onClick={onClose} className={btn2}>Cancel</button><button onClick={save} disabled={busy} className={btn}>Save</button></div>
            </div>}
        </Shell>
    )
}
