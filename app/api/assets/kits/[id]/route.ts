import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { canIssueAssets } from "@/lib/permissions"
import { jsonError, workflowErrorResponse, audit } from "@/lib/asset-workflow"
import { sanitizeKitItems } from "@/lib/asset-kits"

export const dynamic = "force-dynamic"

// PUT — edit a kit (same fields as create, plus isActive).
export async function PUT(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        if (!canIssueAssets(session)) return jsonError(403, "Forbidden")
        const before = await prisma.assetKit.findUnique({ where: { id: params.id } })
        if (!before) return jsonError(404, "Kit not found")
        const b = await req.json().catch(() => ({}))
        const data: any = {}
        if (b?.name !== undefined) { const n = String(b.name).trim().slice(0, 80); if (!n) return jsonError(400, "Give the kit a name"); data.name = n }
        if (b?.description !== undefined) data.description = b.description ? String(b.description).slice(0, 300) : null
        if (b?.siteId !== undefined) { data.siteId = b.siteId || null; data.siteName = b.siteName || null }
        if (b?.designation !== undefined) data.designation = b.designation ? String(b.designation).trim().slice(0, 80) : null
        if (b?.items !== undefined) { const items = sanitizeKitItems(b.items); if (!items.length) return jsonError(400, "Add at least one item"); data.items = items }
        if (b?.onJoining !== undefined) data.onJoining = b.onJoining === true
        if (b?.isActive !== undefined) data.isActive = b.isActive === true
        const kit = await prisma.assetKit.update({ where: { id: params.id }, data })
        await audit(prisma, { entity: "AssetKit", entityId: kit.id, action: "UPDATE", userId: session.user.id, before, after: kit })
        return NextResponse.json(kit)
    } catch (e) { return workflowErrorResponse(e, "[ASSET_KIT_PUT]") }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        if (!canIssueAssets(session)) return jsonError(403, "Forbidden")
        const kit = await prisma.assetKit.findUnique({ where: { id: params.id } })
        if (!kit) return jsonError(404, "Kit not found")
        await prisma.assetKit.delete({ where: { id: params.id } })
        await audit(prisma, { entity: "AssetKit", entityId: kit.id, action: "DELETE", userId: session.user.id, before: kit })
        return NextResponse.json({ ok: true })
    } catch (e) { return workflowErrorResponse(e, "[ASSET_KIT_DELETE]") }
}
