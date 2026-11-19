import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { resolveUserId } from "@/lib/resolveUserId"
import { audienceWhere } from "@/lib/audience"
import { pollOptions, isOpen, errorResponse, InputError } from "@/lib/engagement"

// POST — cast or change your vote ({ optionIds: string[] }) while the poll is open.
export async function POST(req: Request, { params }: { params: { id: string } }) {
    const session = await getApiSession(req)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    try {
        const uid = await resolveUserId(session)
        if (!uid) throw new InputError("Your account could not be found. Sign in again.", 401)
        // Only polls targeted at this person can be voted on.
        const aud = await audienceWhere(session)
        const poll = await prisma.poll.findFirst({ where: { id: params.id, ...(aud ?? {}) } })
        if (!poll) throw new InputError("Poll not found.", 404)
        if (!isOpen(poll)) throw new InputError("This poll is closed.", 409)

        const body = await req.json().catch(() => ({}))
        const valid = new Set(pollOptions(poll.options).map(o => o.id))
        const raw: unknown[] = Array.isArray(body?.optionIds) ? body.optionIds : []
        const picked: string[] = Array.from(new Set(raw.filter((x): x is string => typeof x === "string")))
        if (!picked.length) throw new InputError("Pick an option.")
        if (picked.some(id => !valid.has(id))) throw new InputError("That option is not on this poll.")
        if (!poll.allowMultiple && picked.length > 1) throw new InputError("Pick only one option.")

        await prisma.pollVote.upsert({
            where: { pollId_userId: { pollId: poll.id, userId: uid } },
            create: { pollId: poll.id, userId: uid, optionIds: picked },
            update: { optionIds: picked },
        })
        return NextResponse.json({ ok: true })
    } catch (e) {
        return errorResponse(e, "[POLL_VOTE]")
    }
}
