import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { auditLater, requestMeta } from "@/lib/access"
import { getRecSettings, saveRecSettings, canView, canApprove } from "@/lib/recruitment-server"

export const dynamic = "force-dynamic"

// GET — settings plus the people who can be recruiters (logins with Recruitment → Edit).
export async function GET(req: Request) {
    const s = await getApiSession(req)
    if (!s || !canView(s)) return NextResponse.json({ error: "No access" }, { status: 403 })
    const roles = await prisma.customRole.findMany({ where: { permissions: { hasSome: ["recruitment.create", "recruitment.edit"] } }, select: { id: true } }).catch(() => [])
    const recruiters = await prisma.user.findMany({ where: { isActive: true, OR: [{ role: "ADMIN" as any }, { customRoleId: { in: roles.map(r => r.id) } }] }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 300 })
    return NextResponse.json({ settings: await getRecSettings(), recruiters, canEdit: s.user.role === "ADMIN" || canApprove(s) })
}

// PUT — Admin or Recruitment → Approve.
export async function PUT(req: Request) {
    const s = await getApiSession(req)
    if (!s || !(s.user.role === "ADMIN" || canApprove(s))) return NextResponse.json({ error: "Needs Recruitment → Approve" }, { status: 403 })
    const v = await saveRecSettings(await req.json().catch(() => ({})), s.user.id)
    auditLater({ actorId: s.user.id, actorName: s.user.name ?? null, action: "recruitment.settings", targetType: "Setting", targetId: "recruitmentSettings", targetName: "Recruitment settings", summary: `Auto-assign ${v.autoAssign ? `on (${v.recruiterIds.length} recruiters, ${v.assignMode})` : "off"}; approval ${v.requestNeedsApproval ? "on" : "off"}; digest ${v.dailyDigest ? "on" : "off"}`, after: v, ...requestMeta(req) })
    return NextResponse.json({ settings: v })
}
