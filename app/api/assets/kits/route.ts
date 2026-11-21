import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { canIssueAssets, canOverseeAssets } from "@/lib/permissions"
import { jsonError, workflowErrorResponse, audit } from "@/lib/asset-workflow"
import { itemGroups, sanitizeKitItems } from "@/lib/asset-kits"

export const dynamic = "force-dynamic"

// GET — kits and item groups (with stock per size).
export async function GET(req: Request) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        if (!canOverseeAssets(session) && !canIssueAssets(session)) return jsonError(403, "Forbidden")
        const [kits, groups] = await Promise.all([prisma.assetKit.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] }), itemGroups()])
        return NextResponse.json({ kits: kits.map(k => ({ ...k, items: sanitizeKitItems(k.items) })), groups })
    } catch (e) { return workflowErrorResponse(e, "[ASSET_KITS_GET]") }
}

// POST { name, description?, siteId?, siteName?, designation?, items: [{ groupName, qty }], onJoining? }
export async function POST(req: Request) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        if (!canIssueAssets(session)) return jsonError(403, "Forbidden")
        const b = await req.json().catch(() => ({}))
        const name = typeof b?.name === "string" ? b.name.trim().slice(0, 80) : ""
        const items = sanitizeKitItems(b?.items)
        if (!name) return jsonError(400, "Give the kit a name")
        if (!items.length) return jsonError(400, "Add at least one item")
        const kit = await prisma.assetKit.create({
            data: {
                name, description: b?.description?.toString().slice(0, 300) || null, siteId: b?.siteId || null, siteName: b?.siteName || null,
                designation: b?.designation?.toString().trim().slice(0, 80) || null, items: items as any, onJoining: b?.onJoining === true, createdBy: session.user.id,
            },
        })
        await audit(prisma, { entity: "AssetKit", entityId: kit.id, action: "CREATE", userId: session.user.id, after: kit })
        return NextResponse.json(kit, { status: 201 })
    } catch (e) { return workflowErrorResponse(e, "[ASSET_KITS_POST]") }
}
