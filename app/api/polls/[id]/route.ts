import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { isEngagementManager, errorResponse, InputError } from "@/lib/engagement"

type Ctx = { params: { id: string } }

// PATCH — close or reopen a poll ({ status: "CLOSED" | "ACTIVE" }).
export async function PATCH(req: Request, { params }: Ctx) {
    const session = await getApiSession(req)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isEngagementManager(session)) return NextResponse.json({ error: "You cannot change polls." }, { status: 403 })
    try {
        const body = await req.json().catch(() => ({}))
        if (body?.status !== "CLOSED" && body?.status !== "ACTIVE") throw new InputError("Status must be ACTIVE or CLOSED.")
        const poll = await prisma.poll.findUnique({ where: { id: params.id }, select: { id: true, closesAt: true } })
        if (!poll) throw new InputError("Poll not found.", 404)
        // Reopening a poll whose deadline has passed would close again at once.
        const data: { status: string; closesAt?: null } = { status: body.status }
        if (body.status === "ACTIVE" && poll.closesAt && poll.closesAt <= new Date()) data.closesAt = null
        await prisma.poll.update({ where: { id: params.id }, data })
        return NextResponse.json({ ok: true })
    } catch (e) {
        return errorResponse(e, "[POLL_PATCH]")
    }
}

// DELETE — remove a poll and its votes.
export async function DELETE(req: Request, { params }: Ctx) {
    const session = await getApiSession(req)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isEngagementManager(session)) return NextResponse.json({ error: "You cannot delete polls." }, { status: 403 })
    try {
        await prisma.poll.delete({ where: { id: params.id } })
        return NextResponse.json({ ok: true })
    } catch (e: any) {
        if (e?.code === "P2025") return NextResponse.json({ error: "Poll not found." }, { status: 404 })
        return errorResponse(e, "[POLL_DELETE]")
    }
}
