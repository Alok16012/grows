import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { signRefs } from "@/lib/secure-files"
import { taskWhere, createTasks, canAssign, canSeeTeam } from "@/lib/tasks-server"
import { OPEN_STATUSES } from "@/lib/tasks"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET ?view=mine|byme|team&status=open|done|all|<STATUS>&q=&priority=&assignee=
export async function GET(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    const sp = new URL(req.url).searchParams
    const view = sp.get("view") ?? "mine"
    const status = sp.get("status") ?? "open"
    const q = (sp.get("q") ?? "").trim()
    const base = await taskWhere(g.access, view)
    const where: any = { AND: [base] }
    if (status === "open") where.AND.push({ status: { in: OPEN_STATUSES } })
    else if (status === "done") where.AND.push({ status: "DONE" })
    else if (status !== "all") where.AND.push({ status })
    if (sp.get("priority")) where.AND.push({ priority: sp.get("priority") })
    if (sp.get("assignee")) where.AND.push({ assigneeId: sp.get("assignee") })
    if (q) where.AND.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { taskNo: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] })
    const tasks = await prisma.workTask.findMany({ where, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], take: 500, include: { _count: { select: { comments: true } } } })
    const users = await prisma.user.findMany({ where: { id: { in: Array.from(new Set(tasks.flatMap(t => [t.assigneeId, t.createdBy]))) } }, select: { id: true, name: true } })
    const nameOf = new Map(users.map(u => [u.id, u.name]))
    // Counts for "my tasks" (header badges and the dashboard card).
    const now = new Date()
    const [myOpen, myOverdue, awaitingMine] = await Promise.all([
        prisma.workTask.count({ where: { assigneeId: g.access.userId, status: { in: OPEN_STATUSES } } }),
        prisma.workTask.count({ where: { assigneeId: g.access.userId, status: { in: ["TODO", "IN_PROGRESS"] }, dueAt: { lt: now } } }),
        prisma.workTask.count({ where: { createdBy: g.access.userId, status: "AWAITING_APPROVAL" } }),
    ])
    return NextResponse.json(await signRefs({
        me: g.access.userId, canAssign: await canAssign(g.access), canSeeTeam: canSeeTeam(g.access),
        counts: { myOpen, myOverdue, awaitingMine },
        tasks: tasks.map(({ _count, ...t }) => ({ ...t, comments: _count.comments, assigneeName: nameOf.get(t.assigneeId) ?? "—", createdByName: nameOf.get(t.createdBy) ?? "—" })),
    }))
}

// POST { title, description?, priority?, dueAt?, needsApproval?, attachments?, userIds?, siteIds?, departmentIds? }
export async function POST(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    if (!(await canAssign(g.access))) return NextResponse.json({ error: "Assigning tasks needs the Tasks → Create permission" }, { status: 403 })
    const b = await req.json().catch(() => ({}))
    try {
        const made = await createTasks(g.access, b)
        auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "task.create", targetType: "WorkTask", targetId: made[0]?.id ?? null, targetName: String(b?.title ?? "").slice(0, 120), summary: `Task “${String(b?.title ?? "").slice(0, 80)}” assigned to ${made.length} person(s)`, ...requestMeta(req) })
        return NextResponse.json({ created: made.length, tasks: made })
    } catch (e: any) { return NextResponse.json({ error: e?.message || "Could not create" }, { status: 400 }) }
}
