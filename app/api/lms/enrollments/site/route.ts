import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { UNASSIGNABLE_EMPLOYEE_STATUSES } from "@/lib/employee-filter"
import { getLmsSettings } from "@/lib/lms-settings"

export const dynamic = "force-dynamic"
const DAY = 86_400_000

// POST { courseId, siteId, dueDays?, includeCompleted?, preview? }
// Refresher for a whole site (e.g. after a customer complaint there): everyone
// deployed at the site is enrolled; with includeCompleted, people who already
// passed are sent through it again.
export async function POST(req: Request) {
    const g = await guard(req, "lms.enroll")
    if (g instanceof NextResponse) return g
    try {
        const b = await req.json().catch(() => ({}))
        const courseId = String(b?.courseId ?? ""), siteId = String(b?.siteId ?? "")
        if (!courseId || !siteId) return NextResponse.json({ error: "Pick a course and a site" }, { status: 400 })
        const course = await prisma.course.findUnique({ where: { id: courseId }, select: { title: true, status: true } })
        if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 })
        if (course.status !== "PUBLISHED") return NextResponse.json({ error: "Publish the course first" }, { status: 400 })
        const s = await getLmsSettings()
        const dueDays = Number.isFinite(Number(b?.dueDays)) && Number(b.dueDays) > 0 ? Math.min(365, Math.round(Number(b.dueDays))) : s.defaults.dueDays
        const includeCompleted = b?.includeCompleted === true

        const staff = await prisma.employee.findMany({
            where: { status: { notIn: [...UNASSIGNABLE_EMPLOYEE_STATUSES] }, deployments: { some: { isActive: true, siteId } } },
            select: { id: true, userId: true },
        })
        const existing = await prisma.courseEnrollment.findMany({ where: { courseId, employeeId: { in: staff.map(x => x.id) } }, select: { id: true, employeeId: true, status: true } })
        const byEmp = new Map(existing.map(e => [e.employeeId, e]))
        const toCreate = staff.filter(x => !byEmp.has(x.id))
        const toReset = existing.filter(e => e.status === "FAILED" || (includeCompleted && e.status === "COMPLETED"))
        const already = existing.length - toReset.length
        if (b?.preview) return NextResponse.json({ staff: staff.length, toEnrol: toCreate.length, toReset: toReset.length, already })

        const now = new Date(), due = new Date(now.getTime() + dueDays * DAY)
        if (toCreate.length) await prisma.courseEnrollment.createMany({ data: toCreate.map(x => ({ courseId, employeeId: x.id, enrolledBy: g.access.userId, dueDate: due })), skipDuplicates: true })
        if (toReset.length) {
            // enrolledAt restarts the cycle, so quiz attempts are counted afresh.
            await prisma.courseEnrollment.updateMany({
                where: { id: { in: toReset.map(e => e.id) } },
                data: { status: "ENROLLED", progress: 0, startedAt: null, completedAt: null, score: null, attempts: 0, enrolledAt: now, dueDate: due, enrolledBy: g.access.userId },
            })
        }
        const touched = new Set([...toCreate.map(x => x.id), ...toReset.map(e => e.employeeId)])
        const notes = staff.filter(x => touched.has(x.id) && x.userId).map(x => ({ userId: x.userId!, type: "lms", title: "Refresher training assigned", message: `Please complete "${course.title}" by ${due.toLocaleDateString("en-GB")}.`, link: "/lms/learn" }))
        if (notes.length) await prisma.notification.createMany({ data: notes }).catch(() => {})
        auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "lms.site_refresher", targetType: "Course", targetId: courseId, targetName: course.title, summary: `Site refresher: ${toCreate.length} enrolled, ${toReset.length} re-enrolled`, ...requestMeta(req) })
        return NextResponse.json({ ok: true, enrolled: toCreate.length, reenrolled: toReset.length, already })
    } catch (e) {
        console.error("[LMS_SITE_REFRESHER]", e)
        return NextResponse.json({ error: "Could not assign" }, { status: 500 })
    }
}
