import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { resolveUserId } from "@/lib/resolveUserId"
import { audienceWhere } from "@/lib/audience"
import {
    isEngagementManager, parseSurveyInput, surveyQuestions, isOpen, effectiveStatus, namesFor,
    errorResponse, InputError, type SurveyQuestion,
} from "@/lib/engagement"

type Ctx = { params: { id: string } }

/** Per-question summary of every response. */
function summarise(questions: SurveyQuestion[], answers: Record<string, unknown>[]) {
    return questions.map(q => {
        const given = answers.map(a => a[q.id]).filter(v => v !== undefined && v !== null && v !== "")
        const base = { questionId: q.id, answered: given.length }
        if (q.type === "single" || q.type === "multi" || q.type === "yesno") {
            const choices = q.type === "yesno" ? ["Yes", "No"] : q.options ?? []
            const counts = Object.fromEntries(choices.map(c => [c, 0])) as Record<string, number>
            for (const v of given) for (const c of Array.isArray(v) ? v : [v]) if (typeof c === "string" && c in counts) counts[c]++
            return { ...base, counts }
        }
        if (q.type === "rating") {
            const nums = given.map(Number).filter(n => n >= 1 && n <= 5)
            const counts: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 }
            nums.forEach(n => { counts[String(n)]++ })
            return { ...base, counts, average: nums.length ? Math.round(nums.reduce((s, n) => s + n, 0) / nums.length * 10) / 10 : null }
        }
        return { ...base, texts: given.map(String) }
    })
}

// GET — the survey with its questions. Managers also get the results and,
// unless the survey is anonymous, who answered what.
export async function GET(req: Request, { params }: Ctx) {
    const session = await getApiSession(req)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    try {
        const manager = isEngagementManager(session)
        const [aud, uid] = await Promise.all([audienceWhere(session), resolveUserId(session)])
        const survey = await prisma.survey.findFirst({
            where: manager ? { id: params.id } : { id: params.id, ...(aud ?? {}), status: { in: ["ACTIVE", "CLOSED"] } },
            include: manager ? { responses: { orderBy: { submittedAt: "asc" } } } : undefined,
        }) as any
        if (!survey) throw new InputError("Survey not found.", 404)
        const questions = surveyQuestions(survey.questions)
        const mine = uid ? await prisma.surveyResponse.findUnique({ where: { surveyId_userId: { surveyId: survey.id, userId: uid } } }) : null

        const out: Record<string, unknown> = {
            id: survey.id, title: survey.title, description: survey.description, questions,
            anonymous: survey.anonymous, status: effectiveStatus(survey), rawStatus: survey.status, open: isOpen(survey),
            closesAt: survey.closesAt, createdAt: survey.createdAt,
            targetSiteIds: survey.targetSiteIds, targetRoleIds: survey.targetRoleIds,
            myAnswers: mine?.answers ?? null, respondedAt: mine?.submittedAt ?? null,
        }
        if (manager) {
            const responses = survey.responses as { userId: string; answers: Record<string, unknown>; submittedAt: Date }[]
            const names = survey.anonymous ? new Map<string, string>() : await namesFor(responses.map(r => r.userId))
            out.responseCount = responses.length
            out.summary = summarise(questions, responses.map(r => r.answers ?? {}))
            out.responses = responses.map((r, i) => ({
                respondent: survey.anonymous ? `Response ${i + 1}` : names.get(r.userId) ?? "Unknown",
                submittedAt: r.submittedAt,
                answers: r.answers,
            }))
        }
        return NextResponse.json(out)
    } catch (e) {
        return errorResponse(e, "[SURVEY_GET]")
    }
}

// PATCH — either { status } to publish / close / reopen, or a full edit
// (title, questions…). Questions can't change once anyone has answered.
export async function PATCH(req: Request, { params }: Ctx) {
    const session = await getApiSession(req)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isEngagementManager(session)) return NextResponse.json({ error: "You cannot change surveys." }, { status: 403 })
    try {
        const body = await req.json().catch(() => ({}))
        const survey = await prisma.survey.findUnique({ where: { id: params.id }, include: { _count: { select: { responses: true } } } })
        if (!survey) throw new InputError("Survey not found.", 404)

        if (body && Object.keys(body).length === 1 && "status" in body) {
            const status = body.status
            if (!["DRAFT", "ACTIVE", "CLOSED"].includes(status)) throw new InputError("Unknown status.")
            if (status === "DRAFT" && survey._count.responses > 0) throw new InputError("A survey with responses can't go back to draft. Close it instead.", 409)
            const data: { status: string; closesAt?: null } = { status }
            if (status === "ACTIVE" && survey.closesAt && survey.closesAt <= new Date()) data.closesAt = null
            await prisma.survey.update({ where: { id: survey.id }, data })
            return NextResponse.json({ ok: true })
        }

        const input = parseSurveyInput({ ...body, status: body?.status ?? survey.status })
        if (survey._count.responses > 0 && JSON.stringify(input.questions) !== JSON.stringify(surveyQuestions(survey.questions))) {
            throw new InputError("People have already answered, so the questions can't change. Create a new survey instead.", 409)
        }
        await prisma.survey.update({ where: { id: survey.id }, data: { ...input, questions: input.questions } })
        return NextResponse.json({ ok: true })
    } catch (e) {
        return errorResponse(e, "[SURVEY_PATCH]")
    }
}

// DELETE — remove a survey and its responses.
export async function DELETE(req: Request, { params }: Ctx) {
    const session = await getApiSession(req)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isEngagementManager(session)) return NextResponse.json({ error: "You cannot delete surveys." }, { status: 403 })
    try {
        await prisma.survey.delete({ where: { id: params.id } })
        return NextResponse.json({ ok: true })
    } catch (e: any) {
        if (e?.code === "P2025") return NextResponse.json({ error: "Survey not found." }, { status: 404 })
        return errorResponse(e, "[SURVEY_DELETE]")
    }
}
