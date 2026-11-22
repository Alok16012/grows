import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { LINK_USERS, canManageAll } from "@/lib/join-link-access"

export const dynamic = "force-dynamic"

// PUT { isActive?, name?, expiresAt?, maxUses? } — own links, or any for onboarding managers.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
    const g = await guard(req, LINK_USERS)
    if (g instanceof NextResponse) return g
    const l = await prisma.joinLink.findUnique({ where: { id: params.id } })
    if (!l) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (l.recruiterId !== g.access.userId && l.createdBy !== g.access.userId && !canManageAll(g.access)) return NextResponse.json({ error: "Only the recruiter or an onboarding manager can change this link" }, { status: 403 })
    const b = await req.json().catch(() => ({}))
    const data: { isActive?: boolean; name?: string; expiresAt?: Date | null; maxUses?: number | null } = {}
    if (typeof b?.isActive === "boolean") data.isActive = b.isActive
    if (typeof b?.name === "string" && b.name.trim()) data.name = b.name.trim().slice(0, 80)
    if (b?.expiresAt !== undefined) { const d = b.expiresAt ? new Date(`${String(b.expiresAt).slice(0, 10)}T23:59:59+05:30`) : null; data.expiresAt = d && !isNaN(d.getTime()) ? d : null }
    if (b?.maxUses !== undefined) data.maxUses = b.maxUses ? Math.max(1, Math.round(Number(b.maxUses)) || 1) : null
    const u = await prisma.joinLink.update({ where: { id: l.id }, data })
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "join_link.update", targetType: "JoinLink", targetId: l.id, targetName: l.name, summary: `Join link ${l.code} changed`, before: { isActive: l.isActive, expiresAt: l.expiresAt, maxUses: l.maxUses }, after: data, ...requestMeta(req) })
    return NextResponse.json({ link: u })
}
