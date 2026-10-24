import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { checkAccess, canIssueAssets, canOverseeAssets, canRequestAssets } from "@/lib/permissions"
import {
    workflowErrorResponse, jsonError, isMissingTableErr, postStockTxn, audit, parseIntStrict,
} from "@/lib/asset-workflow"

/** Units currently out with employees, per asset. Null when the workflow isn't installed. */
async function issuedByAsset(assetIds: string[]): Promise<Map<string, number> | null> {
    try {
        const [issues, legacy] = await Promise.all([
            prisma.assetIssue.groupBy({
                by: ["assetId"], where: { assetId: { in: assetIds }, status: "ACTIVE" },
                _sum: { quantity: true, returnedQty: true },
            }),
            // Assignments made before the workflow existed have no AssetIssue;
            // each one is a single unit.
            prisma.employeeAsset.groupBy({
                by: ["assetId"], where: { assetId: { in: assetIds }, isActive: true, workflowIssue: { is: null } },
                _count: { _all: true },
            }),
        ])
        const out = new Map<string, number>()
        for (const i of issues) out.set(i.assetId, (i._sum.quantity ?? 0) - (i._sum.returnedQty ?? 0))
        for (const l of legacy) out.set(l.assetId, (out.get(l.assetId) ?? 0) + l._count._all)
        return out
    } catch (e) {
        if (isMissingTableErr(e)) return null
        throw e
    }
}

async function metaByAsset(assetIds: string[]) {
    try {
        const rows = await prisma.assetMeta.findMany({ where: { assetId: { in: assetIds } } })
        return new Map(rows.map(r => [r.assetId, r]))
    } catch (e) {
        if (isMissingTableErr(e)) return new Map<string, { size: string | null; reorderLevel: number; trackSerial: boolean }>()
        throw e
    }
}

// GET — stock position per asset. Works before the migration too (falls back
// to quantity − available), so the stock tab never blanks out.
export async function GET(req: Request) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        // Requesters need the catalogue + availability to raise a request.
        if (!checkAccess(session, [], "assets.view") && !canOverseeAssets(session) && !canRequestAssets(session)) {
            return jsonError(403, "Forbidden")
        }

        const sp = new URL(req.url).searchParams
        const where: Prisma.AssetWhereInput = sp.get("includeInactive") === "1" ? {} : { isActive: true }
        const category = sp.get("category")
        if (category && category !== "All") where.category = category
        const location = sp.get("location")?.trim()
        if (location) where.location = { contains: location, mode: "insensitive" }
        const search = sp.get("search")?.trim()
        if (search) {
            where.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { assetCode: { contains: search, mode: "insensitive" } },
                { serialNo: { contains: search, mode: "insensitive" } },
            ]
        }

        const assets = await prisma.asset.findMany({
            where, orderBy: [{ category: "asc" }, { name: "asc" }],
            select: { id: true, assetCode: true, name: true, category: true, location: true, quantity: true, available: true, isActive: true },
        })
        const ids = assets.map(a => a.id)
        const [issued, meta] = await Promise.all([issuedByAsset(ids), metaByAsset(ids)])

        let items = assets.map(a => {
            const m = meta.get(a.id)
            const reorderLevel = m?.reorderLevel ?? 0
            return {
                ...a,
                size: m?.size ?? null,
                issued: issued ? (issued.get(a.id) ?? 0) : Math.max(0, a.quantity - a.available),
                reorderLevel,
                trackSerial: m?.trackSerial ?? false,
                low: reorderLevel > 0 && a.available <= reorderLevel,
            }
        })
        if (sp.get("lowOnly") === "1") items = items.filter(i => i.low)

        return NextResponse.json({ items, workflowInstalled: issued !== null })
    } catch (e) {
        return workflowErrorResponse(e, "[ASSET_STOCK_GET]")
    }
}

// POST — goods received, or a counted correction.
export async function POST(req: Request) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        if (!canIssueAssets(session)) return jsonError(403, "Forbidden")
        const actorId = session.user.id

        const body = await req.json().catch(() => ({}))
        const assetId = body?.assetId?.toString()
        const type = String(body?.type ?? "").toUpperCase()
        const qty = parseIntStrict(body?.qty)
        const note = body?.note?.toString().trim() || null
        if (!assetId) return jsonError(400, "assetId is required")
        if (type !== "RECEIPT" && type !== "ADJUSTMENT") return jsonError(400, "type must be RECEIPT or ADJUSTMENT")
        if (qty === null) return jsonError(400, "qty must be a whole number")
        if (type === "RECEIPT" && qty <= 0) return jsonError(400, "A receipt must add at least 1")
        if (type === "ADJUSTMENT" && qty === 0) return jsonError(400, "An adjustment can't be zero")
        if (type === "ADJUSTMENT" && !note) return jsonError(400, "Say why the stock is being adjusted")

        const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { id: true, quantity: true, available: true } })
        if (!asset) return jsonError(404, "Asset not found")

        const txn = await prisma.$transaction(async tx => {
            // Both move the owned total with the shelf count, so
            // "issued = quantity − available" stays true for the legacy screens.
            const row = await postStockTxn(tx, {
                assetId, type, qty, quantityDelta: qty, refType: "MANUAL", userId: actorId, note,
            })
            await audit(tx, {
                entity: "AssetStock", entityId: assetId, action: type, userId: actorId, reason: note,
                before: { quantity: asset.quantity, available: asset.available },
                after: { qty, balanceAfter: row.balanceAfter },
            })
            return row
        })
        const after = await prisma.asset.findUnique({ where: { id: assetId }, select: { id: true, quantity: true, available: true } })
        return NextResponse.json({ txn, asset: after }, { status: 201 })
    } catch (e) {
        return workflowErrorResponse(e, "[ASSET_STOCK_POST]")
    }
}
