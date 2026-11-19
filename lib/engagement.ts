// Shared rules for Announcements → Polls and Surveys.
//
// Who does what:
//   • announcements.manage (and Admin) create, close and delete polls/surveys,
//     and see every result.
//   • Everyone else answers what is targeted at them (same site / role
//     targeting as notices, see lib/audience) and sees poll results only as
//     the poll's resultsVisibility allows. Survey results are managers-only.
//   • "Anonymous" hides who voted / answered from managers too; the user id is
//     still stored, only so a person can't vote twice.

import { NextResponse } from "next/server"
import type { Session } from "next-auth"
import { randomUUID } from "crypto"
import prisma from "@/lib/prisma"
import { checkAccess } from "@/lib/permissions"
import { cleanIdArray } from "@/lib/audience"

export const MANAGE_PERMISSION = "announcements.manage"

export function isEngagementManager(session: Session | null): boolean {
    return checkAccess(session as any, ["MANAGER", "HR_MANAGER"], MANAGE_PERMISSION)
}

/** The tables don't exist yet (scripts/polls-surveys.sql not run). */
export function tablesMissing(e: any): boolean {
    const msg = String(e?.message || "")
    return e?.code === "P2021" || e?.code === "P2022" || /relation .* does not exist|table .* does not exist/i.test(msg)
}

export const notSetUp = () => NextResponse.json(
    { error: "Polls and surveys are not set up yet. Run scripts/polls-surveys.sql on the database." },
    { status: 503 },
)

export class InputError extends Error {
    constructor(message: string, public status = 400) { super(message) }
}

export function errorResponse(e: unknown, tag: string) {
    if (e instanceof InputError) return NextResponse.json({ error: e.message }, { status: e.status })
    if (tablesMissing(e)) return notSetUp()
    console.error(tag, e)
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
}

/** Open = accepting answers right now. */
export function isOpen(row: { status: string; closesAt: Date | null }, now = new Date()): boolean {
    return row.status === "ACTIVE" && (!row.closesAt || row.closesAt > now)
}

/** A row's effective status for display: a passed deadline reads as CLOSED. */
export function effectiveStatus(row: { status: string; closesAt: Date | null }, now = new Date()): string {
    if (row.status === "ACTIVE" && row.closesAt && row.closesAt <= now) return "CLOSED"
    return row.status
}

function text(v: unknown, field: string, max: number, required = true): string {
    const s = typeof v === "string" ? v.trim() : ""
    if (!s && required) throw new InputError(`${field} is required.`)
    if (s.length > max) throw new InputError(`${field} must be ${max} characters or fewer.`)
    return s
}

function closesAtOf(v: unknown): Date | null {
    if (v === null || v === undefined || v === "") return null
    const d = new Date(String(v))
    if (Number.isNaN(d.getTime())) throw new InputError("Closing date is not a valid date.")
    if (d <= new Date()) throw new InputError("Closing date must be in the future.")
    return d
}

// ─── Polls ───────────────────────────────────────────────────────────────────

export type PollOption = { id: string; label: string }
export const RESULTS_VISIBILITY = ["AFTER_VOTE", "AFTER_CLOSE", "MANAGERS"] as const

export function parsePollInput(body: any) {
    const question = text(body?.question, "Question", 300)
    const description = text(body?.description, "Description", 1000, false) || null
    const raw: unknown[] = Array.isArray(body?.options) ? body.options : []
    const labels = raw.map(o => (typeof o === "string" ? o : (o as any)?.label)).map(s => (typeof s === "string" ? s.trim() : "")).filter(Boolean)
    if (labels.length < 2) throw new InputError("Add at least two options.")
    if (labels.length > 10) throw new InputError("A poll can have at most 10 options.")
    if (labels.some(l => l.length > 120)) throw new InputError("Each option must be 120 characters or fewer.")
    if (new Set(labels.map(l => l.toLowerCase())).size !== labels.length) throw new InputError("Options must be different from each other.")
    const resultsVisibility = RESULTS_VISIBILITY.includes(body?.resultsVisibility) ? body.resultsVisibility : "AFTER_VOTE"
    return {
        question, description,
        options: labels.map(label => ({ id: randomUUID().slice(0, 8), label })) as PollOption[],
        allowMultiple: !!body?.allowMultiple,
        anonymous: !!body?.anonymous,
        resultsVisibility,
        closesAt: closesAtOf(body?.closesAt),
        targetSiteIds: cleanIdArray(body?.targetSiteIds),
        targetRoleIds: cleanIdArray(body?.targetRoleIds),
    }
}

export function pollOptions(json: unknown): PollOption[] {
    return Array.isArray(json) ? (json as any[]).filter(o => o && typeof o.id === "string" && typeof o.label === "string") : []
}

/** Results visible to this viewer? */
export function canSeePollResults(
    poll: { resultsVisibility: string; status: string; closesAt: Date | null },
    manager: boolean, hasVoted: boolean,
): boolean {
    if (manager) return true
    if (poll.resultsVisibility === "MANAGERS") return false
    if (poll.resultsVisibility === "AFTER_CLOSE") return !isOpen(poll)
    return hasVoted || !isOpen(poll)
}

