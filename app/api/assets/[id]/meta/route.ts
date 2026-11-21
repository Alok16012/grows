import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { canIssueAssets } from "@/lib/permissions"
import { workflowErrorResponse, jsonError, audit, parseIntStrict } from "@/lib/asset-workflow"

// PUT — per-asset workflow settings (size, reorder level, serial tracking).
// Kept in AssetMeta, not on Asset, so the Asset table is untouched.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        if (!canIssueAssets(session)) return jsonError(403, "Forbidden")

        const asset = await prisma.asset.findUnique({ where: { id: params.id }, select: { id: true } })
        if (!asset) return jsonError(404, "Asset not found")

        const body = await req.json().catch(() => ({}))
        const data: { size?: string | null; reorderLevel?: number; trackSerial?: boolean } = {}
        if (body?.size !== undefined) data.size = body.size?.toString().trim() || null
        if (body?.reorderLevel !== undefined) {
            const n = parseIntStrict(body.reorderLevel)
            if (n === null || n < 0) return jsonError(400, "Reorder level must be a whole number, 0 or more")
            data.reorderLevel = n
        }
        if (body?.trackSerial !== undefined) data.trackSerial = body.trackSerial === true

        // Item group, recovery cost, warranty, site — in AssetDetail.
        const detail: { groupName?: string | null; recoveryCost?: number | null; warrantyUntil?: Date | null; siteId?: string | null; siteName?: string | null } = {}
        if (body?.groupName !== undefined) detail.groupName = body.groupName?.toString().trim().slice(0, 80) || null
        if (body?.recoveryCost !== undefined) {
            const n = body.recoveryCost === null || body.recoveryCost === "" ? null : Number(body.recoveryCost)
            if (n !== null && (!Number.isFinite(n) || n < 0)) return jsonError(400, "Recovery cost must be 0 or more")
            detail.recoveryCost = n
        }
        if (body?.warrantyUntil !== undefined) detail.warrantyUntil = body.warrantyUntil ? new Date(body.warrantyUntil) : null
        if (body?.siteId !== undefined) { detail.siteId = body.siteId || null; detail.siteName = body.siteName || null }
        if (Object.keys(detail).length) {
            await prisma.assetDetail.upsert({ where: { assetId: params.id }, create: { assetId: params.id, ...detail }, update: detail })
            await audit(prisma, { entity: "AssetDetail", entityId: params.id, action: "UPDATE", userId: session.user.id, after: detail })
        }
        if (!Object.keys(data).length) return NextResponse.json(await prisma.assetMeta.findUnique({ where: { assetId: params.id } }) ?? { assetId: params.id })
        const meta = await prisma.$transaction(async tx => {
            const before = await tx.assetMeta.findUnique({ where: { assetId: params.id } })
            const saved = await tx.assetMeta.upsert({
                where: { assetId: params.id },
                create: { assetId: params.id, ...data },
                update: data,
            })
            await audit(tx, { entity: "AssetMeta", entityId: params.id, action: "UPDATE", userId: session.user.id, before, after: saved })
            return saved
        })
        return NextResponse.json(meta)
    } catch (e) {
        return workflowErrorResponse(e, "[ASSET_META_PUT]")
    }
}
