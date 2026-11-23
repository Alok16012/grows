import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, has, auditLater, requestMeta } from "@/lib/access"
import { getExitSettings, saveExitSettings, backfillExits, approveFnf, approvalOf, syncClearance, issueExitLetters } from "@/lib/exit-flow"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET — exit settings, HR document types for the letters, and (with ?exitId=) that exit's F&F approval.
export async function GET(req: Request) {
    const g = await guard(req, ["exit.view", "exit.create", "exit.edit", "exit.approve", "exit.settleFnF"])
    if (g instanceof NextResponse) return g
    const exitId = new URL(req.url).searchParams.get("exitId")
    if (exitId) {
        const [approval, letters] = await Promise.all([
            approvalOf(exitId),
            prisma.exitRequest.findUnique({ where: { id: exitId }, select: { employeeId: true } }).then(e => e ? prisma.hrDocument.findMany({ where: { employeeId: e.employeeId, remarks: { startsWith: "Exit" } }, select: { docNumber: true, status: true, type: { select: { name: true } } } }) : []),
        ])
        return NextResponse.json({ approval, letters, me: g.access.userId })
    }
    const [settings, types] = await Promise.all([getExitSettings(), prisma.hrDocumentType.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })])
    return NextResponse.json({ settings, types, canEdit: g.access.isAdmin || has(g.access, "exit.edit") })
}

// PUT — settings.
export async function PUT(req: Request) {
    const g = await guard(req, "exit.edit")
    if (g instanceof NextResponse) return g
    const s = await saveExitSettings(await req.json().catch(() => ({})), g.access.userId)
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "exit.settings", targetType: "Setting", targetId: "exitSettings", targetName: "Exit settings", summary: `Must use exit: ${s.mustUseExit}; ${s.clearance.length} clearance item(s); F&F approval: ${s.fnfApproval}`, after: s, ...requestMeta(req) })
    return NextResponse.json({ settings: s })
}

// POST { action: "backfill", days, apply } | { action: "approveFnf", exitId } | { action: "sync", exitId } | { action: "letters", exitId }
export async function POST(req: Request) {
    const g = await guard(req, ["exit.edit", "exit.approve"])
    if (g instanceof NextResponse) return g
    const b = await req.json().catch(() => ({}))
    // Approving the F&F: exit.approve or exit.manage; everything else: exit.manage.
    if (b?.action !== "approveFnf" && !(g.access.isAdmin || has(g.access, "exit.edit"))) return NextResponse.json({ error: "Needs Exit → Edit" }, { status: 403 })
    const actor = { id: g.access.userId, name: g.access.name }
    try {
        if (b?.action === "backfill") return NextResponse.json(await backfillExits(Number(b.days) || 90, b.apply === true, actor))
        if (b?.action === "approveFnf" && typeof b.exitId === "string") {
            const a = await approveFnf(b.exitId, { ...actor, isAdmin: g.access.isAdmin })
            auditLater({ actorId: actor.id, actorName: actor.name, action: "exit.fnf_approved", targetType: "ExitRequest", targetId: b.exitId, targetName: `₹${a.approvedNet}`, summary: `F&F approved: ₹${a.approvedNet}`, ...requestMeta(req) })
            return NextResponse.json({ approval: a })
        }
        if (b?.action === "sync" && typeof b.exitId === "string") return NextResponse.json(await syncClearance(b.exitId))
        if (b?.action === "letters" && typeof b.exitId === "string") return NextResponse.json({ issued: await issueExitLetters(b.exitId, actor) })
    } catch (e: any) { return NextResponse.json({ error: e?.message || "Could not do that" }, { status: 400 }) }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
