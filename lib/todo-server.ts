// Personal To-do & Notes — storage. One private record per user in AppSetting
// ("todo:<userId>"), read and written only through /api/me/todo. Server-only.
import prisma from "@/lib/prisma"
import { sanitizeStore, sanitizeTodo, sanitizeNote, nextOccurrence, LIMITS, type TodoStore } from "@/lib/todo"

const key = (userId: string) => `todo:${userId}`

export async function loadTodoStore(userId: string): Promise<TodoStore> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: key(userId) } })
        return sanitizeStore(row?.value ? JSON.parse(row.value) : {})
    } catch { return sanitizeStore({}) }
}

async function save(userId: string, s: TodoStore) {
    const value = JSON.stringify(s)
    await prisma.appSetting.upsert({ where: { key: key(userId) }, update: { value, updatedBy: userId }, create: { key: key(userId), value, updatedBy: userId } })
}

export class TodoError extends Error {}

/** Apply one change and save. Returns the whole store. */
export async function applyTodoOp(userId: string, b: any): Promise<TodoStore> {
    const s = await loadTodoStore(userId)
    const now = new Date().toISOString()
    const findTodo = (id: unknown) => s.todos.find(t => t.id === id)
    switch (b?.op) {
        case "upsertTodo": {
            const prev = findTodo(b.todo?.id)
            const t = sanitizeTodo({ ...b.todo, createdAt: prev?.createdAt }, now)
            if (!t) throw new TodoError("Give the to-do a title")
            // A new alarm time clears the "already rang" mark and any snooze.
            if (!prev || prev.remindAt !== t.remindAt) { t.firedAt = null; t.snoozeUntil = null }
            if (!s.lists.includes(t.list)) s.lists.push(t.list)
            if (prev) s.todos[s.todos.indexOf(prev)] = t
            else { if (s.todos.length >= LIMITS.todos) throw new TodoError(`Up to ${LIMITS.todos} to-dos — clear some finished ones first`); s.todos.unshift(t) }
            break
        }
        case "toggleTodo": {
            const t = findTodo(b.id); if (!t) break
            if (b.done && t.repeat !== "none" && (t.dueAt || t.remindAt)) {
                // Repeating: roll forward to the next occurrence and stay open.
                if (t.dueAt) t.dueAt = nextOccurrence(t.dueAt, t.repeat)
                if (t.remindAt) t.remindAt = nextOccurrence(t.remindAt, t.repeat)
                t.subtasks = t.subtasks.map(x => ({ ...x, done: false }))
                t.firedAt = null; t.snoozeUntil = null; t.doneAt = now
            } else { t.done = !!b.done; t.doneAt = b.done ? now : null }
            t.updatedAt = now
            break
        }
        case "toggleSubtask": {
            const t = findTodo(b.id); const st = t?.subtasks.find(x => x.id === b.subId)
            if (t && st) { st.done = !st.done; t.updatedAt = now }
            break
        }
        case "deleteTodo": s.todos = s.todos.filter(t => t.id !== b.id); break
        case "clearDone": s.todos = s.todos.filter(t => !t.done); break
        case "snooze": {
            const mins = Math.min(24 * 60, Math.max(1, Math.round(Number(b.minutes) || 10)))
            const until = new Date(Date.now() + mins * 60_000).toISOString()
            const t = findTodo(b.id); if (t) { t.snoozeUntil = until; t.updatedAt = now }
            break
        }
        case "fired": {
            const at = typeof b.at === "string" ? b.at : null
            if (b.kind === "note") { const n = s.notes.find(x => x.id === b.id); if (n) n.firedAt = at }
            else { const t = findTodo(b.id); if (t) t.firedAt = at }
            break
        }
        case "upsertNote": {
            const prev = s.notes.find(n => n.id === b.note?.id)
            const n = sanitizeNote({ ...b.note, createdAt: prev?.createdAt }, now)
            if (!n) throw new TodoError("Write something in the note first")
            if (!prev || prev.remindAt !== n.remindAt) n.firedAt = null
            if (prev) s.notes[s.notes.indexOf(prev)] = n
            else { if (s.notes.length >= LIMITS.notes) throw new TodoError(`Up to ${LIMITS.notes} notes`); s.notes.unshift(n) }
            break
        }
        case "deleteNote": s.notes = s.notes.filter(n => n.id !== b.id); break
        case "addList": {
            const name = String(b.name ?? "").trim().slice(0, 40)
            if (!name) throw new TodoError("Name the list")
            if (!s.lists.includes(name)) { if (s.lists.length >= LIMITS.lists) throw new TodoError("Too many lists"); s.lists.push(name) }
            break
        }
        case "deleteList": {
            const name = String(b.name ?? "")
            if (name === "Personal" || name === "Work") throw new TodoError("Personal and Work stay")
            s.lists = s.lists.filter(l => l !== name)
            s.todos.forEach(t => { if (t.list === name) t.list = "Personal" })
            break
        }
        default: throw new TodoError("Unknown change")
    }
    await save(userId, s)
    return s
}
