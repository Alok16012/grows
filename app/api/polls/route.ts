import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { resolveUserId } from "@/lib/resolveUserId"
import { audienceWhere } from "@/lib/audience"
import {
    isEngagementManager, canDo, forbidden, parsePollInput, pollOptions, canSeePollResults, isOpen, effectiveStatus,
    namesFor, errorResponse,
} from "@/lib/engagement"

// GET — polls targeted at the viewer (polls.view sees all), newest first, with
// the viewer's own vote and, where allowed, the counts per option.
export async function GET(req: Request) {
    const session = await getApiSession(req)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    try {
        const manager = isEngagementManager(session, "polls")
        const [aud, uid] = await Promise.all([manager ? null : audienceWhere(session), resolveUserId(session)])
        const polls = await prisma.poll.findMany({
            where: aud ?? {},
            orderBy: { createdAt: "desc" },
            take: 200,
            include: { votes: { select: { userId: true, optionIds: true } } },
        })
        const voterNames = manager
            ? await namesFor(polls.filter(p => !p.anonymous).flatMap(p => p.votes.map(v => v.userId)))
            : new Map<string, string>()

        return NextResponse.json(polls.map(p => {
            const options = pollOptions(p.options)
            const mine = p.votes.find(v => v.userId === uid)?.optionIds ?? null
            const showResults = canSeePollResults(p, manager, !!mine)
            const counts = new Map<string, number>()
            for (const v of p.votes) for (const o of v.optionIds) counts.set(o, (counts.get(o) ?? 0) + 1)
            return {
                id: p.id, question: p.question, description: p.description,
                canEdit: canDo(session, "polls", "edit"), canDelete: canDo(session, "polls", "delete"),
                allowMultiple: p.allowMultiple, anonymous: p.anonymous, resultsVisibility: p.resultsVisibility,
                status: effectiveStatus(p), open: isOpen(p), closesAt: p.closesAt, createdAt: p.createdAt,
                targetSiteIds: p.targetSiteIds, targetRoleIds: p.targetRoleIds,
                myVote: mine,
                showResults,
                totalVoters: showResults ? p.votes.length : null,
                options: options.map(o => ({
                    id: o.id, label: o.label,
                    votes: showResults ? counts.get(o.id) ?? 0 : null,
                    voters: manager && !p.anonymous
                        ? p.votes.filter(v => v.optionIds.includes(o.id)).map(v => voterNames.get(v.userId) ?? "Unknown")
                        : undefined,
                })),
            }
        }))
    } catch (e) {
        return errorResponse(e, "[POLLS_GET]")
    }
}

// POST — create a poll (polls.create). Polls open as soon as they're created.
export async function POST(req: Request) {
    const session = await getApiSession(req)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!canDo(session, "polls", "create")) return forbidden("create polls")
    try {
        const input = parsePollInput(await req.json().catch(() => null))
        const createdBy = await resolveUserId(session)
        const poll = await prisma.poll.create({ data: { ...input, options: input.options, createdBy } })
        return NextResponse.json({ id: poll.id }, { status: 201 })
    } catch (e) {
        return errorResponse(e, "[POLLS_POST]")
    }
}
