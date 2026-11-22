import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { getExitSettings, selfResign } from "@/lib/exit-flow"

export const dynamic = "force-dynamic"

// GET — can I resign here, and my resignation if one is in progress.
export async function GET(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    const emp = await prisma.employee.findFirst({ where: { userId: g.access.userId }, select: { id: true, status: true, exitRequest: { select: { status: true, resignationDate: true, lastWorkingDate: true, exitType: true } } } })
    const s = await getExitSettings()
    return NextResponse.json({ enabled: s.selfResign && !!emp, defaultNoticeDays: s.defaultNoticeDays, exit: emp?.exitRequest ?? null })
}

// POST { lastWorkingDate?, reason? }
export async function POST(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    const b = await req.json().catch(() => ({}))
    try {
        const ex = await selfResign(g.access.userId, { lastWorkingDate: typeof b?.lastWorkingDate === "string" ? b.lastWorkingDate : null, reason: typeof b?.reason === "string" ? b.reason : null })
        auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "exit.self_resign", targetType: "ExitRequest", targetId: ex.id, targetName: g.access.name, summary: `Resignation handed in; last working day ${ex.lastWorkingDate?.toISOString().slice(0, 10)}`, ...requestMeta(req) })
        return NextResponse.json({ ok: true, lastWorkingDate: ex.lastWorkingDate })
    } catch (e: any) { return NextResponse.json({ error: e?.message || "Could not submit" }, { status: 400 }) }
}
