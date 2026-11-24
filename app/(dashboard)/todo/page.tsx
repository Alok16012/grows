"use client"

// To-do & Notes — the person's own list (private).
//   To-do: quick add, smart views (Today, Upcoming, Overdue, Important, All,
//          Completed), lists, priority, star, due date, alarm with snooze,
//          repeat (rolls forward when ticked), subtasks, notes per item.
//   Notes: colour cards, pin, checklist, reminder, archive, search.
// Alarms ring anywhere in the app while it is open (components/todo/AlarmRinger).
import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import {
    AlarmClock, Archive, ArchiveRestore, Bell, CalendarDays, Check, CheckSquare, ChevronRight, Inbox, ListTodo, Loader2,
    Pin, PinOff, Plus, Repeat as RepeatIcon, Search, Star, StickyNote, Sun, Trash2, X, AlertTriangle, CalendarClock,
} from "lucide-react"
import { useTodo } from "@/lib/useTodo"
import {
    newId, NOTE_BG, PRIORITY_COLOR, REPEAT_LABEL, type Note, type NoteColor, type Priority, type Repeat, type Subtask, type Todo,
} from "@/lib/todo"
import { enableAlarmNotifications } from "@/components/todo/AlarmRinger"

const card = "bg-white rounded-[22px] shadow-[var(--shadow-card)]"
const box = "h-10 rounded-[12px] border border-[var(--border2)] bg-white px-3 text-[13.5px] outline-none focus:border-[var(--accent)] w-full"
const btn = "h-10 px-4 rounded-[12px] bg-[var(--accent)] text-white text-[13.5px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
const btn2 = "h-10 px-4 rounded-[12px] border border-[var(--border2)] bg-white text-[13.5px] font-medium text-[var(--text2)] inline-flex items-center gap-1.5"

