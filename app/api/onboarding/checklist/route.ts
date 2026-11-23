import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, employeeScope, auditLater, requestMeta } from "@/lib/access"
import { evaluateChecklists, pipelineBoard, setTaskDone, saveChecklistSettings, getChecklistSettings } from "@/lib/onboarding-checklist-server"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const VIEW = ["onboarding.view", "recruitment.view"]
const TICK = ["onboarding.view", "onboarding.edit", "onboarding.approve"]

async function scopeIds(access: any): Promise<string[] | null> {
    const scope = await employeeScope(access)
    return scope ? (await prisma.employee.findMany({ where: scope, select: { id: true } })).map(e => e.id) : null
}

// GET ?employeeId= — one person's checklist. No id — the pipeline board.
export async function GET(req: Request) {
    const g = await guard(req, VIEW)
    if (g instanceof NextResponse) return g
    const sp = new URL(req.url).searchParams
    const employeeId = sp.get("employeeId")
    const canManage = g.access.isAdmin || g.access.permissions.includes("onboarding.edit")
    const sites = await prisma.site.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    if (employeeId) {
        const ids = await scopeIds(g.access)
        if (ids && !ids.includes(employeeId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
        const [c] = Array.from((await evaluateChecklists([employeeId])).values())
        const e = await prisma.employee.findUnique({ where: { id: employeeId }, select: { employeeId: true, firstName: true, lastName: true, designation: true, dateOfJoining: true } })
        return NextResponse.json({ checklist: c ?? null, employee: e, canTick: g.access.isAdmin || TICK.some(p => g.access.permissions.includes(p)) })
    }
    const board = await pipelineBoard(await scopeIds(g.access))
    return NextResponse.json({ ...board, canManage, sites })
}

// POST { employeeId, taskId, done, note? } — tick a task by hand.
export async function POST(req: Request) {
    const g = await guard(req, TICK)
    if (g instanceof NextResponse) return g
    const b = await req.json().catch(() => ({}))
    if (typeof b?.employeeId !== "string" || typeof b?.taskId !== "string") return NextResponse.json({ error: "Pick the task" }, { status: 400 })
    const ids = await scopeIds(g.access)
    if (ids && !ids.includes(b.employeeId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
    try { await setTaskDone(b.employeeId, b.taskId, b.done !== false, g.access.userId, b.note ? String(b.note).slice(0, 200) : null) }
    catch (e: any) { return NextResponse.json({ error: e?.message || "Could not save" }, { status: 400 }) }
    const s = await getChecklistSettings()
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "onboarding.task", targetType: "Employee", targetId: b.employeeId, targetName: s.tasks.find(t => t.id === b.taskId)?.title ?? b.taskId, summary: `${b.done !== false ? "Ticked" : "Unticked"}: ${s.tasks.find(t => t.id === b.taskId)?.title ?? b.taskId}${b.note ? ` — ${b.note}` : ""}`, ...requestMeta(req) })
    return NextResponse.json({ ok: true })
}

// PUT — the checklist template and approval rules.
export async function PUT(req: Request) {
    const g = await guard(req, "onboarding.edit")
    if (g instanceof NextResponse) return g
    const s = await saveChecklistSettings(await req.json().catch(() => ({})), g.access.userId)
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "onboarding.checklist_settings", targetType: "Setting", targetId: "onboardingChecklist", targetName: "Joining checklist", summary: `${s.tasks.length} task(s), ${s.tasks.filter(t => t.beforeApproval).length} before approval; override: ${s.override}`, after: s, ...requestMeta(req) })
    return NextResponse.json({ settings: s })
}
