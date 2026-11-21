import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { canIssueAssets, canOverseeAssets } from "@/lib/permissions"
import { jsonError, workflowErrorResponse } from "@/lib/asset-workflow"
import { startVerification } from "@/lib/asset-verification"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET — verifications with how far counting has got. POST { name, siteId?, siteName?, note? } — start one.
export async function GET(req: Request) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        if (!canOverseeAssets(session) && !canIssueAssets(session)) return jsonError(403, "Forbidden")
        const list = await prisma.assetVerification.findMany({ orderBy: { startedAt: "desc" }, take: 100 })
        const lines = await prisma.assetVerificationLine.findMany({ where: { verificationId: { in: list.map(v => v.id) } }, select: { verificationId: true, expectedQty: true, countedQty: true } })
        const stat = new Map<string, { lines: number; counted: number; differences: number }>()
        for (const l of lines) {
            const s = stat.get(l.verificationId) ?? { lines: 0, counted: 0, differences: 0 }
            s.lines++; if (l.countedQty != null) { s.counted++; if (l.countedQty !== l.expectedQty) s.differences++ }
            stat.set(l.verificationId, s)
        }
        return NextResponse.json({ verifications: list.map(v => ({ ...v, ...(stat.get(v.id) ?? { lines: 0, counted: 0, differences: 0 }) })) })
    } catch (e) { return workflowErrorResponse(e, "[ASSET_VER_GET]") }
}

export async function POST(req: Request) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        if (!canIssueAssets(session)) return jsonError(403, "Forbidden")
        const b = await req.json().catch(() => ({}))
        const name = typeof b?.name === "string" ? b.name.trim().slice(0, 80) : ""
        if (!name) return jsonError(400, "Give the verification a name, e.g. \"Nov 2026 store count\"")
        const v = await startVerification({ name, siteId: b?.siteId || null, siteName: b?.siteName || null, note: b?.note ? String(b.note).slice(0, 300) : null, actorId: session.user.id })
        return NextResponse.json(v, { status: 201 })
    } catch (e) { return workflowErrorResponse(e, "[ASSET_VER_POST]") }
}
