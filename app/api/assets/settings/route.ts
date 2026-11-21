import { NextResponse } from "next/server"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { getAssetSettings, saveAssetSettings } from "@/lib/asset-settings"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
    const g = await guard(req, ["assets.view", "assets.issue", "assets.manage", "assets.approve"])
    if (g instanceof NextResponse) return g
    return NextResponse.json({ settings: await getAssetSettings() })
}

export async function PUT(req: Request) {
    const g = await guard(req, "assets.manage")
    if (g instanceof NextResponse) return g
    const settings = await saveAssetSettings(await req.json().catch(() => ({})), g.access.userId)
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "asset.settings", targetType: "Setting", targetId: "assetSettings", targetName: "Asset settings", summary: "Asset settings saved", after: settings, ...requestMeta(req) })
    return NextResponse.json({ ok: true, settings })
}