// Local date-time helpers (inputs use the device's time zone).
const pad = (n: number) => String(n).padStart(2, "0")
const toLocal = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` }
const fromLocal = (v: string) => v ? new Date(v).toISOString() : null
const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const fmtWhen = (iso: string) => {
    const d = new Date(iso), today = startOfDay(), day = startOfDay(d)
    const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000)
    const t = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
    const ds = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : diff === -1 ? "Yesterday" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) })
    return `${ds}, ${t}`
}

type View = "today" | "upcoming" | "overdue" | "important" | "all" | "done" | `list:${string}`

export default function TodoPage() {
    const { store, op } = useTodo()
    const [tab, setTab] = useState<"todo" | "notes">("todo")
    if (!store) return <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--text3)]" /></div>
    return (
        <div className="p-4 lg:p-0 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-[24px] font-bold text-[var(--text)] tracking-[-0.4px]">To-do &amp; Notes</h1>
                    <p className="text-[13px] text-[var(--text3)]">Your own list — only you can see it. Alarms ring while Growus is open.</p>
                </div>
                <button onClick={() => enableAlarmNotifications()} className={btn2}><Bell size={15} /> Allow alarm pop-ups</button>
            </div>
            <div className="inline-flex p-1 rounded-full bg-white shadow-[var(--shadow-card)]">
                {([["todo", "To-do", ListTodo, store.todos.filter(t => !t.done).length], ["notes", "Notes", StickyNote, store.notes.filter(n => !n.archived).length]] as const).map(([k, l, I, n]) => (
                    <button key={k} onClick={() => setTab(k)} className={`h-9 px-4 rounded-full text-[13.5px] font-semibold inline-flex items-center gap-1.5 ${tab === k ? "bg-[var(--accent)] text-white" : "text-[var(--text2)]"}`}>
                        <I size={15} /> {l} <span className={`text-[11px] ${tab === k ? "text-white/80" : "text-[var(--text3)]"}`}>{n}</span>
                    </button>
                ))}
            </div>
            {tab === "todo" ? <TodoTab store={store} op={op} /> : <NotesTab notes={store.notes} op={op} />}
        </div>
    )
}

// ── To-do ────────────────────────────────────────────────────────────────────
function TodoTab({ store, op }: { store: NonNullable<ReturnType<typeof useTodo>["store"]>; op: ReturnType<typeof useTodo>["op"] }) {
    const [view, setView] = useState<View>("today")
    const [q, setQ] = useState("")
    const [edit, setEdit] = useState<Todo | null>(null)
    const now = Date.now(), endToday = startOfDay().getTime() + 86_400_000
    const open = store.todos.filter(t => !t.done)
    const when = (t: Todo) => t.dueAt ?? t.remindAt
    const isOverdue = (t: Todo) => !t.done && !!when(t) && Date.parse(when(t)!) < now
    const isToday = (t: Todo) => !t.done && !!when(t) && Date.parse(when(t)!) < endToday
    const VIEWS: { k: View; label: string; icon: any; items: Todo[] }[] = [
        { k: "today", label: "Today", icon: Sun, items: open.filter(isToday) },
        { k: "upcoming", label: "Upcoming", icon: CalendarDays, items: open.filter(t => when(t) && Date.parse(when(t)!) >= endToday) },
        { k: "overdue", label: "Overdue", icon: AlertTriangle, items: open.filter(isOverdue) },
        { k: "important", label: "Important", icon: Star, items: open.filter(t => t.starred || t.priority === "high") },
        { k: "all", label: "All open", icon: Inbox, items: open },
        { k: "done", label: "Completed", icon: CheckSquare, items: store.todos.filter(t => t.done) },
    ]
    const listItems = (l: string) => open.filter(t => t.list === l)
    const current = view.startsWith("list:") ? { label: view.slice(5), items: listItems(view.slice(5)) } : VIEWS.find(v => v.k === view)!
    const items = useMemo(() => {
        const t = q.trim().toLowerCase()
        const rows = current.items.filter(x => !t || x.title.toLowerCase().includes(t) || x.note.toLowerCase().includes(t))
        const rank = { high: 0, medium: 1, low: 2 }
        return [...rows].sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1) || ((when(a) ? Date.parse(when(a)!) : Infinity) - (when(b) ? Date.parse(when(b)!) : Infinity)) || rank[a.priority] - rank[b.priority])
    }, [current, q])

    const defaultList = view.startsWith("list:") ? view.slice(5) : "Personal"
    const blank = (): Todo => {
        const due = view === "today" ? (() => { const d = new Date(); d.setHours(18, 0, 0, 0); return d.toISOString() })() : null
        return { id: newId(), title: "", note: "", list: defaultList, priority: view === "important" ? "high" : "medium", starred: view === "important", done: false, doneAt: null, dueAt: due, remindAt: null, snoozeUntil: null, firedAt: null, repeat: "none", subtasks: [], createdAt: "", updatedAt: "" }
    }
    async function addList() {
        const name = prompt("New list name (e.g. Shopping, Site visits)")?.trim()
        if (name && await op({ op: "addList", name })) setView(`list:${name}`)
    }

    return (
        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] items-start">
            {/* Views and lists */}
            <aside className={`${card} p-3`}>
                {VIEWS.map(v => (
                    <button key={v.k} onClick={() => setView(v.k)} className={`w-full flex items-center gap-2.5 px-3 h-10 rounded-[12px] text-[13.5px] ${view === v.k ? "bg-[var(--accent-light)] text-[var(--accent)] font-semibold" : "text-[var(--text2)] hover:bg-[var(--surface2)]"}`}>
                        <v.icon size={16} className={v.k === "overdue" && v.items.length ? "text-[var(--red)]" : ""} /> <span className="flex-1 text-left">{v.label}</span>
                        <span className={`text-[12px] ${v.k === "overdue" && v.items.length ? "text-[var(--red)] font-semibold" : "text-[var(--text3)]"}`}>{v.items.length || ""}</span>
                    </button>
                ))}
                <p className="px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)]">Lists</p>
                {store.lists.map(l => (
                    <div key={l} className="group flex items-center">
                        <button onClick={() => setView(`list:${l}`)} className={`flex-1 flex items-center gap-2.5 px-3 h-9 rounded-[12px] text-[13.5px] ${view === `list:${l}` ? "bg-[var(--accent-light)] text-[var(--accent)] font-semibold" : "text-[var(--text2)] hover:bg-[var(--surface2)]"}`}>
                            <ChevronRight size={14} /> <span className="flex-1 text-left truncate">{l}</span><span className="text-[12px] text-[var(--text3)]">{listItems(l).length || ""}</span>
                        </button>
                        {l !== "Personal" && l !== "Work" && <button onClick={() => confirm(`Delete the list "${l}"? Its to-dos move to Personal.`) && op({ op: "deleteList", name: l }).then(() => view === `list:${l}` && setView("all"))} aria-label={`Delete list ${l}`} className="opacity-0 group-hover:opacity-100 p-1.5 text-[var(--text3)] hover:text-[var(--red)]"><Trash2 size={13} /></button>}
                    </div>
                ))}
                <button onClick={addList} className="mt-1 w-full flex items-center gap-2 px-3 h-9 rounded-[12px] text-[13px] text-[var(--accent)] hover:bg-[var(--surface2)]"><Plus size={15} /> New list</button>
            </aside>

            <section className="space-y-3 min-w-0">
                <QuickAdd lists={store.lists} defaults={blank()} onAdd={t => op({ op: "upsertTodo", todo: t })} onMore={t => setEdit(t)} />
                <div className={`${card} p-4`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <p className="text-[16px] font-semibold text-[var(--text)]">{current.label} <span className="text-[13px] font-normal text-[var(--text3)]">{items.length}</span></p>
                        <div className="flex items-center gap-2">
                            <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search" className="h-9 w-44 rounded-full border border-[var(--border2)] pl-8 pr-3 text-[13px] outline-none focus:border-[var(--accent)]" /></div>
                            {view === "done" && items.length > 0 && <button onClick={() => confirm("Delete all completed to-dos?") && op({ op: "clearDone" })} className="h-9 px-3 rounded-full text-[12.5px] text-[var(--red)] border border-[#fecaca]">Clear completed</button>}
                        </div>
                    </div>
                    {!items.length ? (
                        <div className="py-12 text-center text-[var(--text3)]">
                            <CheckSquare size={34} className="mx-auto mb-2 opacity-40" />
                            <p className="text-[13.5px]">{view === "done" ? "Nothing completed yet." : view === "overdue" ? "Nothing overdue — well done." : "Nothing here. Add a to-do above."}</p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-[var(--border)]">
                            {items.map(t => <TodoRow key={t.id} t={t} overdue={isOverdue(t)} op={op} onOpen={() => setEdit(t)} />)}
                        </ul>
                    )}
                </div>
            </section>
            {edit && <TodoEditor todo={edit} lists={store.lists} onClose={() => setEdit(null)} onSave={async t => { if (await op({ op: "upsertTodo", todo: t })) { setEdit(null); toast.success("Saved") } }} onDelete={async id => { if (await op({ op: "deleteTodo", id })) setEdit(null) }} />}
        </div>
    )
}

function QuickAdd({ lists, defaults, onAdd, onMore }: { lists: string[]; defaults: Todo; onAdd: (t: Todo) => Promise<boolean>; onMore: (t: Todo) => void }) {
    const [title, setTitle] = useState("")
    const [due, setDue] = useState("")
    const [alarm, setAlarm] = useState(false)
    const [busy, setBusy] = useState(false)
    async function add() {
        if (!title.trim()) return
        setBusy(true)
        const dueAt = due ? fromLocal(due) : defaults.dueAt
        const ok = await onAdd({ ...defaults, id: newId(), title: title.trim(), dueAt, remindAt: alarm && dueAt ? dueAt : null })
        setBusy(false)
        if (ok) { setTitle(""); setDue(""); setAlarm(false) }
    }
    return (
        <div className={`${card} p-3 flex flex-wrap items-center gap-2`}>
            <Plus size={18} className="text-[var(--accent)] ml-1" />
            <input value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder={`Add a to-do in ${defaults.list}… (press Enter)`} className="flex-1 min-w-[200px] h-10 text-[14px] outline-none bg-transparent" aria-label="New to-do" />
            <input type="datetime-local" value={due} onChange={e => setDue(e.target.value)} className="h-9 rounded-[10px] border border-[var(--border2)] px-2 text-[12.5px]" aria-label="Due date and time" />
            <button type="button" onClick={() => setAlarm(a => !a)} title="Ring an alarm at the due time" className={`h-9 px-3 rounded-[10px] text-[12.5px] inline-flex items-center gap-1 border ${alarm ? "bg-[var(--accent-light)] text-[var(--accent)] border-transparent" : "border-[var(--border2)] text-[var(--text2)]"}`}><AlarmClock size={14} /> Alarm</button>
            <button type="button" onClick={() => onMore({ ...defaults, id: newId(), title: title.trim(), dueAt: due ? fromLocal(due) : defaults.dueAt })} className="h-9 px-3 rounded-[10px] text-[12.5px] text-[var(--text2)] border border-[var(--border2)]">More…</button>
            <button onClick={add} disabled={busy || !title.trim()} className={btn}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Add</button>
            <span className="sr-only">{lists.length} lists</span>
        </div>
    )
}

function TodoRow({ t, overdue, op, onOpen }: { t: Todo; overdue: boolean; op: ReturnType<typeof useTodo>["op"]; onOpen: () => void }) {
    const doneSubs = t.subtasks.filter(s => s.done).length
    const when = t.dueAt ?? t.remindAt
    return (
        <li className="py-2.5 flex items-start gap-3">
            <button onClick={() => op({ op: "toggleTodo", id: t.id, done: !t.done }).then(ok => ok && !t.done && t.repeat !== "none" && toast.success(`Done — next one ${REPEAT_LABEL[t.repeat].toLowerCase()}`))}
                aria-label={t.done ? `Mark ${t.title} not done` : `Mark ${t.title} done`}
                className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center ${t.done ? "bg-[var(--accent)] border-[var(--accent)] text-white" : ""}`} style={!t.done ? { borderColor: PRIORITY_COLOR[t.priority] } : undefined}>
                {t.done && <Check size={12} strokeWidth={3} />}
            </button>
            <button onClick={onOpen} className="flex-1 min-w-0 text-left">
                <p className={`text-[14px] leading-snug ${t.done ? "line-through text-[var(--text3)]" : "text-[var(--text)]"}`}>{t.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-[var(--text3)]">
                    {when && <span className={`inline-flex items-center gap-1 ${overdue ? "text-[var(--red)] font-semibold" : ""}`}><CalendarClock size={12} />{fmtWhen(when)}</span>}
                    {t.remindAt && !t.done && <span className="inline-flex items-center gap-1 text-[var(--accent)]"><AlarmClock size={12} />{t.snoozeUntil ? `snoozed to ${fmtWhen(t.snoozeUntil)}` : fmtWhen(t.remindAt)}</span>}
                    {t.repeat !== "none" && <span className="inline-flex items-center gap-1"><RepeatIcon size={12} />{REPEAT_LABEL[t.repeat]}</span>}
                    {t.subtasks.length > 0 && <span>{doneSubs}/{t.subtasks.length} steps</span>}
                    <span>{t.list}</span>
                    {t.note && <span className="truncate max-w-[220px]">{t.note}</span>}
                </p>
            </button>
            <button onClick={() => op({ op: "upsertTodo", todo: { ...t, starred: !t.starred } })} aria-label={t.starred ? "Unstar" : "Star"} className="p-1 shrink-0">
                <Star size={17} className={t.starred ? "fill-[#f5b52e] text-[#f5b52e]" : "text-[var(--text3)]"} />
            </button>
        </li>
    )
}

