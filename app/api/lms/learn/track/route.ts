import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard } from "@/lib/access"
import { getLmsSettings } from "@/lib/lms-settings"
import { mergeRanges, rangesTotal, completionGaps, type Range } from "@/lib/lms-tracking"

export const dynamic = "force-dynamic"

async function mine(userId: string, enrollmentId: string) {
    const me = await prisma.employee.findUnique({ where: { userId }, select: { id: true } })
    if (!me) return null
    const e = await prisma.courseEnrollment.findUnique({
        where: { id: enrollmentId },
        select: { id: true, employeeId: true, status: true, course: { select: { modules: { select: { id: true, videoUrl: true, docUrl: true, duration: true } } } } },
    })
    return e && e.employeeId === me.id ? e : null
}

// GET ?enrollmentId= — this learner's tracked progress per module, the rules,
// and what still blocks "Mark done" on each module.
export async function GET(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    try {
        const id = new URL(req.url).searchParams.get("enrollmentId") ?? ""
        const e = await mine(g.access.userId, id)
        if (!e) return NextResponse.json({ error: "Not found" }, { status: 404 })
        const [rows, s] = await Promise.all([prisma.moduleProgress.findMany({ where: { enrollmentId: e.id } }), getLmsSettings()])
        const byMod = new Map(rows.map(r => [r.moduleId, r]))
        return NextResponse.json({
            rules: s.tracking,
            modules: Object.fromEntries(e.course.modules.map(m => {
                const p = byMod.get(m.id) ?? null
                return [m.id, { progress: p, gaps: completionGaps(m, p, s.tracking) }]
            })),
        })
    } catch (err: any) {
        if (err?.code === "P2021") return NextResponse.json({ rules: { enforce: false }, modules: {} })
        console.error("[LMS_TRACK_GET]", err)
        return NextResponse.json({ error: "Could not load" }, { status: 500 })
    }
}

// POST { enrollmentId, moduleId, active?, ranges?, duration?, skips?, pages?, docPages? }
// A heartbeat from the learner's page: active seconds since the last beat
// (capped), video parts watched, forward skips, PDF pages seen.
export async function POST(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    try {
        const b = await req.json().catch(() => ({}))
        const e = await mine(g.access.userId, String(b?.enrollmentId ?? ""))
        if (!e) return NextResponse.json({ error: "Not found" }, { status: 404 })
        const mod = e.course.modules.find(m => m.id === String(b?.moduleId ?? ""))
        if (!mod) return NextResponse.json({ error: "Module not in this course" }, { status: 400 })

        const cur = await prisma.moduleProgress.findUnique({ where: { enrollmentId_moduleId: { enrollmentId: e.id, moduleId: mod.id } } })
        // A beat never adds more than 90 s of activity, whatever the page claims.
        const active = Math.max(0, Math.min(90, Math.round(Number(b?.active) || 0)))
        const duration = Number(b?.duration) > 0 && Number(b?.duration) < 6 * 3600 ? Number(b.duration) : cur?.videoDuration ?? null
        const incoming: Range[] = (Array.isArray(b?.ranges) ? b.ranges : []).slice(0, 200)
            .map((r: unknown) => (Array.isArray(r) ? [Number(r[0]), Number(r[1])] : [NaN, NaN]) as Range)
            .filter(([a, z]: Range) => Number.isFinite(a) && Number.isFinite(z) && z > a && (!duration || z <= duration + 2))
        const ranges = mergeRanges([...((cur?.watchedRanges as Range[] | null) ?? []), ...incoming])
        const watched = Math.min(rangesTotal(ranges), duration ?? Infinity)
        const skips = Math.max(0, Math.min(50, Math.round(Number(b?.skips) || 0)))
        const docPages = Number(b?.docPages) > 0 && Number(b?.docPages) < 2000 ? Math.round(Number(b.docPages)) : cur?.docPages ?? null
        const seen = new Set<number>(Array.isArray(cur?.pagesSeen) ? (cur!.pagesSeen as number[]) : [])
        for (const pg of Array.isArray(b?.pages) ? b.pages.slice(0, 500) : []) { const n = Math.round(Number(pg)); if (n >= 1 && (!docPages || n <= docPages)) seen.add(n) }

        const data = {
            activeSeconds: (cur?.activeSeconds ?? 0) + active,
            videoDuration: duration, watchedSeconds: Math.round(watched * 10) / 10, watchedRanges: ranges,
            forwardSkips: (cur?.forwardSkips ?? 0) + skips,
            docPages, pagesSeen: Array.from(seen).sort((x, y) => x - y), lastSeenAt: new Date(),
        }
        const p = await prisma.moduleProgress.upsert({
            where: { enrollmentId_moduleId: { enrollmentId: e.id, moduleId: mod.id } },
            create: { enrollmentId: e.id, moduleId: mod.id, employeeId: e.employeeId, ...data },
            update: data,
        })
        const s = await getLmsSettings()
        return NextResponse.json({ progress: p, gaps: completionGaps(mod, p, s.tracking) })
    } catch (err: any) {
        if (err?.code === "P2021") return NextResponse.json({ progress: null, gaps: [] })
        console.error("[LMS_TRACK_POST]", err)
        return NextResponse.json({ error: "Could not save" }, { status: 500 })
    }
}
