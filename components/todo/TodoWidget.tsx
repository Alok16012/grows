"use client"

// Dashboard widget: quick add, today's and overdue to-dos with a tick, the next
// alarm, and the latest pinned note. Full list at /todo.
import { useState } from "react"
import Link from "next/link"
import { AlarmClock, Check, ListTodo, Loader2, Plus, StickyNote } from "lucide-react"
import { useTodo } from "@/lib/useTodo"
import { alarmTime, newId, NOTE_BG, PRIORITY_COLOR, type Todo } from "@/lib/todo"

const t12 = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })

export function TodoWidget({ grow }: { grow?: boolean }) {
    const { store, op } = useTodo()
    const [title, setTitle] = useState("")
    const [busy, setBusy] = useState(false)
    if (!store) return null
    const now = Date.now(), end = new Date().setHours(23, 59, 59, 999)
    const when = (t: Todo) => t.dueAt ?? t.remindAt
    const today = store.todos.filter(t => !t.done && when(t) && Date.parse(when(t)!) <= end)
        .sort((a, b) => Date.parse(when(a)!) - Date.parse(when(b)!)).slice(0, 5)
    const nextAlarm = store.todos.filter(t => !t.done && alarmTime(t) && Date.parse(alarmTime(t)!) > now).sort((a, b) => Date.parse(alarmTime(a)!) - Date.parse(alarmTime(b)!))[0]
    const pinned = store.notes.find(n => n.pinned && !n.archived)
    const openCount = store.todos.filter(t => !t.done).length

    async function add() {
        if (!title.trim()) return
        setBusy(true)
        const due = new Date(); due.setHours(18, 0, 0, 0)
        const ok = await op({ op: "upsertTodo", todo: { id: newId(), title: title.trim(), list: "Personal", priority: "medium", dueAt: due.toISOString(), repeat: "none", subtasks: [] } })
        setBusy(false); if (ok) setTitle("")
    }

    return (
        <div className={`bg-white rounded-[22px] shadow-[var(--shadow-card)] p-5 flex flex-col ${grow ? "flex-1" : ""}`}>
            <div className="flex items-center justify-between mb-3">
                <p className="text-[16px] font-semibold text-[var(--text)] inline-flex items-center gap-2"><ListTodo size={17} className="text-[var(--accent)]" /> My to-do <span className="text-[12px] font-normal text-[var(--text3)]">{openCount} open</span></p>
                <Link href="/todo" className="text-[12.5px] text-[var(--accent)] font-medium">Open</Link>
            </div>
            <div className="flex items-center gap-2 rounded-[12px] border border-[var(--border2)] px-3 h-10">
                <Plus size={16} className="text-[var(--text3)] shrink-0" />
                <input value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="Add a to-do for today…" aria-label="Add a to-do" className="flex-1 min-w-0 text-[13.5px] outline-none bg-transparent" />
                {busy && <Loader2 size={15} className="animate-spin text-[var(--text3)]" />}
            </div>
            {today.length ? (
                <ul className="mt-2 divide-y divide-[var(--border)]">
                    {today.map(t => {
                        const overdue = Date.parse(when(t)!) < now
                        return (
                            <li key={t.id} className="py-2 flex items-center gap-2.5">
                                <button onClick={() => op({ op: "toggleTodo", id: t.id, done: true })} aria-label={`Mark ${t.title} done`} className="h-[18px] w-[18px] shrink-0 rounded-full border-2 flex items-center justify-center hover:bg-[var(--accent-light)]" style={{ borderColor: PRIORITY_COLOR[t.priority] }}>
                                    <Check size={10} strokeWidth={3} className="opacity-0 hover:opacity-100 text-[var(--accent)]" />
                                </button>
                                <Link href="/todo" className="flex-1 min-w-0 truncate text-[13.5px] text-[var(--text)] hover:text-[var(--accent)]">{t.title}</Link>
                                {t.remindAt && <AlarmClock size={13} className="text-[var(--accent)] shrink-0" />}
                                <span className={`text-[11.5px] shrink-0 ${overdue ? "text-[var(--red)] font-semibold" : "text-[var(--text3)]"}`}>{overdue && new Date(when(t)!).toDateString() !== new Date().toDateString() ? "Overdue" : t12(when(t)!)}</span>
                            </li>
                        )
                    })}
                </ul>
            ) : <p className="mt-3 text-[13px] text-[var(--text3)]">Nothing due today.</p>}
            <div className="mt-auto pt-3 space-y-2">
                {nextAlarm && <p className="text-[12px] text-[var(--text2)] inline-flex items-center gap-1.5"><AlarmClock size={13} className="text-[var(--violet)]" /> Next alarm: <b className="font-semibold text-[var(--text)] truncate max-w-[180px]">{nextAlarm.title}</b> · {new Date(alarmTime(nextAlarm)!).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })}</p>}
                {pinned && (
                    <Link href="/todo" className="block rounded-[12px] px-3 py-2 text-[12.5px] text-[var(--text2)]" style={{ background: NOTE_BG[pinned.color] === "#ffffff" ? "var(--surface2)" : NOTE_BG[pinned.color] }}>
                        <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--text)]"><StickyNote size={13} /> {pinned.title || "Pinned note"}</span>
                        {pinned.body && <span className="block truncate">{pinned.body}</span>}
                    </Link>
                )}
            </div>
        </div>
    )
}
