import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { canAssignRoles, RuleError } from "@/lib/role-rules"
import { foldDesignation, matchDesignation } from "@/lib/people-masters"
import { getDesignations } from "@/lib/people-masters-server"
import { getAutoRole, saveAutoRole, roleMismatches, applyRoleFix, roleFor } from "@/lib/auto-role-server"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET — login role per designation, what each designation's people hold now, and mismatches.
export async function GET(req: Request) {
    const g = await guard(req, "employees.view")
    if (g instanceof NextResponse) return g
    const [s, master, roles, emps, mism] = await Promise.all([
        getAutoRole(), getDesignations(),
        prisma.customRole.findMany({ where: { isActive: true }, select: { id: true, name: true, color: true }, orderBy: { name: "asc" } }),
        prisma.employee.findMany({ where: { status: { in: ["ACTIVE", "ON_LEAVE", "ONBOARDING"] } }, select: { designation: true, userId: true, user: { select: { role: true, customRoleId: true } } } }),
        roleMismatches(),
    ])
    const roleName = new Map(roles.map(r => [r.id, r.name]))
    // Per standard designation: headcount and the roles its people hold now.
    const rows = new Map<string, { name: string; people: number; now: Record<string, number> }>()
    for (const e of emps) {
        const std = matchDesignation(master, e.designation)
        const name = std?.name ?? (e.designation?.trim() || "(no designation)")
        const k = foldDesignation(name)
        const r = rows.get(k) ?? { name, people: 0, now: {} }
        r.people++
        const held = !e.userId ? "No login" : e.user?.role === "ADMIN" ? "Admin" : e.user?.customRoleId ? roleName.get(e.user.customRoleId) ?? "Other" : "No role"
        r.now[held] = (r.now[held] ?? 0) + 1
        rows.set(k, r)
    }
    const designations = Array.from(rows.entries()).map(([k, r]) => ({
        key: k, name: r.name, people: r.people, inMaster: !!matchDesignation(master, r.name),
        roleId: s.map[k] ?? null, effectiveRoleId: roleFor(r.name, s, master),
        now: Object.entries(r.now).sort((a, b) => b[1] - a[1]).map(([role, n]) => ({ role, n })),
    })).sort((a, b) => b.people - a.people)
    return NextResponse.json({ settings: s, roles, designations, mismatches: mism.rows, canEdit: canAssignRoles(g.access) })
}

// PUT — settings (mapping, default role, follow designation, protected roles).
export async function PUT(req: Request) {
    const g = await guard(req, "employees.view")
    if (g instanceof NextResponse) return g
    if (!canAssignRoles(g.access)) return NextResponse.json({ error: "You cannot change user roles" }, { status: 403 })
    try {
        const s = await saveAutoRole(await req.json().catch(() => ({})), g.access)
        auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "auto_role.settings", targetType: "Setting", targetId: "autoRoleSettings", targetName: "Login role by designation", summary: `${s.enabled ? "On" : "Off"}; ${Object.keys(s.map).length} designation(s) mapped; follow designation: ${s.followDesignation ? "yes" : "no"}`, after: s, ...requestMeta(req) })
        return NextResponse.json({ settings: s })
    } catch (e: any) {
        if (e instanceof RuleError) return NextResponse.json({ error: e.message }, { status: e.status })
        throw e
    }
}

// POST { employeeIds } — give the chosen logins their designation's role.
export async function POST(req: Request) {
    const g = await guard(req, "employees.view")
    if (g instanceof NextResponse) return g
    if (!canAssignRoles(g.access)) return NextResponse.json({ error: "You cannot change user roles" }, { status: 403 })
    const b = await req.json().catch(() => ({}))
    const ids: string[] = Array.isArray(b?.employeeIds) ? b.employeeIds.filter((x: unknown): x is string => typeof x === "string").slice(0, 2000) : []
    if (!ids.length) return NextResponse.json({ error: "Pick the people to change" }, { status: 400 })
    try { return NextResponse.json(await applyRoleFix(ids, g.access)) }
    catch (e: any) { if (e instanceof RuleError) return NextResponse.json({ error: e.message }, { status: e.status }); throw e }
}