const ALARM_PRESETS: { label: string; minutes: number | null }[] = [
    { label: "No alarm", minutes: null }, { label: "At due time", minutes: 0 }, { label: "5 min before", minutes: 5 }, { label: "15 min before", minutes: 15 },
    { label: "30 min before", minutes: 30 }, { label: "1 hour before", minutes: 60 }, { label: "1 day before", minutes: 1440 },
]

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k) }, [onClose])
    if (typeof document === "undefined") return null
    return createPortal(
        <div className="fixed inset-0 z-[80] bg-black/30 flex items-end sm:items-center justify-center p-0 sm:p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
            <div role="dialog" aria-label={title} className="bg-white w-full sm:max-w-[560px] max-h-[92vh] overflow-y-auto rounded-t-[22px] sm:rounded-[22px] shadow-[var(--shadow-lg)]">
                <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-[var(--border)] z-10">
                    <p className="text-[16px] font-semibold text-[var(--text)]">{title}</p>
                    <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-[var(--surface2)]"><X size={18} /></button>
                </div>
                <div className="p-5 space-y-4">{children}</div>
            </div>
        </div>, document.body)
}

function Checklist({ items, onChange, placeholder }: { items: Subtask[]; onChange: (s: Subtask[]) => void; placeholder: string }) {
    const [txt, setTxt] = useState("")
    const add = () => { if (txt.trim()) { onChange([...items, { id: newId(), text: txt.trim(), done: false }]); setTxt("") } }
    return (
        <div className="space-y-1.5">
            {items.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2">
                    <input type="checkbox" checked={s.done} onChange={() => onChange(items.map((x, k) => k === i ? { ...x, done: !x.done } : x))} className="h-4 w-4 accent-[var(--accent)]" aria-label={`Done: ${s.text}`} />
                    <input value={s.text} onChange={e => onChange(items.map((x, k) => k === i ? { ...x, text: e.target.value } : x))} className={`flex-1 h-8 text-[13.5px] outline-none border-b border-transparent focus:border-[var(--border2)] ${s.done ? "line-through text-[var(--text3)]" : ""}`} />
                    <button onClick={() => onChange(items.filter((_, k) => k !== i))} aria-label="Remove" className="p-1 text-[var(--text3)] hover:text-[var(--red)]"><X size={14} /></button>
                </div>
            ))}
            <div className="flex items-center gap-2">
                <Plus size={15} className="text-[var(--text3)]" />
                <input value={txt} onChange={e => setTxt(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add() } }} onBlur={add} placeholder={placeholder} className="flex-1 h-8 text-[13.5px] outline-none" />
            </div>
        </div>
    )
}

