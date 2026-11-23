import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard } from "@/lib/access"
import { canUse, createDialRequest } from "@/lib/dialer-server"

export const dynamic = "force-dynamic"

// POST { phone, targetType?, targetId? } — "Call" clicked in the ERP: the user's paired phone dials it.
export async function POST(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    if (!canUse(g.access)) return NextResponse.json({ error: "Calling needs the Call Dialer → Create permission" }, { status: 403 })
    const b = await req.json().catch(() => ({}))
    try {
        const r = await createDialRequest(g.access, b)
        return NextResponse.json({ id: r.request.id, targetName: r.request.targetName, deviceName: r.deviceName, online: r.online })
    } catch (e: any) { return NextResponse.json({ error: e?.message || "Could not call", needsPairing: /paired/.test(e?.message ?? "") }, { status: 400 }) }
}

// GET ?id= — where a click-to-call request is (PENDING → DIALING → DONE), and the call once synced.
export async function GET(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    const id = new URL(req.url).searchParams.get("id") ?? ""
    const r = await prisma.dialRequest.findFirst({ where: { id, userId: g.access.userId } })
    if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const call = r.callLogId ? await prisma.callLog.findUnique({ where: { id: r.callLogId }, select: { id: true, connected: true, durationSec: true, outcome: true } }) : null
    return NextResponse.json({ status: r.status, call })
}

// DELETE ?id= — cancel a request that has not been dialled yet. Without id: cancel all of mine still waiting (auto-dial Stop).
export async function DELETE(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    const id = new URL(req.url).searchParams.get("id")
    await prisma.dialRequest.updateMany({ where: { ...(id ? { id } : {}), userId: g.access.userId, status: "PENDING" }, data: { status: "CANCELLED" } })
    return NextResponse.json({ ok: true })
}
