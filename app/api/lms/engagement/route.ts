import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard } from "@/lib/access"
import { videoTrackable, isPdfUrl } from "@/lib/lms-tracking"

export const dynamic = "force-dynamic"

// GET ?courseId= — how each learner really went through a course: active
// minutes vs planned, video % watched, forward skips, PDF pages seen, quiz
// score — with flags for rushed or skipped learning.
export async function GET(req: Request) {
    const g = await guard(req, "lms.manage")
    if (g instanceof NextResponse) return g
    try {
        const courseId = new URL(req.url).searchParams.get("courseId")
        if (!courseId) return NextResponse.json({ error: "Pick a course" }, { status: 400 })
        const course = await prisma.course.findUnique({ where: { id: courseId }, select: { title: true, modules: { orderBy: { order: "asc" }, select: { id: true, title: true, videoUrl: true, docUrl: true, duration: true } } } })
        if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 })
        const enrollments = await prisma.courseEnrollment.findMany({
            where: { courseId },
            select: { id: true, status: true, progress: true, score: true, attempts: true, completedAt: true, employee: { select: { firstName: true, lastName: true, employeeId: true } } },
            orderBy: { enrolledAt: "desc" },
            take: 2000,
        })
        const rows = await prisma.moduleProgress.findMany({ where: { enrollmentId: { in: enrollments.map(e => e.id) } } })
        const byEnr = new Map<string, typeof rows>()
        for (const r of rows) byEnr.set(r.enrollmentId, [...(byEnr.get(r.enrollmentId) ?? []), r])

        const plannedMin = course.modules.reduce((n, m) => n + m.duration, 0)
        const videoMods = course.modules.filter(m => videoTrackable(m.videoUrl))
        const pdfMods = course.modules.filter(m => isPdfUrl(m.docUrl))
        const out = enrollments.map(e => {
            const list = byEnr.get(e.id) ?? []
            const pOf = new Map(list.map(r => [r.moduleId, r]))
            const activeMin = Math.round(list.reduce((n, r) => n + r.activeSeconds, 0) / 6) / 10
            const vids = videoMods.map(m => { const p = pOf.get(m.id); return p?.videoDuration ? Math.min(100, (p.watchedSeconds / p.videoDuration) * 100) : 0 })
            const videoPct = vids.length ? Math.round(vids.reduce((a, b) => a + b, 0) / vids.length) : null
            const skips = list.reduce((n, r) => n + r.forwardSkips, 0)
            const pages = pdfMods.reduce((acc, m) => { const p = pOf.get(m.id); const seen = Array.isArray(p?.pagesSeen) ? (p!.pagesSeen as number[]).length : 0; return { seen: acc.seen + seen, total: acc.total + (p?.docPages ?? 0) } }, { seen: 0, total: 0 })
            const flags: string[] = []
            const done = e.status === "COMPLETED"
            if (list.length === 0 && (done || e.progress > 0)) flags.push("No tracking data (before tracking started)")
            else {
                if (done && plannedMin > 0 && activeMin < plannedMin * 0.3) flags.push(`Rushed: ${activeMin} of ${plannedMin} planned min`)
                if (done && videoPct !== null && videoPct < 50) flags.push(`Watched only ${videoPct}% of video`)
                if (skips >= 5) flags.push(`${skips} forward skips`)
            }
            return {
                id: e.id, name: `${e.employee.firstName} ${e.employee.lastName ?? ""}`.trim(), code: e.employee.employeeId,
                status: e.status, progress: e.progress, score: e.score, attempts: e.attempts, completedAt: e.completedAt,
                activeMin, plannedMin, videoPct, skips, pagesSeen: pages.seen, pagesTotal: pages.total, flags,
            }
        })
        return NextResponse.json({ course: course.title, plannedMin, hasVideo: videoMods.length > 0, hasPdf: pdfMods.length > 0, rows: out })
    } catch (e: any) {
        if (e?.code === "P2021") return NextResponse.json({ error: "Tracking isn't set up in the database yet." }, { status: 503 })
        console.error("[LMS_ENGAGEMENT]", e)
        return NextResponse.json({ error: "Could not load" }, { status: 500 })
    }
}