function TodoEditor({ todo, lists, onClose, onSave, onDelete }: { todo: Todo; lists: string[]; onClose: () => void; onSave: (t: Todo) => void; onDelete: (id: string) => void }) {
    const [t, setT] = useState<Todo>(todo)
    const set = (p: Partial<Todo>) => setT(x => ({ ...x, ...p }))
    const preset = (() => {
        if (!t.remindAt) return "none"
        if (!t.dueAt) return "custom"
        const m = Math.round((Date.parse(t.dueAt) - Date.parse(t.remindAt)) / 60_000)
        return ALARM_PRESETS.some(p => p.minutes === m) ? String(m) : "custom"
    })()
    const choosePreset = (v: string) => {
        if (v === "none") return set({ remindAt: null })
        if (v === "custom") return set({ remindAt: t.remindAt ?? t.dueAt ?? new Date(Date.now() + 3_600_000).toISOString() })
        const base = t.dueAt ?? new Date(Date.now() + 3_600_000).toISOString()
        set({ dueAt: t.dueAt ?? base, remindAt: new Date(Date.parse(base) - Number(v) * 60_000).toISOString() })
    }
    const lbl = "block text-[11.5px] font-semibold uppercase tracking-wide text-[var(--text3)] mb-1"
    return (
        <Modal title={todo.createdAt ? "Edit to-do" : "New to-do"} onClose={onClose}>
            <input autoFocus value={t.title} onChange={e => set({ title: e.target.value })} placeholder="What do you need to do?" className="w-full text-[17px] font-semibold outline-none border-b border-[var(--border)] pb-2" />
            <div className="grid grid-cols-2 gap-3">
                <label className="col-span-2 sm:col-span-1"><span className={lbl}>Due</span><input type="datetime-local" value={toLocal(t.dueAt)} onChange={e => set({ dueAt: fromLocal(e.target.value) })} className={box} /></label>
                <label className="col-span-2 sm:col-span-1"><span className={lbl}>Alarm</span>
                    <select value={preset} onChange={e => choosePreset(e.target.value)} className={box}>
                        {ALARM_PRESETS.map(p => <option key={p.label} value={p.minutes === null ? "none" : String(p.minutes)} disabled={p.minutes !== null && !t.dueAt}>{p.label}</option>)}
                        <option value="custom">Pick a date and time…</option>
                    </select>
                </label>
                {preset === "custom" && <label className="col-span-2"><span className={lbl}>Ring at</span><input type="datetime-local" value={toLocal(t.remindAt)} onChange={e => set({ remindAt: fromLocal(e.target.value) })} className={box} /></label>}
                <label><span className={lbl}>Repeat</span><select value={t.repeat} onChange={e => set({ repeat: e.target.value as Repeat })} className={box}>{(Object.keys(REPEAT_LABEL) as Repeat[]).map(r => <option key={r} value={r}>{REPEAT_LABEL[r]}</option>)}</select></label>
                <label><span className={lbl}>List</span><select value={t.list} onChange={e => set({ list: e.target.value })} className={box}>{lists.map(l => <option key={l}>{l}</option>)}</select></label>
                <div className="col-span-2">
                    <span className={lbl}>Priority</span>
                    <div className="flex gap-2">
                        {(["low", "medium", "high"] as Priority[]).map(p => (
                            <button key={p} type="button" onClick={() => set({ priority: p })} className={`h-9 px-4 rounded-full text-[13px] capitalize border inline-flex items-center gap-1.5 ${t.priority === p ? "border-transparent bg-[var(--surface2)] font-semibold text-[var(--text)]" : "border-[var(--border2)] text-[var(--text2)]"}`}>
                                <span className="h-2.5 w-2.5 rounded-full" style={{ background: PRIORITY_COLOR[p] }} />{p}
                            </button>
                        ))}
                        <button type="button" onClick={() => set({ starred: !t.starred })} className={`h-9 px-3 rounded-full text-[13px] border inline-flex items-center gap-1.5 ${t.starred ? "border-transparent bg-[#fff7d6] text-[#b45309] font-semibold" : "border-[var(--border2)] text-[var(--text2)]"}`}><Star size={14} className={t.starred ? "fill-[#f5b52e] text-[#f5b52e]" : ""} /> Important</button>
                    </div>
                </div>
            </div>
            {t.repeat !== "none" && <p className="text-[12px] text-[var(--text3)] -mt-2">When you tick it, it comes back {REPEAT_LABEL[t.repeat].toLowerCase()} with the same alarm.</p>}
            <div><span className={lbl}>Steps</span><Checklist items={t.subtasks} onChange={subtasks => set({ subtasks })} placeholder="Add a step" /></div>
            <label className="block"><span className={lbl}>Notes</span><textarea value={t.note} onChange={e => set({ note: e.target.value })} rows={3} placeholder="Details, phone numbers, links…" className="w-full rounded-[12px] border border-[var(--border2)] p-3 text-[13.5px] outline-none focus:border-[var(--accent)]" /></label>
            <div className="flex items-center justify-between gap-2 pt-1">
                {todo.createdAt ? <button onClick={() => confirm("Delete this to-do?") && onDelete(t.id)} className="text-[13px] text-[var(--red)] inline-flex items-center gap-1.5"><Trash2 size={14} /> Delete</button> : <span />}
                <div className="flex gap-2"><button onClick={onClose} className={btn2}>Cancel</button><button onClick={() => onSave(t)} disabled={!t.title.trim()} className={btn}><Check size={15} /> Save</button></div>
            </div>
        </Modal>
    )
}

