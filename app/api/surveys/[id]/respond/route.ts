import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { resolveUserId } from "@/lib/resolveUserId"
import { audienceWhere } from "@/lib/audience"
import { surveyQuestions, cleanAnswers, isOpen, errorResponse, InputError } from "@/lib/engagement"

// POST — submit your answers ({ answers: { [questionId]: value } }). One
// response per person; it can't be changed after submitting.
export async function POST(req: Request, { params }: { params: { id: string } }) {
    const session = await getApiSession(req)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    try {
        const uid = await resolveUserId(session)
        if (!uid) throw new InputError("Your account could not be found. Sign in again.", 401)
        const aud = await audienceWhere(session)
        const survey = await prisma.survey.findFirst({ where: { id: params.id, ...(aud ?? {}) } })
        if (!survey || survey.status === "DRAFT") throw new InputError("Survey not found.", 404)
        if (!isOpen(survey)) throw new InputError("This survey is closed.", 409)

        const body = await req.json().catch(() => ({}))
        const answers = cleanAnswers(surveyQuestions(survey.questions), body?.answers)
        try {
            await prisma.surveyResponse.create({ data: { surveyId: survey.id, userId: uid, answers } })
        } catch (e: any) {
            if (e?.code === "P2002") throw new InputError("You have already answered this survey.", 409)
            throw e
        }
        return NextResponse.json({ ok: true }, { status: 201 })
    } catch (e) {
        return errorResponse(e, "[SURVEY_RESPOND]")
    }
}
