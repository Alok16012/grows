import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { checkAccess } from "@/lib/permissions"
import { auditLater, requestMeta } from "@/lib/access"
import { buildPanels, getLayout, saveLayout, PANELS } from "@/lib/dashboard-work"

export const dynamic = "force-dynamic"

// GET — the work panels for this person's profile (?settings=1 adds the per-role layout for admins).
export async function GET(req: Request) {
    const s = await getApiSession(req)
    if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const panels = await buildPanels(s as any)
    const canEdit = checkAccess(s, [], ["roles.edit"])
    if (!(canEdit && new URL(req.url).searchParams.get("settings"))) return NextResponse.json({ panels, canEdit })
    const [layout, roles] = await Promise.all([
        getLayout(),
        prisma.customRole.findMany({ where: { isActive: true }, select: { id: true, name: true, permissions: true }, orderBy: { name: "asc" } }),
    ])
    // Which panels each role could show at all (its rights), for the settings screen.
    const eligible = Object.fromEntries(roles.map(r => [r.id, PANELS.filter(p => p.perms.some(k => r.permissions.includes(k))).map(p => p.key)]))
    return NextResponse.json({
        panels, canEdit, layout,
        catalogue: PANELS.map(p => ({ key: p.key, label: p.label })),
        roles: [{ id: "ADMIN", name: "Admin" }, ...roles.map(r => ({ id: r.id, name: r.name }))],
        eligible: { ADMIN: PANELS.map(p => p.key), ...eligible },
    })
}

// PUT { byRole: { [roleId]: panelKey[] } } — which panels each role sees, in order.
export async function PUT(req: Request) {
    const s = await getApiSession(req)
    if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!checkAccess(s, [], ["roles.edit"])) return NextResponse.json({ error: "Needs Roles → Edit" }, { status: 403 })
    const saved = await saveLayout(await req.json().catch(() => ({})), s.user.id)
    auditLater({ actorId: s.user.id, actorName: s.user.name ?? "", action: "dashboard.layout", targetType: "Setting", targetId: "dashboardLayout", targetName: "Home page panels", summary: "Home page panels per role saved", after: saved, ...requestMeta(req) })
    return NextResponse.json({ ok: true, layout: saved })
}
