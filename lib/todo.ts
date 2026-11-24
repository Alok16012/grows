// Personal To-do & Notes — client-safe types and helpers.
// Each person's to-dos and notes are private to them (one record per user,
// AppSetting "todo:<userId>"; no database change needed).

export type Repeat = "none" | "daily" | "weekdays" | "weekly" | "monthly" | "yearly"
export type Priority = "low" | "medium" | "high"

export type Subtask = { id: string; text: string; done: boolean }

export type Todo = {
    id: string
    title: string
    note: string
    list: string            // "Personal", "Work" or a list the person made
    priority: Priority
    starred: boolean
    done: boolean
    doneAt: string | null
    dueAt: string | null    // ISO date-time (date only → 23:59 IST of that day is not assumed; time optional)
    remindAt: string | null // when the alarm rings (ISO)
    snoozeUntil: string | null
    firedAt: string | null  // last alarm that rang (the remindAt/snooze it rang for)
    repeat: Repeat
    subtasks: Subtask[]
    createdAt: string
    updatedAt: string
}

export type NoteColor = "white" | "yellow" | "green" | "blue" | "pink" | "violet"
export type Note = {
    id: string
    title: string
    body: string
    color: NoteColor
    pinned: boolean
    archived: boolean
    checklist: Subtask[]
    remindAt: string | null
    firedAt: string | null
    createdAt: string
    updatedAt: string
}

export type TodoStore = { todos: Todo[]; notes: Note[]; lists: string[] }

export const DEFAULT_LISTS = ["Personal", "Work"]
export const REPEAT_LABEL: Record<Repeat, string> = { none: "Doesn't repeat", daily: "Every day", weekdays: "Every weekday (Mon–Sat)", weekly: "Every week", monthly: "Every month", yearly: "Every year" }
export const PRIORITY_COLOR: Record<Priority, string> = { low: "#94a3b8", medium: "#f5b52e", high: "#f43f5e" }
export const NOTE_BG: Record<NoteColor, string> = { white: "#ffffff", yellow: "#fff7d6", green: "#e6f6ea", blue: "#e8effe", pink: "#fde8ef", violet: "#efe9ff" }

export const LIMITS = { todos: 1000, notes: 500, title: 200, note: 5000, body: 20000, subtasks: 50, lists: 30 }

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

const str = (v: unknown, max: number) => typeof v === "string" ? v.slice(0, max) : ""
const iso = (v: unknown) => typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null
const subs = (v: unknown): Subtask[] => (Array.isArray(v) ? v : []).slice(0, LIMITS.subtasks).flatMap((s: any) => s && typeof s.text === "string" ? [{ id: typeof s.id === "string" ? s.id.slice(0, 30) : newId(), text: s.text.slice(0, 300), done: s.done === true }] : [])

export function sanitizeTodo(t: any, now = new Date().toISOString()): Todo | null {
    if (!t || typeof t !== "object") return null
    const title = str(t.title, LIMITS.title).trim()
    if (!title) return null
    return {
        id: typeof t.id === "string" && /^[\w-]{4,40}$/.test(t.id) ? t.id : newId(),
        title, note: str(t.note, LIMITS.note),
        list: str(t.list, 40).trim() || "Personal",
        priority: ["low", "medium", "high"].includes(t.priority) ? t.priority : "medium",
        starred: t.starred === true, done: t.done === true, doneAt: iso(t.doneAt),
        dueAt: iso(t.dueAt), remindAt: iso(t.remindAt), snoozeUntil: iso(t.snoozeUntil), firedAt: iso(t.firedAt),
        repeat: ["daily", "weekdays", "weekly", "monthly", "yearly"].includes(t.repeat) ? t.repeat : "none",
        subtasks: subs(t.subtasks),
        createdAt: iso(t.createdAt) ?? now, updatedAt: now,
    }
}

export function sanitizeNote(n: any, now = new Date().toISOString()): Note | null {
    if (!n || typeof n !== "object") return null
    const title = str(n.title, LIMITS.title), body = str(n.body, LIMITS.body)
    const checklist = subs(n.checklist)
    if (!title.trim() && !body.trim() && !checklist.length) return null
    return {
        id: typeof n.id === "string" && /^[\w-]{4,40}$/.test(n.id) ? n.id : newId(),
        title, body, checklist,
        color: ["white", "yellow", "green", "blue", "pink", "violet"].includes(n.color) ? n.color : "white",
        pinned: n.pinned === true, archived: n.archived === true,
        remindAt: iso(n.remindAt), firedAt: iso(n.firedAt),
        createdAt: iso(n.createdAt) ?? now, updatedAt: now,
    }
}

export function sanitizeStore(v: any): TodoStore {
    const todos = (Array.isArray(v?.todos) ? v.todos : []).slice(0, LIMITS.todos).map((t: any) => sanitizeTodo(t, t?.updatedAt)).filter(Boolean) as Todo[]
    const notes = (Array.isArray(v?.notes) ? v.notes : []).slice(0, LIMITS.notes).map((n: any) => sanitizeNote(n, n?.updatedAt)).filter(Boolean) as Note[]
    const lists = Array.from(new Set([...DEFAULT_LISTS, ...(Array.isArray(v?.lists) ? v.lists : []).filter((x: any) => typeof x === "string" && x.trim()).map((x: string) => x.trim().slice(0, 40))])).slice(0, LIMITS.lists)
    return { todos, notes, lists }
}

/** Next date for a repeating to-do (same time of day). */
export function nextOccurrence(isoDate: string, repeat: Repeat): string {
    const d = new Date(isoDate)
    if (repeat === "daily") d.setDate(d.getDate() + 1)
    else if (repeat === "weekdays") { do { d.setDate(d.getDate() + 1) } while (d.getDay() === 0) }
    else if (repeat === "weekly") d.setDate(d.getDate() + 7)
    else if (repeat === "monthly") d.setMonth(d.getMonth() + 1)
    else if (repeat === "yearly") d.setFullYear(d.getFullYear() + 1)
    return d.toISOString()
}

/** When the alarm should ring now (snooze wins), or null. */
export const alarmTime = (x: { remindAt: string | null; snoozeUntil?: string | null }) => x.snoozeUntil ?? x.remindAt
/** An alarm is due when its time has passed and it hasn't rung for that time yet. */
export function alarmDue(x: { remindAt: string | null; snoozeUntil?: string | null; firedAt: string | null; done?: boolean; archived?: boolean }, now = Date.now()) {
    const at = alarmTime(x)
    if (!at || x.done || x.archived) return false
    const t = Date.parse(at)
    return t <= now && t > now - 24 * 3_600_000 && x.firedAt !== at
}
