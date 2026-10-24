import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { checkAccess, canOverseeAssets } from "@/lib/permissions"
import { workflowErrorResponse, jsonError, dateRange, userNames } from "@/lib/asset-workflow"

// GET — stock movements, newest first (capped; filter by asset/date for more).
export async function GET(req: Request) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        if (!checkAccess(session, [], "assets.view") && !canOverseeAssets(session)) return jsonError(403, "Forbidden")

        const sp = new URL(req.url).searchParams
        const where: Prisma.AssetStockTxnWhereInput = {}
        if (sp.get("assetId")) where.assetId = sp.get("assetId")!
        const createdAt = dateRange(sp.get("from"), sp.get("to"))
        if (createdAt) where.createdAt = createdAt

        const rows = await prisma.assetStockTxn.findMany({
            where, orderBy: { createdAt: "desc" }, take: 500,
            include: { asset: { select: { id: true, assetCode: true, name: true } } },
        })
        const users = await userNames(prisma, rows.map(r => r.userId))
        const txns = rows.map(r => ({
            id: r.id, type: r.type, qty: r.qty, balanceAfter: r.balanceAfter,
            refType: r.refType, refId: r.refId, note: r.note, createdAt: r.createdAt,
            asset: r.asset,
            user: r.userId && users.get(r.userId) ? { name: users.get(r.userId)!.name } : null,
        }))
        return NextResponse.json({ txns })
    } catch (e) {
        return workflowErrorResponse(e, "[ASSET_LEDGER_GET]")
    }
}