// ─── Surveys ─────────────────────────────────────────────────────────────────

export const QUESTION_TYPES = ["single", "multi", "rating", "yesno", "text"] as const
export type QuestionType = typeof QUESTION_TYPES[number]
export type SurveyQuestion = { id: string; type: QuestionType; label: string; required: boolean; options?: string[] }

export function parseSurveyInput(body: any) {
    const title = text(body?.title, "Title", 200)
    const description = text(body?.description, "Description", 2000, false) || null
    const raw: any[] = Array.isArray(body?.questions) ? body.questions : []
    if (!raw.length) throw new InputError("Add at least one question.")
    if (raw.length > 30) throw new InputError("A survey can have at most 30 questions.")
    const questions: SurveyQuestion[] = raw.map((q, i) => {
        const type = QUESTION_TYPES.includes(q?.type) ? q.type as QuestionType : null
        if (!type) throw new InputError(`Question ${i + 1}: pick a question type.`)
        const label = text(q?.label, `Question ${i + 1}`, 300)
        const out: SurveyQuestion = { id: typeof q?.id === "string" && q.id ? q.id.slice(0, 40) : randomUUID().slice(0, 8), type, label, required: q?.required !== false }
        if (type === "single" || type === "multi") {
            const opts = (Array.isArray(q?.options) ? q.options : []).map((o: unknown) => (typeof o === "string" ? o.trim() : "")).filter(Boolean)
            if (opts.length < 2) throw new InputError(`Question ${i + 1}: add at least two choices.`)
            if (opts.length > 15) throw new InputError(`Question ${i + 1}: at most 15 choices.`)
            if (new Set(opts.map((o: string) => o.toLowerCase())).size !== opts.length) throw new InputError(`Question ${i + 1}: choices must be different.`)
            out.options = opts
        }
        return out
    })
    if (new Set(questions.map(q => q.id)).size !== questions.length) throw new InputError("Two questions share the same id.")
    const status = body?.status === "ACTIVE" ? "ACTIVE" : "DRAFT"
    return {
        title, description, questions,
        anonymous: !!body?.anonymous,
        status,
        closesAt: closesAtOf(body?.closesAt),
        targetSiteIds: cleanIdArray(body?.targetSiteIds),
        targetRoleIds: cleanIdArray(body?.targetRoleIds),
    }
}

export function surveyQuestions(json: unknown): SurveyQuestion[] {
    return Array.isArray(json) ? (json as any[]).filter(q => q && typeof q.id === "string" && QUESTION_TYPES.includes(q.type)) : []
}

/** Validate one person's answers against the questions; returns the cleaned answers. */
export function cleanAnswers(questions: SurveyQuestion[], raw: any): Record<string, string | string[] | number> {
    const input = raw && typeof raw === "object" ? raw : {}
    const out: Record<string, string | string[] | number> = {}
    questions.forEach((q, i) => {
        const v = input[q.id]
        const n = `Question ${i + 1}`
        const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)
        if (empty) {
            if (q.required) throw new InputError(`${n} needs an answer.`)
            return
        }
        switch (q.type) {
            case "single":
                if (typeof v !== "string" || !q.options?.includes(v)) throw new InputError(`${n}: pick one of the choices.`)
                out[q.id] = v; break
            case "multi": {
                const arr = Array.isArray(v) ? Array.from(new Set(v.filter((x: unknown) => typeof x === "string"))) as string[] : []
                if (!arr.length || arr.some(x => !q.options?.includes(x))) throw new InputError(`${n}: pick from the choices.`)
                out[q.id] = arr; break
            }
            case "rating": {
                const r = Number(v)
                if (!Number.isInteger(r) || r < 1 || r > 5) throw new InputError(`${n}: give a rating from 1 to 5.`)
                out[q.id] = r; break
            }
            case "yesno":
                if (v !== "Yes" && v !== "No") throw new InputError(`${n}: answer Yes or No.`)
                out[q.id] = v; break
            case "text": {
                const s = String(v).trim()
                if (s.length > 2000) throw new InputError(`${n}: keep it under 2000 characters.`)
                if (!s && q.required) throw new InputError(`${n} needs an answer.`)
                if (s) out[q.id] = s
                break
            }
        }
    })
    return out
}

/** Display names for user ids (employee name when linked). */
export async function namesFor(userIds: string[]): Promise<Map<string, string>> {
    const ids = Array.from(new Set(userIds)).filter(Boolean)
    if (!ids.length) return new Map()
    const users = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, employeeProfile: { select: { firstName: true, lastName: true, employeeId: true } } },
    })
    return new Map(users.map(u => {
        const e = u.employeeProfile
        const name = e ? `${e.firstName} ${e.lastName ?? ""}`.trim() + (e.employeeId ? ` (${e.employeeId})` : "") : u.name
        return [u.id, name]
    }))
}
