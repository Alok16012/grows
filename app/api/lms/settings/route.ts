import { NextResponse } from "next/server"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { getLmsSettings, saveLmsSettings } from "@/lib/lms-settings"

export const dynamic = "force-dynamic"

// Training (LMS) → Settings.
export async function GET(req: Request) {
    const g = await guard(req, ["lms.edit", "lms.enroll", "lms.view"])
    if (g instanceof NextResponse) return g
    return NextResponse.json({ settings: await getLmsSettings() })
}

export async function PUT(req: Request) {
    const g = await guard(req, "lms.edit")
    if (g instanceof NextResponse) return g
    const next = await saveLmsSettings(await req.json().catch(() => ({})), g.access.userId)
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "lms.settings", targetType: "Setting", targetId: "lmsSettings", targetName: "LMS settings", summary: "LMS settings saved", after: next, ...requestMeta(req) })
    return NextResponse.json({ ok: true, settings: next })
}
