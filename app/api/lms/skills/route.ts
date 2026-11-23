import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { nextSkillCode, parseSkill } from "@/lib/skills"

export const dynamic = "force-dynamic"

// GET — skills on the matrix (with site and linked course names).
export async function GET(req: Request) {
    const g = await guard(req, ["lms.view", "lms.edit", "lms.ojt"])
    if (g instanceof NextResponse) return g
    try {
        const skills = await prisma.skill.findMany({ orderBy: [{ isActive: "desc" }, { code: "asc" }], include: { _count: { select: { levels: true } } } })
        const siteIds = Array.from(new Set(skills.map(s => s.siteId).filter((x): x is string => !!x)))
        const courseIds = Array.from(new Set(skills.map(s => s.courseId).filter((x): x is string => !!x)))
        const [sites, courses] = await Promise.all([
            siteIds.length ? prisma.site.findMany({ where: { id: { in: siteIds } }, select: { id: true, name: true } }) : [],
            courseIds.length ? prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true, courseCode: true } }) : [],
        ])
        const siteOf = new Map(sites.map(s => [s.id, s.name]))
        const courseOf = new Map(courses.map(c => [c.id, `${c.courseCode} ${c.title}`]))
        return NextResponse.json({
            skills: skills.map(s => ({ ...s, siteName: s.siteId ? siteOf.get(s.siteId) ?? null : null, courseName: s.courseId ? courseOf.get(s.courseId) ?? null : null, people: s._count.levels })),
        })
    } catch (e: any) {
        if (e?.code === "P2021") return NextResponse.json({ error: "The skill matrix isn't set up in the database yet." }, { status: 503 })
        console.error("[SKILLS_GET]", e)
        return NextResponse.json({ error: "Could not load skills" }, { status: 500 })
    }
}

// POST — add a skill.
export async function POST(req: Request) {
    const g = await guard(req, "lms.edit")
    if (g instanceof NextResponse) return g
    try {
        const data = parseSkill(await req.json().catch(() => ({})), false) as any
        let skill = null
        for (let i = 0; i < 3 && !skill; i++) {
            try { skill = await prisma.skill.create({ data: { ...data, code: await nextSkillCode(), createdBy: g.access.userId } }) }
            catch (e: any) { if (e?.code !== "P2002") throw e }
        }
        if (!skill) return NextResponse.json({ error: "Could not create — try again" }, { status: 409 })
        auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "lms.skill_create", targetType: "Skill", targetId: skill.id, targetName: `${skill.code} ${skill.name}`, summary: "Skill added", after: skill, ...requestMeta(req) })
        return NextResponse.json({ skill }, { status: 201 })
    } catch (e: any) {
        if (e instanceof Error && !("code" in e)) return NextResponse.json({ error: e.message }, { status: 400 })
        console.error("[SKILLS_POST]", e)
        return NextResponse.json({ error: "Could not save" }, { status: 500 })
    }
}
