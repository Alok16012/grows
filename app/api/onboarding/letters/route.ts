import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { letterTracker, saveLetterSettings, issueMany, setSkipped, runDueLetters } from "@/lib/letter-schedule-server"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const VIEW = ["onboarding.view", "documents.send", "documents.view"]
const EDIT = "documents.send"

// GET — joining-letter rules and, per employee, whether each letter went out.
export async function GET(req: Request) {
    const g = await guard(req, VIEW)
    if (g instanceof NextResponse) return g
    const t = await letterTracker(g.access)
    const signers = await prisma.user.findMany({ where: { isActive: true, OR: [{ role: "ADMIN" }, { customRole: { permissions: { has: EDIT } } }] }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 })
    const sites = await prisma.site.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    return NextResponse.json({
        canEdit: g.access.isAdmin || g.access.permissions.includes(EDIT),
        settings: t.settings,
        types: t.types.map(x => ({ id: x.id, name: x.name, requiresApproval: x.requiresApproval, isActive: x.isActive, hasTemplate: !!x.templateContent?.trim() })),
        signers, sites, rows: t.rows,
    })
}

// PUT — save the rules.
export async function PUT(req: Request) {
    const g = await guard(req, EDIT)
    if (g instanceof NextResponse) return g
    const s = await saveLetterSettings(await req.json().catch(() => ({})), g.access.userId)
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "letters.settings", targetType: "Setting", targetId: "letterSchedule", targetName: "Joining letter schedule", summary: `${s.rules.length} rule(s), ${s.rules.filter(r => r.enabled).length} on`, after: s, ...requestMeta(req) })
    return NextResponse.json({ settings: s })
}

// POST { action: "issue", items: [{ employeeId, ruleId }] }
//      { action: "skip" | "unskip", items: [{ employeeId, typeId }], reason }
//      { action: "runNow" } — what the daily job does, now.
export async function POST(req: Request) {
    const g = await guard(req, EDIT)
    if (g instanceof NextResponse) return g
    const b = await req.json().catch(() => ({}))
    const actor = { id: g.access.userId, name: g.access.name }
    const items = Array.isArray(b?.items) ? b.items.slice(0, 1000) : []
    if (b?.action === "runNow") {
        const r = await runDueLetters()
        return NextResponse.json(r)
    }
    if (b?.action === "issue") {
        const list = items.filter((x: any) => typeof x?.employeeId === "string" && typeof x?.ruleId === "string")
        if (!list.length) return NextResponse.json({ error: "Pick the letters to send" }, { status: 400 })
        const r = await issueMany(list, actor)
        auditLater({ actorId: actor.id, actorName: actor.name, action: "letters.issue", targetType: "HrDocument", targetName: `${list.length} letter(s)`, summary: `Joining letters: ${r.issued} issued, ${r.waiting} waiting for approval, ${r.failed} failed`, ...requestMeta(req) })
        return NextResponse.json(r)
    }
    if (b?.action === "skip" || b?.action === "unskip") {
        const list = items.filter((x: any) => typeof x?.employeeId === "string" && typeof x?.typeId === "string")
        if (!list.length) return NextResponse.json({ error: "Pick the letters" }, { status: 400 })
        const reason = b.action === "skip" ? String(b?.reason ?? "").trim() : null
        if (b.action === "skip" && !reason) return NextResponse.json({ error: "Enter why these letters are not needed" }, { status: 400 })
        await setSkipped(list, reason, actor)
        auditLater({ actorId: actor.id, actorName: actor.name, action: b.action === "skip" ? "letters.skip" : "letters.unskip", targetType: "Employee", targetName: `${list.length} letter(s)`, summary: b.action === "skip" ? `Marked not needed: ${reason}` : "Marked as needed again", ...requestMeta(req) })
        return NextResponse.json({ ok: true, count: list.length })
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
