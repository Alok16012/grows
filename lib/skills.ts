import prisma from "@/lib/prisma"
import { UNASSIGNABLE_EMPLOYEE_STATUSES } from "@/lib/employee-filter"
import { getLmsSettings } from "@/lib/lms-settings"

// Skill matrix (LMS → Skill matrix) and on-the-job training sign-off.
// Levels follow the usual shop-floor matrix:
export const SKILL_LEVELS = [
    { level: 0, label: "Not trained", short: "0" },
    { level: 1, label: "Theory done", short: "1" },
    { level: 2, label: "Under supervision", short: "2" },
    { level: 3, label: "Independent", short: "3" },
    { level: 4, label: "Can train others", short: "4" },
] as const
export const SKILL_CATEGORIES = ["PROCESS", "PART", "CUSTOMER", "SAFETY"] as const

/** Next free skill code: SK-001 … */
export async function nextSkillCode(): Promise<string> {
    const rows = await prisma.skill.findMany({ select: { code: true } })
    const max = rows.reduce((m, r) => Math.max(m, Number(/^SK-(\d+)$/.exec(r.code)?.[1] ?? 0)), 0)
    return `SK-${String(max + 1).padStart(3, "0")}`
}

/** Sites a manager looks after: sites of projects they manage + sites assigned to them. */
export async function managerSiteIds(userId: string): Promise<string[]> {
    const [pm, sa] = await Promise.all([
        prisma.projectManager.findMany({ where: { managerId: userId }, select: { project: { select: { siteId: true } } } }),
        prisma.siteAssignment.findMany({ where: { userId, status: "active" }, select: { siteId: true } }),
    ])
    return Array.from(new Set([...pm.map(x => x.project.siteId), ...sa.map(x => x.siteId)].filter((x): x is string => !!x)))
}

/** Active staff deployed at these sites. */
export async function employeesAtSites(siteIds: string[]): Promise<string[]> {
    if (!siteIds.length) return []
    const rows = await prisma.employee.findMany({
        where: { status: { notIn: [...UNASSIGNABLE_EMPLOYEE_STATUSES] }, deployments: { some: { isActive: true, siteId: { in: siteIds } } } },
        select: { id: true },
    })
    return rows.map(r => r.id)
}

/** A manager's team = everyone deployed at their sites. */
export async function teamEmployeeIds(userId: string): Promise<string[]> {
    return employeesAtSites(await managerSiteIds(userId))
}

/** Set a level (never lowers unless `allowLower`). Returns the stored level. */
async function upsertLevel(employeeId: string, skillId: string, level: number, source: string, by: string | null, notes: string | null, allowLower: boolean) {
    const cur = await prisma.employeeSkill.findUnique({ where: { employeeId_skillId: { employeeId, skillId } } })
    if (cur && !allowLower && cur.level >= level) return cur.level
    await prisma.employeeSkill.upsert({
        where: { employeeId_skillId: { employeeId, skillId } },
        create: { employeeId, skillId, level, source, assessedBy: by, notes },
        update: { level, source, assessedBy: by, assessedAt: new Date(), notes },
    })
    return level
}

/** After a course is passed: skills linked to it reach the theory level. Never throws. */
export async function raiseSkillsFromCourse(employeeId: string, courseId: string): Promise<number> {
    try {
        const skills = await prisma.skill.findMany({ where: { courseId, isActive: true }, select: { id: true } })
        if (!skills.length) return 0
        const level = (await getLmsSettings()).skills.courseLevel
        for (const s of skills) await upsertLevel(employeeId, s.id, level, "COURSE", null, "Course passed", false)
        return skills.length
    } catch (e) {
        console.error("[SKILL_FROM_COURSE]", e)
        return 0
    }
}

/** A manual matrix edit by HR (can lower a level). */
export async function setSkillLevel(employeeId: string, skillId: string, level: number, by: string, notes: string | null) {
    return upsertLevel(employeeId, skillId, Math.max(0, Math.min(4, Math.round(level))), "MANUAL", by, notes, true)
}

/** On-the-job sign-off: history row + the current level. */
export async function signOffOjt(a: { employeeId: string; skillId: string; level: number; supervisorUserId: string; notes: string | null; photoUrl: string | null }) {
    const level = Math.max(1, Math.min(4, Math.round(a.level)))
    const row = await prisma.ojtSignoff.create({ data: { ...a, level } })
    await upsertLevel(a.employeeId, a.skillId, level, "OJT", a.supervisorUserId, a.notes, true)
    return row
}

// ─── Numbers for the KPI scorecards (Performance → system metrics) ──────────

/** % of the team's courses due by `before` that are completed. null = nothing due. */
export async function teamCompletionPct(employeeIds: string[], before: Date): Promise<number | null> {
    if (!employeeIds.length) return null
    const [due, done] = await Promise.all([
        prisma.courseEnrollment.count({ where: { employeeId: { in: employeeIds }, dueDate: { lte: before }, course: { status: "PUBLISHED" } } }),
        prisma.courseEnrollment.count({ where: { employeeId: { in: employeeIds }, dueDate: { lte: before }, status: "COMPLETED", course: { status: "PUBLISHED" } } }),
    ])
    return due ? Math.round((done / due) * 1000) / 10 : null
}

/** Team members with at least N skills at the "multiskilled" level (LMS settings). */
export async function multiskilledCount(employeeIds: string[]): Promise<number> {
    if (!employeeIds.length) return 0
    const s = (await getLmsSettings()).skills
    const rows = await prisma.employeeSkill.groupBy({
        by: ["employeeId"], where: { employeeId: { in: employeeIds }, level: { gte: s.multiskillMinLevel }, skill: { isActive: true } }, _count: { _all: true },
    })
    return rows.filter(r => r._count._all >= s.multiskillMinSkills).length
}

/** % of the team whose skill levels were reviewed in the last N days (LMS settings). */
export async function matrixUpdatedPct(employeeIds: string[], at = new Date()): Promise<number | null> {
    if (!employeeIds.length) return null
    const s = (await getLmsSettings()).skills
    const since = new Date(at.getTime() - s.reviewEveryDays * 86_400_000)
    const rows = await prisma.employeeSkill.findMany({ where: { employeeId: { in: employeeIds }, assessedAt: { gte: since } }, select: { employeeId: true }, distinct: ["employeeId"] })
    return Math.round((rows.length / employeeIds.length) * 1000) / 10
}

/** Validate skill fields for create / edit (throws a plain Error with the message to show). */
export function parseSkill(b: any, partial: boolean) {
    const d: Record<string, unknown> = {}
    if (!partial || b?.name !== undefined) {
        const name = String(b?.name ?? "").trim().slice(0, 120)
        if (name.length < 2) throw new Error("Give the skill a name")
        d.name = name
    }
    if (!partial || b?.category !== undefined) {
        const c = String(b?.category ?? "PROCESS").toUpperCase()
        if (!(SKILL_CATEGORIES as readonly string[]).includes(c)) throw new Error("Unknown category")
        d.category = c
    }
    if (b?.siteId !== undefined) d.siteId = b.siteId ? String(b.siteId) : null
    if (b?.courseId !== undefined) d.courseId = b.courseId ? String(b.courseId) : null
    if (b?.description !== undefined) d.description = String(b.description ?? "").trim().slice(0, 1000) || null
    if (b?.isActive !== undefined) d.isActive = !!b.isActive
    return d
}