// ── Notes ────────────────────────────────────────────────────────────────────
const COLORS = Object.keys(NOTE_BG) as NoteColor[]
function NotesTab({ notes, op }: { notes: Note[]; op: ReturnType<typeof useTodo>["op"] }) {
    const [q, setQ] = useState("")
    const [archived, setArchived] = useState(false)
    const [color, setColor] = useState<NoteColor | "">("")
    const [edit, setEdit] = useState<Note | null>(null)
    const shown = notes.filter(n => n.archived === archived && (!color || n.color === color) && (!q.trim() || `${n.title} ${n.body} ${n.checklist.map(c => c.text).join(" ")}`.toLowerCase().includes(q.trim().toLowerCase())))
    const pinned = shown.filter(n => n.pinned), rest = shown.filter(n => !n.pinned)
    const blank = (): Note => ({ id: newId(), title: "", body: "", color: "white", pinned: false, archived: false, checklist: [], remindAt: null, firedAt: null, createdAt: "", updatedAt: "" })
    const grid = (list: Note[]) => (
        <div className="columns-1 sm:columns-2 xl:columns-3 2xl:columns-4 gap-4 [&>*]:mb-4">
            {list.map(n => (
                <div key={n.id} className="break-inside-avoid rounded-[18px] p-4 shadow-[var(--shadow-card)] cursor-pointer hover:-translate-y-0.5 transition-transform group" style={{ background: NOTE_BG[n.color] }} onClick={() => setEdit(n)}>
                    <div className="flex items-start gap-2">
                        <p className="flex-1 text-[14.5px] font-semibold text-[var(--text)] break-words">{n.title || <span className="text-[var(--text3)] font-normal">Untitled</span>}</p>
                        <button onClick={e => { e.stopPropagation(); op({ op: "upsertNote", note: { ...n, pinned: !n.pinned } }) }} aria-label={n.pinned ? "Unpin" : "Pin"} className={`p-1 ${n.pinned ? "text-[var(--accent)]" : "text-[var(--text3)] opacity-0 group-hover:opacity-100"}`}>{n.pinned ? <Pin size={15} className="fill-current" /> : <Pin size={15} />}</button>
                    </div>
                    {n.body && <p className="mt-1.5 text-[13px] text-[var(--text2)] whitespace-pre-wrap break-words line-clamp-[10]">{n.body}</p>}
                    {n.checklist.length > 0 && (
                        <ul className="mt-2 space-y-1">
                            {n.checklist.slice(0, 8).map(c => <li key={c.id} className={`flex items-center gap-2 text-[13px] ${c.done ? "line-through text-[var(--text3)]" : "text-[var(--text2)]"}`}><span className={`h-3.5 w-3.5 rounded-[4px] border ${c.done ? "bg-[var(--accent)] border-[var(--accent)]" : "border-[var(--text3)]"}`} />{c.text}</li>)}
                            {n.checklist.length > 8 && <li className="text-[12px] text-[var(--text3)]">+{n.checklist.length - 8} more</li>}
                        </ul>
                    )}
                    <p className="mt-3 flex items-center gap-3 text-[11px] text-[var(--text3)]">
                        <span>{new Date(n.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                        {n.remindAt && <span className="inline-flex items-center gap-1 text-[var(--accent)]"><AlarmClock size={11} />{fmtWhen(n.remindAt)}</span>}
                    </p>
                </div>
            ))}
        </div>
    )
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setEdit(blank())} className={btn}><Plus size={15} /> New note</button>
                <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search notes" className="h-10 w-56 rounded-full border border-[var(--border2)] bg-white pl-8 pr-3 text-[13px] outline-none focus:border-[var(--accent)]" /></div>
                <div className="flex items-center gap-1.5 ml-1">
                    <button onClick={() => setColor("")} className={`h-7 px-2.5 rounded-full text-[12px] border ${!color ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border2)] text-[var(--text2)]"}`}>All</button>
                    {COLORS.map(c => <button key={c} onClick={() => setColor(c === color ? "" : c)} aria-label={`${c} notes`} className={`h-7 w-7 rounded-full border-2 ${color === c ? "border-[var(--accent)]" : "border-[var(--border2)]"}`} style={{ background: NOTE_BG[c] }} />)}
                </div>
                <button onClick={() => setArchived(a => !a)} className={`${btn2} ml-auto`}>{archived ? <><StickyNote size={15} /> Back to notes</> : <><Archive size={15} /> Archive</>}</button>
            </div>
            {!shown.length ? (
                <div className={`${card} py-14 text-center text-[var(--text3)]`}><StickyNote size={34} className="mx-auto mb-2 opacity-40" /><p className="text-[13.5px]">{archived ? "No archived notes." : q || color ? "No notes match." : "No notes yet — jot down anything: ideas, numbers, meeting points."}</p></div>
            ) : (
                <>
                    {pinned.length > 0 && <><p className="text-[11.5px] font-semibold uppercase tracking-wide text-[var(--text3)]">Pinned</p>{grid(pinned)}</>}
                    {rest.length > 0 && <>{pinned.length > 0 && <p className="text-[11.5px] font-semibold uppercase tracking-wide text-[var(--text3)]">Others</p>}{grid(rest)}</>}
                </>
            )}
            {edit && <NoteEditor note={edit} onClose={() => setEdit(null)}
                onSave={async n => { if (await op({ op: "upsertNote", note: n })) setEdit(null) }}
                onDelete={async id => { if (await op({ op: "deleteNote", id })) setEdit(null) }} />}
        </div>
    )
}

