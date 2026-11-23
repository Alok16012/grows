import { NextResponse } from "next/server"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { getJoinSettings, saveJoinSettings } from "@/lib/join-server"
import { LINK_USERS } from "@/lib/join-link-access"

export const dynamic = "force-dynamic"

// GET / PUT — join form settings (duplicate check, rejoin alert, HR alerts, form fields, language).
export async function GET(req: Request) {
    const g = await guard(req, LINK_USERS)
    if (g instanceof NextResponse) return g
    return NextResponse.json({ settings: await getJoinSettings(), canEdit: g.access.isAdmin || g.access.permissions.includes("onboarding.edit") })
}

export async function PUT(req: Request) {
    const g = await guard(req, "onboarding.edit")
    if (g instanceof NextResponse) return g
    const s = await saveJoinSettings(await req.json().catch(() => ({})), g.access.userId)
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "join.settings", targetType: "Setting", targetId: "joinSettings", targetName: "Join link settings", summary: "Join link settings saved", after: s, ...requestMeta(req) })
    return NextResponse.json({ settings: s })
}
