import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { canSeeTeam, canEditAny } from "@/lib/dialer-server"

export const dynamic = "force-dynamic"

// GET — paired phones (team view needs dialer.view).
export async function GET(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    const team = canSeeTeam(g.access)
    const devices = await prisma.dialerDevice.findMany({ where: { active: true, ...(team ? {} : { userId: g.access.userId }) }, orderBy: { lastSeenAt: { sort: "desc", nulls: "last" } }, select: { id: true, userId: true, deviceName: true, appVersion: true, lastSeenAt: true, lastSyncAt: true, createdAt: true } })
    const users = await prisma.user.findMany({ where: { id: { in: devices.map(d => d.userId) } }, select: { id: true, name: true } })
    const nameOf = new Map(users.map(u => [u.id, u.name]))
    return NextResponse.json({ devices: devices.map(d => ({ ...d, name: nameOf.get(d.userId) ?? "—" })), canEdit: canEditAny(g.access) })
}

// DELETE ?id= — unpair a phone (own, or anyone's with dialer.edit), e.g. a lost phone.
export async function DELETE(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    const id = new URL(req.url).searchParams.get("id") ?? ""
    const d = await prisma.dialerDevice.findUnique({ where: { id } })
    if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (d.userId !== g.access.userId && !canEditAny(g.access)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    await prisma.dialerDevice.update({ where: { id }, data: { active: false } })
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "dialer.unpair", targetType: "DialerDevice", targetId: id, targetName: d.deviceName, summary: `Unpaired a dialer phone`, ...requestMeta(req) })
    return NextResponse.json({ ok: true })
}
