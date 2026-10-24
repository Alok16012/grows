import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { checkAccess, canOverseeAssets, canRequestAssets } from "@/lib/permissions"
import { workflowErrorResponse, jsonError, loadRequests } from "@/lib/asset-workflow"

// GET — headline numbers for the asset hub. Requesters without oversight get
// their own requests only.
export async function GET(req: Request) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        const oversee = canOverseeAssets(session) || checkAccess(session, [], "assets.view")
        if (!oversee && !canRequestAssets(session)) return jsonError(403, "Forbidden")

        const scope: Prisma.AssetRequestWhereInput = oversee ? {} : { requestedBy: session.user.id }
        const since = new Date(Date.now() - 30 * 86_400_000)

        const [requests30d, pendingApproval, pending, stock, metas, recentRequests] = await Promise.all([
            prisma.assetRequest.count({ where: { ...scope, createdAt: { gte: since } } }),
            prisma.assetRequest.count({ where: { ...scope, status: "SUBMITTED" } }),
            prisma.assetRequestItem.aggregate({
                where: { request: { ...scope, status: { in: ["APPROVED", "PARTIALLY_APPROVED"] } } },
                _sum: { approvedQty: true, issuedQty: true },
            }),
            prisma.asset.aggregate({ where: { isActive: true }, _sum: { available: true } }),
            prisma.assetMeta.findMany({
                where: { reorderLevel: { gt: 0 }, asset: { isActive: true } },
                include: { asset: { select: { id: true, name: true, available: true } } },
            }),
            loadRequests(prisma, { where: scope, orderBy: { createdAt: "desc" }, take: 6 }),
        ])

        const lowStock = metas
            .filter(m => m.asset.available <= m.reorderLevel)
            .map(m => ({ id: m.asset.id, name: m.asset.name, size: m.size, available: m.asset.available, reorderLevel: m.reorderLevel }))
            .sort((a, b) => a.available - a.reorderLevel - (b.available - b.reorderLevel))

        return NextResponse.json({
            totals: {
                requests30d,
                pendingApproval,
                pendingIssueQty: Math.max(0, (pending._sum.approvedQty ?? 0) - (pending._sum.issuedQty ?? 0)),
                stockAvailable: stock._sum.available ?? 0,
                lowStockCount: lowStock.length,
            },
            recentRequests,
            lowStock,
        })
    } catch (e) {
        return workflowErrorResponse(e, "[ASSET_DASHBOARD_GET]")
    }
}
