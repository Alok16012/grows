import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, has, auditLater, requestMeta } from "@/lib/access"
import { activity, loginHealth, fixHealth, security, unlock, signOutUser, accessReview } from "@/lib/access-centre-data"
import { getAccessCentre, saveAccessCentre, addReview } from "@/lib/access-centre-server"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const VIEW = ["users.view", "users.manage", "audit.view"]

// GET ?tab=activity|health|security|review
export async function GET(req: Request) {
    const g = await guard(req, VIEW)
    if (g instanceof NextResponse) return g
    const tab = new URL(req.url).searchParams.get("tab") ?? "activity"
    const canManage = g.access.isAdmin || has(g.access, "users.manage")
    const settings = await getAccessCentre()
    const roles = await prisma.customRole.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    const body = tab === "health" ? await loginHealth() : tab === "security" ? await security() : tab === "review" ? await accessReview() : await activity()
    return NextResponse.json({ tab, canManage, settings, roles, ...body })
}

// PUT — settings (idle disable, lockout, alerts, review interval). Admin / users.manage.
export async function PUT(req: Request) {
    const g = await guard(req, VIEW)
    if (g instanceof NextResponse) return g
    if (!(g.access.isAdmin || has(g.access, "users.manage"))) return NextResponse.json({ error: "Needs Manage users" }, { status: 403 })
    const s = await saveAccessCentre(await req.json().catch(() => ({})), g.access.userId)
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "access.settings", targetType: "Setting", targetId: "accessCentre", targetName: "Access centre", summary: `Idle disable ${s.idleDisableDays || "off"}; lock after ${s.lockAfterFailures} for ${s.lockMinutes} min; alert at ${s.alertAfterFailures || "off"}; review every ${s.reviewEveryDays || "off"} days`, after: s, ...requestMeta(req) })
    return NextResponse.json({ settings: s })
}

// POST { action: "fix", kind, employeeId?, userId? } | { action: "unlock", userId } | { action: "signout", userId } | { action: "review", note? }
export async function POST(req: Request) {
    const g = await guard(req, VIEW)
    if (g instanceof NextResponse) return g
    if (!(g.access.isAdmin || has(g.access, "users.manage"))) return NextResponse.json({ error: "Needs Manage users" }, { status: 403 })
    const b = await req.json().catch(() => ({}))
    const actor = { id: g.access.userId, name: g.access.name }
    if (b?.action === "fix") {
        const items: { kind: string; employeeId?: string | null; userId?: string | null }[] = Array.isArray(b.items) ? b.items.slice(0, 500) : [{ kind: b.kind, employeeId: b.employeeId, userId: b.userId }]
        let done = 0; const errors: string[] = []
        for (const it of items) {
            if (it.kind === "enable" && !has(g.access, "users.deactivate") && !g.access.isAdmin) { errors.push("Needs Disable users to enable logins"); continue }
            const err = await fixHealth(String(it.kind), it.employeeId ?? null, it.userId ?? null, actor).catch(e => String(e?.message ?? e))
            if (err) errors.push(err); else done++
        }
        return NextResponse.json({ done, failed: errors.length, errors: Array.from(new Set(errors)).slice(0, 5) })
    }
    if (b?.action === "unlock" && typeof b.userId === "string") { await unlock(b.userId, actor); return NextResponse.json({ ok: true }) }
    if (b?.action === "signout" && typeof b.userId === "string") {
        const target = await prisma.user.findUnique({ where: { id: b.userId }, select: { role: true } })
        if (target?.role === "ADMIN" && !g.access.isAdmin) return NextResponse.json({ error: "Only an Admin can sign out an Admin" }, { status: 403 })
        const err = await signOutUser(b.userId, actor)
        return err ? NextResponse.json({ error: err }, { status: 400 }) : NextResponse.json({ ok: true })
    }
    if (b?.action === "review") {
        const [logins, admins, roles] = await Promise.all([
            prisma.user.count({ where: { isActive: true } }),
            prisma.user.count({ where: { isActive: true, role: "ADMIN" } }),
            prisma.customRole.findMany({ select: { name: true, _count: { select: { users: { where: { isActive: true } } } } } }),
        ])
        const list = await addReview({ at: new Date().toISOString(), by: g.access.name, byId: g.access.userId, note: b.note ? String(b.note).slice(0, 500) : null, counts: { logins, admins, roles: Object.fromEntries(roles.map(r => [r.name, r._count.users])) } }, g.access.userId)
        auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "access.review", targetType: "Setting", targetId: "accessReviews", targetName: "Access review", summary: `Access reviewed and signed off${b.note ? `: ${String(b.note).slice(0, 120)}` : ""}`, ...requestMeta(req) })
        return NextResponse.json({ reviews: list.slice(0, 10) })
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
