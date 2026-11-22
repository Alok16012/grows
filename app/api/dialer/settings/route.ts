import { NextResponse } from "next/server"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { canUse, canEditAny, getDialerSettings, saveDialerSettings } from "@/lib/dialer-server"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    if (!canUse(g.access)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    return NextResponse.json({ settings: await getDialerSettings(), canEdit: canEditAny(g.access) })
}

export async function PUT(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    if (!canEditAny(g.access)) return NextResponse.json({ error: "Changing dialer settings needs Call Dialer → Edit" }, { status: 403 })
    const s = await saveDialerSettings(await req.json().catch(() => ({})), g.access.userId)
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "dialer.settings", targetType: "AppSetting", targetId: "dialerSettings", targetName: "Dialer settings", summary: `Dialer settings saved (targets ${s.targetCalls} calls / ${s.targetConnected} connected / ${s.targetTalkMin} min)`, ...requestMeta(req) })
    return NextResponse.json({ settings: s })
}
