import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { signRefs } from "@/lib/secure-files"
import { actOnTask, addComment, canSeeTeam, canEditAny, canApproveAny, type TaskAction } from "@/lib/tasks-server"

export const dynamic = "force-dynamic"

// GET — one task with its comments (the people on it, or team-board viewers).
export async function GET(req: Request, { params }: { params: { id: string } }) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    const t = await prisma.workTask.findUnique({ where: { id: params.id }, include: { comments: { orderBy: { createdAt: "asc" } } } })
    if (!t || (![t.assigneeId, t.createdBy].includes(g.access.userId) && !canSeeTeam(g.access))) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const users = await prisma.user.findMany({ where: { id: { in: Array.from(new Set([t.assigneeId, t.createdBy, t.approvedBy, ...t.comments.map(c => c.userId)].filter((x): x is string => !!x))) } }, select: { id: true, name: true } })
    const nameOf = new Map(users.map(u => [u.id, u.name]))
    const group = t.groupId ? await prisma.workTask.groupBy({ by: ["status"], where: { groupId: t.groupId }, _count: { _all: true } }) : []
    const me = g.access.userId
    return NextResponse.json(await signRefs({
        task: { ...t, assigneeName: nameOf.get(t.assigneeId) ?? "—", createdByName: nameOf.get(t.createdBy) ?? "—", approvedByName: t.approvedBy ? nameOf.get(t.approvedBy) ?? null : null, comments: t.comments.map(c => ({ ...c, userName: nameOf.get(c.userId) ?? "—" })) },
        group: group.map(x => ({ status: x.status, n: x._count._all })),
        can: { work: t.assigneeId === me, manage: t.createdBy === me || canEditAny(g.access), approve: t.createdBy === me || canApproveAny(g.access) },
    }))
}

// POST { action: start|complete|approve|return|reopen|cancel|reassign|edit, ... } | { comment, attachments? }
export async function POST(req: Request, { params }: { params: { id: string } }) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    const b = await req.json().catch(() => ({}))
    try {
        if (b?.comment !== undefined) return NextResponse.json({ comment: await addComment(g.access, params.id, b.comment, b.attachments) })
        const t = await actOnTask(g.access, params.id, String(b?.action) as TaskAction, b)
        auditLater({ actorId: g.access.userId, actorName: g.access.name, action: `task.${b?.action}`, targetType: "WorkTask", targetId: t.id, targetName: `${t.taskNo} ${t.title}`.slice(0, 150), summary: `${t.taskNo}: ${b?.action}${b?.note ? ` — ${String(b.note).slice(0, 100)}` : ""}`, ...requestMeta(req) })
        return NextResponse.json({ task: t })
    } catch (e: any) { return NextResponse.json({ error: e?.message || "Could not save" }, { status: 400 }) }
}