function NoteEditor({ note, onClose, onSave, onDelete }: { note: Note; onClose: () => void; onSave: (n: Note) => void; onDelete: (id: string) => void }) {
    const [n, setN] = useState<Note>(note)
    const set = (p: Partial<Note>) => setN(x => ({ ...x, ...p }))
    const empty = !n.title.trim() && !n.body.trim() && !n.checklist.length
    return (
        <Modal title={note.createdAt ? "Edit note" : "New note"} onClose={onClose}>
            <div className="rounded-[16px] p-4 space-y-3" style={{ background: NOTE_BG[n.color] }}>
                <input autoFocus value={n.title} onChange={e => set({ title: e.target.value })} placeholder="Title" className="w-full bg-transparent text-[17px] font-semibold outline-none" />
                <textarea value={n.body} onChange={e => set({ body: e.target.value })} rows={7} placeholder="Write a note…" className="w-full bg-transparent text-[14px] outline-none resize-y" />
                <Checklist items={n.checklist} onChange={checklist => set({ checklist })} placeholder="Add a checklist item" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {COLORS.map(c => <button key={c} type="button" onClick={() => set({ color: c })} aria-label={`${c} colour`} className={`h-8 w-8 rounded-full border-2 ${n.color === c ? "border-[var(--accent)]" : "border-[var(--border2)]"}`} style={{ background: NOTE_BG[c] }} />)}
                <button type="button" onClick={() => set({ pinned: !n.pinned })} className={`${btn2} h-9`}>{n.pinned ? <><PinOff size={14} /> Unpin</> : <><Pin size={14} /> Pin</>}</button>
                <button type="button" onClick={() => set({ archived: !n.archived })} className={`${btn2} h-9`}>{n.archived ? <><ArchiveRestore size={14} /> Unarchive</> : <><Archive size={14} /> Archive</>}</button>
            </div>
            <label className="block"><span className="block text-[11.5px] font-semibold uppercase tracking-wide text-[var(--text3)] mb-1">Remind me</span>
                <div className="flex gap-2"><input type="datetime-local" value={toLocal(n.remindAt)} onChange={e => set({ remindAt: fromLocal(e.target.value) })} className={box} />{n.remindAt && <button onClick={() => set({ remindAt: null })} className={btn2}>Clear</button>}</div>
            </label>
            <div className="flex items-center justify-between gap-2">
                {note.createdAt ? <button onClick={() => confirm("Delete this note?") && onDelete(n.id)} className="text-[13px] text-[var(--red)] inline-flex items-center gap-1.5"><Trash2 size={14} /> Delete</button> : <span />}
                <div className="flex gap-2"><button onClick={onClose} className={btn2}>Cancel</button><button onClick={() => onSave(n)} disabled={empty} className={btn}><Check size={15} /> Save</button></div>
            </div>
        </Modal>
    )
}
