import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { canIssueAssets, canOverseeAssets, checkAccess } from "@/lib/permissions"
import { jsonError, workflowErrorResponse } from "@/lib/asset-workflow"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET — the asset register: every asset with its details (group, size, serial,
// site, purchase, warranty, recovery cost), stock and how many are out with employees.
export async function GET(req: Request) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        if (!canOverseeAssets(session) && !canIssueAssets(session) && !checkAccess(session, [], "assets.view")) return jsonError(403, "Forbidden")
        const assets = await prisma.asset.findMany({
            orderBy: [{ isActive: "desc" }, { assetCode: "asc" }],
            select: { id: true, assetCode: true, name: true, category: true, description: true, serialNo: true, quantity: true, available: true, condition: true, purchaseDate: true, purchaseCost: true, vendor: true, location: true, isActive: true, meta: { select: { size: true, reorderLevel: true, trackSerial: true } } },
        })
        const ids = assets.map(a => a.id)
        const [details, out, holders] = await Promise.all([
            prisma.assetDetail.findMany({ where: { assetId: { in: ids } } }),
            prisma.assetIssue.groupBy({ by: ["assetId"], where: { assetId: { in: ids }, status: "ACTIVE" }, _sum: { quantity: true, returnedQty: true } }),
            prisma.assetIssue.groupBy({ by: ["assetId"], where: { assetId: { in: ids }, status: "ACTIVE" }, _count: { employeeId: true } }),
        ])
        const det = new Map(details.map(d => [d.assetId, d]))
        const outOf = new Map(out.map(o => [o.assetId, (o._sum.quantity ?? 0) - (o._sum.returnedQty ?? 0)]))
        const holdersOf = new Map(holders.map(h => [h.assetId, h._count.employeeId]))
        return NextResponse.json({
            assets: assets.map(a => {
                const d = det.get(a.id)
                return {
                    id: a.id, assetCode: a.assetCode, name: a.name, category: a.category, description: a.description, serialNo: a.serialNo,
                    quantity: a.quantity, available: a.available, issued: outOf.get(a.id) ?? 0, holders: holdersOf.get(a.id) ?? 0,
                    condition: a.condition, purchaseDate: a.purchaseDate, purchaseCost: a.purchaseCost, vendor: a.vendor, location: a.location, isActive: a.isActive,
                    size: a.meta?.size ?? null, reorderLevel: a.meta?.reorderLevel ?? 0, trackSerial: a.meta?.trackSerial ?? false,
                    groupName: d?.groupName ?? null, recoveryCost: d?.recoveryCost ?? null, warrantyUntil: d?.warrantyUntil ?? null, siteId: d?.siteId ?? null, siteName: d?.siteName ?? null,
                }
            }),
        })
    } catch (e) { return workflowErrorResponse(e, "[ASSET_REGISTER_GET]") }
}
