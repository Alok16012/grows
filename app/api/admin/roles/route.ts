import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, has, audit, requestMeta } from "@/lib/access"
import {
    parseRoleInput, assertNameFree, requireAccessTables, ruleResponse, roleSnapshot, listRoleCards,
} from "@/lib/role-admin"

// Screens that only need role names (letters to a role, announcements to a
// role, the role picker on the employee form) read the short list.
const NAME_READERS = [
    "roles.view", "users.view", "users.edit", "users.manage", "employees.create", "employees.edit",
    "announcements.create", "announcements.manage", "documents.send", "documents.view",
]

// GET            → [{ id, name, color, isActive, description, _count }] for pickers
// GET ?full=1    → { roles: RoleCard[], stats } for the Roles screen (roles.view)
export async function GET(req: Request) {
    const g = await guard(req, NAME_READERS)
    if (g instanceof NextResponse) return g
    try {
        const full = new URL(req.url).searchParams.get("full") === "1"
        if (!full) {
            const roles = await prisma.customRole.findMany({
                orderBy: { createdAt: "asc" },
                select: { id: true, name: true, color: true, isActive: true, description: true, _count: { select: { users: true } } },
            })
            // The user form shows "Assigned sites" only for site-scoped roles.
            const metas = await prisma.roleMeta.findMany({ select: { roleId: true, scope: true } }).catch(() => [])
            const scopeBy = new Map(metas.map(m => [m.roleId, m.scope]))
            return NextResponse.json(roles.map(r => ({ ...r, scope: scopeBy.get(r.id) ?? null })))
        }
        if (!has(g.access, "roles.view")) return NextResponse.json({ error: "Forbidden — missing roles.view" }, { status: 403 })

        const roles = await listRoleCards()
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        const [withoutRole, changes] = await Promise.all([
            prisma.user.count({ where: { customRoleId: null, role: { notIn: ["ADMIN", "CLIENT"] } } }),
            prisma.auditLog.count({ where: { at: { gte: since }, action: { startsWith: "role." } } }).catch(() => null),
        ])
        const usersWithRole = roles.reduce((n, r) => n + r.users, 0)
        return NextResponse.json({
            roles,
            stats: { roles: roles.length, usersWithRole, usersWithoutRole: withoutRole, changesLast30Days: changes },
            canCreate: has(g.access, "roles.create"),
            canEdit: has(g.access, "roles.edit"),
            canDelete: has(g.access, "roles.delete"),
        })
    } catch (e) {
        return ruleResponse(e, "[ROLES_GET]")
    }
}

export async function POST(req: Request) {
    const g = await guard(req, "roles.create")
    if (g instanceof NextResponse) return g
    try {
        await requireAccessTables()
        const input = parseRoleInput(await req.json().catch(() => null), g.access)
        await assertNameFree(input.name)
        const role = await prisma.$transaction(async tx => {
            const created = await tx.customRole.create({
                data: { name: input.name, description: input.description, color: input.color, permissions: input.permissions, isActive: input.isActive },
            })
            await tx.roleMeta.create({ data: { roleId: created.id, scope: input.scope } })
            await audit(tx, {
                actorId: g.access.userId, actorName: g.access.name, action: "role.create", targetType: "Role",
                targetId: created.id, targetName: created.name,
                summary: `${created.name}: created with ${input.permissions.length - 1} permissions, scope ${input.scope}`,
                after: roleSnapshot(created, input.scope), ...requestMeta(req),
            })
            return created
        })
        return NextResponse.json({ id: role.id, name: role.name }, { status: 201 })
    } catch (e) {
        return ruleResponse(e, "[ROLES_POST]")
    }
}

