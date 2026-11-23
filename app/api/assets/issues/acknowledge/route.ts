import { NextResponse } from "next/server"
import { clearNotReceived } from "@/lib/asset-not-received"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { canIssueAssets } from "@/lib/permissions"
import { audit, jsonError, workflowErrorResponse } from "@/lib/asset-workflow"

export const dynamic = "force-dynamic"

// POST { ids } — confirm receipt on the employees' behalf (the issuer handed
// the items over in person). Only issues not yet confirmed are touched.
export async function POST(req: Request) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        if (!canIssueAssets(session)) return jsonError(403, "Forbidden")
        const body = await req.json().catch(() => ({}))
        const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string").slice(0, 500) : []
        if (!ids.length) return jsonError(400, "Pick at least one issue")
        const now = new Date()
        const pending = await prisma.assetIssue.findMany({ where: { id: { in: ids }, acknowledgedAt: null, status: "ACTIVE" }, select: { id: true } })
        await prisma.$transaction(async tx => {
            await tx.assetIssue.updateMany({ where: { id: { in: pending.map(p => p.id) }, acknowledgedAt: null }, data: { acknowledgedAt: now, acknowledgedBy: session.user.id } })
            for (const p of pending) await audit(tx, { entity: "AssetIssue", entityId: p.id, action: "ACKNOWLEDGE", userId: session.user.id, after: { onBehalf: true, bulk: true } })
        })
        await clearNotReceived(pending.map(p => p.id), session.user.id).catch(() => {})
        return NextResponse.json({ acknowledged: pending.length })
    } catch (e) {
        return workflowErrorResponse(e, "[ASSET_BULK_ACK]")
    }
}
