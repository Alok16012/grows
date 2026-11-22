import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { canUse, pairDevice } from "@/lib/dialer-server"

export const dynamic = "force-dynamic"

// POST { deviceName?, appVersion?, simNumber? } — from the Growus Dialer app, signed in (cookie inside the app).
// Returns a device token the app keeps for background sync. Pairing again replaces the old phone.
export async function POST(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    if (!canUse(g.access)) return NextResponse.json({ error: "The dialer needs the Call Dialer → Create permission" }, { status: 403 })
    const b = await req.json().catch(() => ({}))
    const r = await pairDevice(g.access.userId, { deviceName: b?.deviceName, appVersion: b?.appVersion, simNumber: b?.simNumber })
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "dialer.pair", targetType: "DialerDevice", targetId: r.deviceId, targetName: String(b?.deviceName ?? "phone").slice(0, 80), summary: `Paired a phone for the dialer`, ...requestMeta(req) })
    return NextResponse.json({ token: r.token, deviceId: r.deviceId, name: g.access.name })
}

// DELETE — unpair my phone (it stops syncing at once).
export async function DELETE(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    const n = await prisma.dialerDevice.updateMany({ where: { userId: g.access.userId, active: true }, data: { active: false } })
    return NextResponse.json({ unpaired: n.count })
}
