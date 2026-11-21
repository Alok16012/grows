import { NextResponse } from "next/server"
import { getApiSession } from "@/lib/apiSession"
import { canIssueAssets, canOverseeAssets } from "@/lib/permissions"
import { jsonError, workflowErrorResponse } from "@/lib/asset-workflow"
import { closeVerification, loadVerification, saveCounts } from "@/lib/asset-verification"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        if (!canOverseeAssets(session) && !canIssueAssets(session)) return jsonError(403, "Forbidden")
        return NextResponse.json(await loadVerification(params.id))
    } catch (e) { return workflowErrorResponse(e, "[ASSET_VER_ONE_GET]") }
}

// PUT { counts: [{ lineId, countedQty, condition?, note? }] } — save counts.
// POST { close: true, adjust: boolean } — close (optionally adjusting stock to the count).
export async function PUT(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        if (!canIssueAssets(session)) return jsonError(403, "Forbidden")
        const b = await req.json().catch(() => ({}))
        const saved = await saveCounts(params.id, Array.isArray(b?.counts) ? b.counts : [], session.user.id)
        return NextResponse.json({ saved })
    } catch (e) { return workflowErrorResponse(e, "[ASSET_VER_PUT]") }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        if (!canIssueAssets(session)) return jsonError(403, "Forbidden")
        const b = await req.json().catch(() => ({}))
        if (!b?.close) return jsonError(400, "Nothing to do")
        return NextResponse.json(await closeVerification(params.id, { adjust: b?.adjust === true, actorId: session.user.id }))
    } catch (e) { return workflowErrorResponse(e, "[ASSET_VER_CLOSE]") }
}
