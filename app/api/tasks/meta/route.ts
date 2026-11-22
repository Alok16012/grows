import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, has, auditLater, requestMeta } from "@/lib/access"
import { getTaskSettings, saveTaskSettings, canAssign } from "@/lib/tasks-server"

export const dynamic = "force-dynamic"

// GET ?q= — people to assign to (active logins, with employee code / designation / site); without q: sites, departments, settings.
export async function GET(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    const q = (new URL(req.url).searchParams.get("q") ?? "").trim()
    if (q) {
        const users = await prisma.user.findMany({
            where: { isActive: true, OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { employeeProfile: { is: { employeeId: { contains: q, mode: "insensitive" } } } }] },
            select: { id: true, name: true, employeeProfile: { select: { employeeId: true, designation: true, deployments: { where: { isActive: true }, select: { site: { select: { name: true } } }, take: 1 } } } }, take: 15,
        })
        return NextResponse.json({ people: users.map(u => ({ id: u.id, name: u.name, code: u.employeeProfile?.employeeId ?? null, designation: u.employeeProfile?.designation ?? null, site: u.employeeProfile?.deployments[0]?.site?.name ?? null })) })
    }
    const [sites, departments, settings] = await Promise.all([
        prisma.site.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
        prisma.department.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
        getTaskSettings(),
    ])
    return NextResponse.json({ sites, departments, settings, canAssign: await canAssign(g.access), canEditSettings: g.access.isAdmin || has(g.access, "tasks.edit") })
}

// PUT — task settings (Admin or Tasks → Edit).
export async function PUT(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    if (!(g.access.isAdmin || has(g.access, "tasks.edit"))) return NextResponse.json({ error: "Needs Tasks → Edit" }, { status: 403 })
    const s = await saveTaskSettings(await req.json().catch(() => ({})), g.access.userId)
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "task.settings", targetType: "Setting", targetId: "taskSettings", targetName: "Task settings", summary: `Anyone can assign: ${s.anyoneCanAssign}; reminder ${s.remindHoursBefore} h before; overdue every ${s.overdueRemindEveryHours} h`, after: s, ...requestMeta(req) })
    return NextResponse.json({ settings: s })
}
