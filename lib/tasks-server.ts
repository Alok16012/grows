// Tasks module — who may do what, creating (to people / a site / a department),
// status changes with optional approval, comments, reminders and the on-time report.
import prisma from "@/lib/prisma"
import { has, employeeScope, type Access } from "@/lib/access"
import { sanitizeTaskSettings, OPEN_STATUSES, TASK_STATUS, PRIORITIES, type TaskSettings, type Priority, type TaskStatus, type Attachment } from "@/lib/tasks"

const KEY = "taskSettings"

export async function getTaskSettings(): Promise<TaskSettings> {
    try { const r = await prisma.appSetting.findUnique({ where: { key: KEY } }); return sanitizeTaskSettings(r?.value ? JSON.parse(r.value) : {}) } catch { return sanitizeTaskSettings({}) }
}
export async function saveTaskSettings(v: unknown, userId: string) {
    const s = sanitizeTaskSettings(v)
    await prisma.appSetting.upsert({ where: { key: KEY }, update: { value: JSON.stringify(s), updatedBy: userId }, create: { key: KEY, value: JSON.stringify(s), updatedBy: userId } })
    return s
}

export const canSeeTeam = (a: Access) => a.isAdmin || has(a, "tasks.view")
export const canEditAny = (a: Access) => a.isAdmin || has(a, "tasks.edit")
export const canApproveAny = (a: Access) => a.isAdmin || has(a, "tasks.approve")
export async function canAssign(a: Access) { return a.isAdmin || has(a, "tasks.create") || (await getTaskSettings()).anyoneCanAssign }

