import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { UNASSIGNABLE_EMPLOYEE_STATUSES } from "@/lib/employee-filter"
import { setSkillLevel, managerSiteIds } from "@/lib/skills"
import { getLmsSettings } from "@/lib/lms-settings"

export const dynamic = "force-dynamic"

// GET ?siteId= — the matrix for one site: staff deployed there × skills that
// apply there (site skills + skills for everywhere), with current levels.
export async function GET(req: Request) {
    const g = await guard(req, ["lms.view", "lms.manage", "lms.ojt"])
    if (g instanceof NextResponse) return g
    try {
        const siteId = new URL(req.url).searchParams.get("siteId")
        if (!siteId) return NextResponse.json({ error: "Pick a site" }, { status: 400 })
        // Without lms.manage, only sites you look after.
        if (!g.access.isAdmin && !g.access.permissions.includes("lms.manage")) {
            const mine = new Set([...(await managerSiteIds(g.access.userId)), ...g.access.siteIds])
            if (!mine.has(siteId)) return NextResponse.json({ error: "This site is not one of yours" }, { status: 403 })
        }
        const [employees, skills, s] = await Promise.all([
            prisma.employee.findMany({
                where: { status: { notIn: [...UNASSIGNABLE_EMPLOYEE_STATUSES] }, deployments: { some: { isActive: true, siteId } } },
                select: { id: true, employeeId: true, firstName: true, lastName: true, designation: true },
                orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
                take: 600,
            }),
            prisma.skill.findMany({ where: { isActive: true, OR: [{ siteId }, { siteId: null }] }, orderBy: [{ category: "asc" }, { code: "asc" }], select: { id: true, code: true, name: true, category: true, siteId: true } }),
            getLmsSettings(),
        ])
        const levels = employees.length && skills.length
            ? await prisma.employeeSkill.findMany({ where: { employeeId: { in: employees.map(e => e.id) }, skillId: { in: skills.map(k => k.id) } }, select: { employeeId: true, skillId: true, level: true, source: true, assessedAt: true } })
            : []
        const counts = new Map<string, number>()
        for (const l of levels) if (l.level >= s.skills.multiskillMinLevel) counts.set(l.employeeId, (counts.get(l.employeeId) ?? 0) + 1)
        const multiskilled = Array.from(counts.values()).filter(n => n >= s.skills.multiskillMinSkills).length
        return NextResponse.json({ employees, skills, levels, multiskilled, rule: s.skills, canEdit: g.access.isAdmin || g.access.permissions.includes("lms.manage") })
    } catch (e: any) {
        if (e?.code === "P2021") return NextResponse.json({ error: "The skill matrix is not set up in the database yet." }, { status: 503 })
        console.error("[SKILL_MATRIX_GET]", e)
        return NextResponse.json({ error: "Could not load the matrix" }, { status: 500 })
    }
}

// PUT { employeeId, skillId, level, notes? } — HR sets a level directly.
export async function PUT(req: Request) {
    const g = await guard(req, "lms.manage")
    if (g instanceof NextResponse) return g
    try {
        const b = await req.json().catch(() => ({}))
        const level = Number(b?.level)
        if (!b?.employeeId || !b?.skillId || !Number.isInteger(level) || level < 0 || level > 4) return NextResponse.json({ error: "employeeId, skillId and a level 0–4 are required" }, { status: 400 })
        const stored = await setSkillLevel(String(b.employeeId), String(b.skillId), level, g.access.userId, typeof b?.notes === "string" ? b.notes.slice(0, 500) : null)
        auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "lms.skill_level", targetType: "EmployeeSkill", targetId: `${b.employeeId}:${b.skillId}`, targetName: "Skill level", summary: `Level set to ${stored}`, ...requestMeta(req) })
        return NextResponse.json({ ok: true, level: stored })
    } catch (e) {
        console.error("[SKILL_MATRIX_PUT]", e)
        return NextResponse.json({ error: "Could not save" }, { status: 500 })
    }
}
