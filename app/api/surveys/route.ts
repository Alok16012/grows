import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { resolveUserId } from "@/lib/resolveUserId"
import { audienceWhere } from "@/lib/audience"
import { isEngagementManager, canDo, forbidden, parseSurveyInput, surveyQuestions, isOpen, effectiveStatus, errorResponse } from "@/lib/engagement"

// GET — surveys for the viewer. surveys.view sees every survey (drafts included)
// with response counts; everyone else sees published surveys targeted at them.
export async function GET(req: Request) {
    const session = await getApiSession(req)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    try {
        const manager = isEngagementManager(session, "surveys")
        const [aud, uid] = await Promise.all([manager ? null : audienceWhere(session), resolveUserId(session)])
        const surveys = await prisma.survey.findMany({
            where: manager ? {} : { ...(aud ?? {}), status: { in: ["ACTIVE", "CLOSED"] } },
            orderBy: { createdAt: "desc" },
            take: 200,
            include: {
                _count: { select: { responses: true } },
                responses: { where: { userId: uid ?? "__none__" }, select: { submittedAt: true } },
            },
        })
        return NextResponse.json(surveys.map(s => ({
            id: s.id, title: s.title, description: s.description,
            anonymous: s.anonymous, status: effectiveStatus(s), open: isOpen(s),
            closesAt: s.closesAt, createdAt: s.createdAt,
            targetSiteIds: s.targetSiteIds, targetRoleIds: s.targetRoleIds,
            questionCount: surveyQuestions(s.questions).length,
            respondedAt: s.responses[0]?.submittedAt ?? null,
            responseCount: manager ? s._count.responses : null,
        })))
    } catch (e) {
        return errorResponse(e, "[SURVEYS_GET]")
    }
}

// POST — create a survey (surveys.create), as a draft or published.
export async function POST(req: Request) {
    const session = await getApiSession(req)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!canDo(session, "surveys", "create")) return forbidden("create surveys")
    try {
        const input = parseSurveyInput(await req.json().catch(() => null))
        const createdBy = await resolveUserId(session)
        const survey = await prisma.survey.create({ data: { ...input, questions: input.questions, createdBy } })
        return NextResponse.json({ id: survey.id }, { status: 201 })
    } catch (e) {
        return errorResponse(e, "[SURVEYS_POST]")
    }
}
