import { NextResponse } from "next/server"
import { getApiSession } from "@/lib/apiSession"
import { canIssueAssets } from "@/lib/permissions"
import { jsonError, workflowErrorResponse } from "@/lib/asset-workflow"
import { joinersNeedingKits } from "@/lib/asset-kits"
import { getAssetSettings } from "@/lib/asset-settings"

export const dynamic = "force-dynamic"

// GET — recent joiners (within the window in Assets → Settings) who should get
// an on-joining kit and haven't received all of it.
export async function GET(req: Request) {
    try {
        const session = await getApiSession(req)
        if (!session) return jsonError(401, "Unauthorized")
        if (!canIssueAssets(session)) return jsonError(403, "Forbidden")
        const s = await getAssetSettings()
        return NextResponse.json({ windowDays: s.kits.joinerWindowDays, joiners: await joinersNeedingKits(s.kits.joinerWindowDays) })
    } catch (e) { return workflowErrorResponse(e, "[ASSET_KIT_JOINERS]") }
}
