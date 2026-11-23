import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { UNASSIGNABLE_EMPLOYEE_STATUSES } from "@/lib/employee-filter"
import { managerSiteIds, signOffOjt } from "@/lib/skills"

export const dynamic = "force-dynamic"

/** Sites this signer may sign off at: all for lms.manage, else their own sites. */
async function signerSites(access: { userId: string; isAdmin: boolean; permissions: string[]; siteIds: string[] }): Promise<string[] | null> {
    if (access.isAdmin || access.permissions.includes("lms.edit")) return null
    return Array.from(new Set([...(await managerSiteIds(access.userId)), ...access.siteIds]))
}

// GET — what the signer needs on the phone: their sites; with ?siteId= the
// staff there and the skills that apply; with ?employeeId= levels and recent sign-offs.
export async function GET(req: Request) {
    const g = await guard(req, ["lms.ojt", "lms.edit"])
    if (g instanceof NextResponse) return g
    try {
        const sp = new URL(req.url).searchParams
        const allowed = await signerSites(g.access)
        const siteId = sp.get("siteId")
        if (!siteId) {
            const sites = await prisma.site.findMany({ where: { isActive: true, ...(allowed ? { id: { in: allowed } } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" } })
            return NextResponse.json({ sites })
        }
        if (allowed && !allowed.includes(siteId)) return NextResponse.json({ error: "This site is not one of yours" }, { status: 403 })
        const [employees, skills] = await Promise.all([
            prisma.employee.findMany({
                where: { status: { notIn: [...UNASSIGNABLE_EMPLOYEE_STATUSES] }, deployments: { some: { isActive: true, siteId } } },
                select: { id: true, employeeId: true, firstName: true, lastName: true, designation: true }, orderBy: { firstName: "asc" }, take: 600,
            }),
            prisma.skill.findMany({ where: { isActive: true, OR: [{ siteId }, { siteId: null }] }, select: { id: true, code: true, name: true, category: true }, orderBy: { code: "asc" } }),
        ])
        const employeeId = sp.get("employeeId")
        const history = employeeId ? await prisma.ojtSignoff.findMany({ where: { employeeId }, orderBy: { signedAt: "desc" }, take: 20, select: { id: true, skillId: true, level: true, notes: true, signedAt: true } }) : []
        const levels = employeeId ? await prisma.employeeSkill.findMany({ where: { employeeId }, select: { skillId: true, level: true } }) : []
        return NextResponse.json({ employees, skills, history, levels })
    } catch (e: any) {
        if (e?.code === "P2021") return NextResponse.json({ error: "The skill matrix is not set up in the database yet." }, { status: 503 })
        console.error("[OJT_GET]", e)
        return NextResponse.json({ error: "Could not load" }, { status: 500 })
    }
}

// POST { employeeId, skillId, level 1–4, notes?, photoUrl? } — supervisor signs off on-the-job training.
export async function POST(req: Request) {
    const g = await guard(req, ["lms.ojt", "lms.edit"])
    if (g instanceof NextResponse) return g
    try {
        const b = await req.json().catch(() => ({}))
        const level = Number(b?.level)
        if (!b?.employeeId || !b?.skillId || !Number.isInteger(level) || level < 1 || level > 4) return NextResponse.json({ error: "Pick the person, the skill and a level" }, { status: 400 })
        const emp = await prisma.employee.findUnique({ where: { id: String(b.employeeId) }, select: { id: true, userId: true, firstName: true, deployments: { where: { isActive: true }, select: { siteId: true } } } })
        if (!emp) return NextResponse.json({ error: "Employee not found" }, { status: 404 })
        if (emp.userId === g.access.userId) return NextResponse.json({ error: "You cannot sign off your own training" }, { status: 403 })
        const allowed = await signerSites(g.access)
        if (allowed && !emp.deployments.some(d => allowed.includes(d.siteId))) return NextResponse.json({ error: "This person is not at one of your sites" }, { status: 403 })
        const skill = await prisma.skill.findUnique({ where: { id: String(b.skillId) }, select: { id: true, name: true, isActive: true } })
        if (!skill?.isActive) return NextResponse.json({ error: "Skill not found" }, { status: 404 })
        const photo = typeof b?.photoUrl === "string" && /^https?:\/\//.test(b.photoUrl) ? b.photoUrl.slice(0, 1000) : null
        const notes = typeof b?.notes === "string" && b.notes.trim() ? b.notes.trim().slice(0, 1000) : null
        const row = await signOffOjt({ employeeId: emp.id, skillId: skill.id, level, supervisorUserId: g.access.userId, notes, photoUrl: photo })
        if (emp.userId) await prisma.notification.create({ data: { userId: emp.userId, type: "lms", title: "Skill signed off", message: `${skill.name}: level ${level} signed off by ${g.access.name || "your supervisor"}.`, link: "/lms/learn" } }).catch(() => {})
        auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "lms.ojt_signoff", targetType: "OjtSignoff", targetId: row.id, targetName: skill.name, summary: `${emp.firstName}: level ${level}`, ...requestMeta(req) })
        return NextResponse.json({ ok: true, signoff: row }, { status: 201 })
    } catch (e) {
        console.error("[OJT_POST]", e)
        return NextResponse.json({ error: "Could not save" }, { status: 500 })
    }
}