const okUrl = (u: unknown) => typeof u === "string" && (/^sb:\/\//.test(u) || /^https:\/\/[\w.-]+\.supabase\.co\//.test(u))
export function cleanAttachments(v: unknown): Attachment[] {
    return Array.isArray(v) ? v.filter((x: any) => x && okUrl(x.url)).slice(0, 10).map((x: any) => ({ name: String(x.name ?? "file").slice(0, 150), url: String(x.url) })) : []
}

async function note(userIds: (string | null | undefined)[], title: string, message: string, link = "/tasks") {
    const ids = Array.from(new Set(userIds.filter((x): x is string => !!x)))
    if (ids.length) await prisma.notification.createMany({ data: ids.map(userId => ({ userId, title, message, type: "task", link })) }).catch(e => console.error("[TASK_NOTIFY]", e))
}

async function nextTaskNo(): Promise<number> {
    const r: { n: number | null }[] = await prisma.$queryRawUnsafe(`SELECT MAX(NULLIF(regexp_replace("taskNo", '\\D', '', 'g'), '')::int) AS n FROM "WorkTask"`)
    return (r[0]?.n ?? 0) + 1
}

/** The logins a task goes to: chosen people, plus everyone at the chosen sites / departments (within the assigner's data scope). */
export async function resolveAssignees(a: Access, input: { userIds?: string[]; siteIds?: string[]; departmentIds?: string[] }) {
    const ids = new Set<string>((input.userIds ?? []).filter(x => typeof x === "string").slice(0, 500))
    const siteIds = (input.siteIds ?? []).filter(x => typeof x === "string").slice(0, 100)
    const deptIds = (input.departmentIds ?? []).filter(x => typeof x === "string").slice(0, 100)
    if (siteIds.length || deptIds.length) {
        const scope = await employeeScope(a)
        const groups = await prisma.employee.findMany({
            where: { AND: [{ status: { in: ["ACTIVE", "ON_LEAVE"] as any }, userId: { not: null } }, { OR: [...(siteIds.length ? [{ deployments: { some: { isActive: true, siteId: { in: siteIds } } } }] : []), ...(deptIds.length ? [{ departmentId: { in: deptIds } }] : [])] }, ...(scope ? [scope] : [])] },
            select: { userId: true }, take: 2000,
        })
        for (const e of groups) if (e.userId) ids.add(e.userId)
    }
    const live = await prisma.user.findMany({ where: { id: { in: Array.from(ids) }, isActive: true }, select: { id: true } })
    return live.map(u => u.id)
}

export async function createTasks(a: Access, b: { title: string; description?: string | null; priority?: string; dueAt?: string | null; needsApproval?: boolean; attachments?: unknown; userIds?: string[]; siteIds?: string[]; departmentIds?: string[] }) {
    const title = String(b.title ?? "").trim().slice(0, 200)
    if (!title) throw new Error("Enter what needs doing")
    const assignees = await resolveAssignees(a, b)
    if (!assignees.length) throw new Error("Pick who should do it (people, a site or a department)")
    if (assignees.length > 500) throw new Error("At most 500 people per task")
    const s = await getTaskSettings()
    const dueAt = b.dueAt ? new Date(b.dueAt) : null
    if (dueAt && isNaN(dueAt.getTime())) throw new Error("Pick a valid due date")
    const priority = (b.priority && b.priority in PRIORITIES ? b.priority : "MEDIUM") as Priority
    const groupId = assignees.length > 1 ? crypto.randomUUID() : null
    const attachments = cleanAttachments(b.attachments)
    let no = await nextTaskNo()
    const made: { id: string; taskNo: string; assigneeId: string }[] = []
    for (const assigneeId of assignees) {
        for (let tries = 0; tries < 5; tries++) {
            try {
                const t = await prisma.workTask.create({ data: { taskNo: `TSK-${String(no).padStart(5, "0")}`, groupId, title, description: b.description ? String(b.description).slice(0, 5000) : null, priority, dueAt, assigneeId, createdBy: a.userId, needsApproval: typeof b.needsApproval === "boolean" ? b.needsApproval : s.defaultNeedsApproval, attachments: attachments.length ? (attachments as any) : undefined }, select: { id: true, taskNo: true, assigneeId: true } })
                made.push(t); no++; break
            } catch (e: any) { if (e?.code === "P2002") { no = await nextTaskNo(); continue } throw e }
        }
    }
    const due = dueAt ? ` — due ${dueAt.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""
    await note(made.map(m => m.assigneeId).filter(x => x !== a.userId), `New task from ${a.name}`, `${title}${due}`, "/tasks")
    return made
}

export type TaskAction = "start" | "complete" | "approve" | "return" | "reopen" | "cancel" | "reassign" | "edit"

/** Change a task. Each action checks who may do it. */
export async function actOnTask(a: Access, id: string, action: TaskAction, b: any) {
    const t = await prisma.workTask.findUnique({ where: { id } })
    if (!t) throw new Error("Task not found")
    const isAssignee = t.assigneeId === a.userId, isCreator = t.createdBy === a.userId
    const manage = isCreator || canEditAny(a)
    const now = new Date()
    const need = (ok: boolean, msg: string) => { if (!ok) throw new Error(msg) }
    let data: any = {}, notifyTo: (string | null)[] = [], msg = ""
    switch (action) {
        case "start":
            need(isAssignee, "Only the person doing the task can start it"); need(t.status === "TODO", "Already started")
            data = { status: "IN_PROGRESS", startedAt: now }; break
        case "complete":
            need(isAssignee || manage, "Only the person doing the task can mark it done"); need(t.status === "TODO" || t.status === "IN_PROGRESS", "This task is not open")
            data = { status: t.needsApproval ? "AWAITING_APPROVAL" : "DONE", completedAt: now, completionNote: b?.note ? String(b.note).slice(0, 2000) : null, returnedNote: null }
            if (b?.attachments) data.attachments = [...((t.attachments as any[]) ?? []), ...cleanAttachments(b.attachments)].slice(0, 20)
            notifyTo = [t.createdBy]; msg = t.needsApproval ? `${a.name} finished “${t.title}” — please approve` : `${a.name} finished “${t.title}”`; break
        case "approve":
            need(isCreator || canApproveAny(a), "Only the person who assigned it (or an approver) can approve"); need(t.status === "AWAITING_APPROVAL", "Not waiting for approval")
            data = { status: "DONE", approvedAt: now, approvedBy: a.userId }; notifyTo = [t.assigneeId]; msg = `“${t.title}” approved by ${a.name}`; break
        case "return":
            need(isCreator || canApproveAny(a), "Only the person who assigned it (or an approver) can send it back"); need(t.status === "AWAITING_APPROVAL" || t.status === "DONE", "Nothing to send back")
            need(!!String(b?.note ?? "").trim(), "Say what still needs doing")
            data = { status: "IN_PROGRESS", returnedNote: String(b.note).slice(0, 2000), completedAt: null, approvedAt: null, approvedBy: null }; notifyTo = [t.assigneeId]; msg = `“${t.title}” sent back by ${a.name}: ${String(b.note).slice(0, 120)}`; break
        case "reopen":
            need(manage, "Only the person who assigned it can reopen it"); need(t.status === "DONE" || t.status === "CANCELLED", "Already open")
            data = { status: "TODO", completedAt: null, approvedAt: null, approvedBy: null }; notifyTo = [t.assigneeId]; msg = `“${t.title}” was reopened by ${a.name}`; break
        case "cancel":
            need(manage, "Only the person who assigned it can cancel it"); need(t.status !== "CANCELLED", "Already cancelled")
            data = { status: "CANCELLED" }; notifyTo = [t.assigneeId]; msg = `“${t.title}” was cancelled by ${a.name}`; break
        case "reassign": {
            need(manage, "Only the person who assigned it can reassign it")
            const to = String(b?.assigneeId ?? "")
            const u = await prisma.user.findFirst({ where: { id: to, isActive: true }, select: { id: true } })
            need(!!u, "Pick an active person"); need(to !== t.assigneeId, "Already theirs")
            data = { assigneeId: to, status: t.status === "CANCELLED" || t.status === "DONE" ? t.status : "TODO", startedAt: null }; notifyTo = [to]; msg = `${a.name} gave you the task “${t.title}”`; break
        }
        case "edit":
            need(manage, "Only the person who assigned it can edit it")
            if (typeof b?.title === "string" && b.title.trim()) data.title = b.title.trim().slice(0, 200)
            if (b?.description !== undefined) data.description = b.description ? String(b.description).slice(0, 5000) : null
            if (b?.priority && b.priority in PRIORITIES) data.priority = b.priority
            if (b?.dueAt !== undefined) { const d = b.dueAt ? new Date(b.dueAt) : null; need(!d || !isNaN(d.getTime()), "Pick a valid due date"); data.dueAt = d; data.lastRemindedAt = null }
            if (typeof b?.needsApproval === "boolean") data.needsApproval = b.needsApproval
            break
        default: throw new Error("Unknown action")
    }
    const u = await prisma.workTask.update({ where: { id }, data })
    if (msg) await note(notifyTo.filter(x => x !== a.userId), "Task update", msg, "/tasks")
    return u
}

export async function addComment(a: Access, taskId: string, body: string, attachments: unknown) {
    const t = await prisma.workTask.findUnique({ where: { id: taskId }, select: { id: true, title: true, assigneeId: true, createdBy: true } })
    if (!t) throw new Error("Task not found")
    if (![t.assigneeId, t.createdBy].includes(a.userId) && !canSeeTeam(a)) throw new Error("Not your task")
    const text = String(body ?? "").trim().slice(0, 3000)
    const files = cleanAttachments(attachments)
    if (!text && !files.length) throw new Error("Write a comment")
    const c = await prisma.workTaskComment.create({ data: { taskId, userId: a.userId, body: text || "(file)", attachments: files.length ? (files as any) : undefined } })
    await note([t.assigneeId, t.createdBy].filter(x => x !== a.userId), `Comment on “${t.title}”`, `${a.name}: ${text.slice(0, 140)}`, "/tasks")
    return c
}

/** Tasks the person may see: their own (to / by them) or, for the team board, anyone in their data scope. */
export async function taskWhere(a: Access, view: string) {
    if (view === "mine") return { assigneeId: a.userId }
    if (view === "byme") return { createdBy: a.userId }
    if (!canSeeTeam(a)) return { OR: [{ assigneeId: a.userId }, { createdBy: a.userId }] }
    const scope = await employeeScope(a)
    if (!scope) return {}
    const users = (await prisma.employee.findMany({ where: { AND: [scope, { userId: { not: null } }] }, select: { userId: true } })).map(e => e.userId!).filter(Boolean)
    return { OR: [{ assigneeId: { in: users } }, { createdBy: a.userId }, { assigneeId: a.userId }] }
}

/** Daily: due soon / overdue reminders (settings). */
export async function remindTasks(now = new Date()) {
    const s = await getTaskSettings()
    let n = 0
    if (s.remindHoursBefore) {
        const soon = await prisma.workTask.findMany({ where: { status: { in: ["TODO", "IN_PROGRESS"] }, dueAt: { gt: now, lte: new Date(now.getTime() + s.remindHoursBefore * 3600_000) }, lastRemindedAt: null }, select: { id: true, title: true, assigneeId: true, dueAt: true }, take: 1000 })
        for (const t of soon) { await note([t.assigneeId], "Task due soon", `“${t.title}” is due ${t.dueAt!.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`); await prisma.workTask.update({ where: { id: t.id }, data: { lastRemindedAt: now } }); n++ }
    }
    if (s.overdueRemindEveryHours) {
        const cutoff = new Date(now.getTime() - s.overdueRemindEveryHours * 3600_000)
        const late = await prisma.workTask.findMany({ where: { status: { in: ["TODO", "IN_PROGRESS"] }, dueAt: { lt: now }, OR: [{ lastRemindedAt: null }, { lastRemindedAt: { lt: cutoff } }] }, select: { id: true, title: true, assigneeId: true, createdBy: true }, take: 1000 })
        for (const t of late) { await note([t.assigneeId, ...(s.notifyAssignerOnOverdue ? [t.createdBy] : [])], "Task overdue", `“${t.title}” is past its due date`); await prisma.workTask.update({ where: { id: t.id }, data: { lastRemindedAt: now } }); n++ }
    }
    return n
}

/** On-time completion per person over a period (tasks due in the period). */
export async function taskReport(a: Access, from: Date, to: Date) {
    const where: any = { AND: [await taskWhere(a, "team"), { OR: [{ dueAt: { gte: from, lte: to } }, { dueAt: null, createdAt: { gte: from, lte: to } }] }, { status: { not: "CANCELLED" } }] }
    const tasks = await prisma.workTask.findMany({ where, select: { assigneeId: true, status: true, dueAt: true, completedAt: true } })
    const users = await prisma.user.findMany({ where: { id: { in: Array.from(new Set(tasks.map(t => t.assigneeId))) } }, select: { id: true, name: true } })
    const nameOf = new Map(users.map(u => [u.id, u.name]))
    const now = new Date()
    const by = new Map<string, { userId: string; name: string; total: number; done: number; onTime: number; late: number; openOverdue: number; open: number }>()
    for (const t of tasks) {
        const r = by.get(t.assigneeId) ?? { userId: t.assigneeId, name: nameOf.get(t.assigneeId) ?? "—", total: 0, done: 0, onTime: 0, late: 0, openOverdue: 0, open: 0 }
        r.total++
        if (t.status === "DONE" || t.status === "AWAITING_APPROVAL") { r.done++; if (!t.dueAt || (t.completedAt && t.completedAt <= t.dueAt)) r.onTime++; else r.late++ }
        else { r.open++; if (t.dueAt && t.dueAt < now) r.openOverdue++ }
        by.set(t.assigneeId, r)
    }
    return Array.from(by.values()).map(r => ({ ...r, onTimePct: r.done ? Math.round(r.onTime / r.done * 100) : null })).sort((x, y) => y.total - x.total)
}

export { OPEN_STATUSES, TASK_STATUS }
export type { TaskStatus }
