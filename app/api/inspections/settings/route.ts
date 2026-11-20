import { NextResponse } from "next/server"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { getInspectionSettings, saveInspectionSettings, sanitizeInspectionSettings } from "@/lib/inspection-settings"

export const dynamic = "force-dynamic"

// Approvals → Settings. Anyone who reviews reports can read them (the inbox
// needs the approval target); changing them needs approvals.manage.
export async function GET(req: Request) {
    const g = await guard(req, ["approvals.view", "approvals.manage", "projects.manage"])
    if (g instanceof NextResponse) return g
    return NextResponse.json({ settings: await getInspectionSettings() })
}

export async function PUT(req: Request) {
    const g = await guard(req, ["approvals.manage", "projects.manage"])
    if (g instanceof NextResponse) return g
    const next = sanitizeInspectionSettings(await req.json().catch(() => ({})))
    await saveInspectionSettings(next, g.access.userId)
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "inspection.settings", targetType: "Setting", targetId: "inspectionSettings", targetName: "Inspection settings", summary: "Inspection settings saved", after: next, ...requestMeta(req) })
    return NextResponse.json({ ok: true, settings: next })
}
