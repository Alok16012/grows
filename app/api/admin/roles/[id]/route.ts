import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, has, audit, requestMeta, bumpAccessVersion } from "@/lib/access"
import { RuleError, ADMIN_ROLE_ID } from "@/lib/role-rules"
import { isScope, type DataScope } from "@/lib/permission-catalogue"
import {
    parseRoleInput, assertNameFree, requireAccessTables, ruleResponse, roleSnapshot, diffSummary, listRoleCards,
} from "@/lib/role-admin"

type Ctx = { params: { id: string } }

export async function GET(req: Request, { params }: Ctx) {
    const g = await guard(req, "roles.view")
    if (g instanceof NextResponse) return g
    try {
        const card = (await listRoleCards()).find(r => r.id === params.id)
        if (!card) return NextResponse.json({ error: "Role not found" }, { status: 404 })
        const editable = !card.isSystem && has(g.access, "roles.edit")
        return NextResponse.json({ role: card, editable, canDelete: !card.isSystem && has(g.access, "roles.delete") })
    } catch (e) {
        return ruleResponse(e, "[ROLE_GET]")
    }
}

async function save(req: Request, { params }: Ctx) {
    const g = await guard(req, "roles.edit")
    if (g instanceof NextResponse) return g
    try {
        if (params.id === ADMIN_ROLE_ID) throw new RuleError(403, "Admin is the system role. It keeps every permission and cannot be edited.")
        await requireAccessTables()
        const role = await prisma.customRole.findUnique({ where: { id: params.id } })
        if (!role) throw new RuleError(404, "Role not found")
        const meta = await prisma.roleMeta.findUnique({ where: { roleId: role.id } })
        if (meta?.isSystem) throw new RuleError(403, "System roles cannot be edited.")

        const input = parseRoleInput(await req.json().catch(() => null), g.access)
        await assertNameFree(input.name, role.id)

        const users = await prisma.user.findMany({ where: { customRoleId: role.id }, select: { id: true } })
        const beforeScope: DataScope | null = isScope(meta?.scope) ? meta!.scope as DataScope : null
        const before = roleSnapshot(role, beforeScope)
        const summary = diffSummary({ permissions: role.permissions, scope: beforeScope ?? "ALL" }, { permissions: input.permissions, scope: input.scope }, users.length)

        await prisma.$transaction(async tx => {
            const updated = await tx.customRole.update({
                where: { id: role.id },
                data: { name: input.name, description: input.description, color: input.color, permissions: input.permissions, isActive: input.isActive },
            })
            await tx.roleMeta.upsert({
                where: { roleId: role.id },
                create: { roleId: role.id, scope: input.scope },
                update: { scope: input.scope },
            })
            // Everyone on the role picks the change up on their next request.
            await bumpAccessVersion(tx, users.map(u => u.id))
            await audit(tx, {
                actorId: g.access.userId, actorName: g.access.name, action: "role.update", targetType: "Role",
                targetId: role.id, targetName: updated.name, summary: `${updated.name}: ${summary.text}`,
                before, after: roleSnapshot(updated, input.scope), ...requestMeta(req),
            })
        })
        return NextResponse.json({ ok: true, summary })
    } catch (e) {
        return ruleResponse(e, "[ROLE_SAVE]")
    }
}

export const PATCH = save
export const PUT = save

export async function DELETE(req: Request, { params }: Ctx) {
    const g = await guard(req, "roles.delete")
    if (g instanceof NextResponse) return g
    try {
        if (params.id === ADMIN_ROLE_ID) throw new RuleError(403, "Admin is the system role and cannot be deleted.")
        await requireAccessTables()
        const role = await prisma.customRole.findUnique({ where: { id: params.id } })
        if (!role) throw new RuleError(404, "Role not found")
        const meta = await prisma.roleMeta.findUnique({ where: { roleId: role.id } })
        if (meta?.isSystem) throw new RuleError(403, "System roles cannot be deleted.")
        // Deleting a role used to silently strip it from everyone holding it.
        const users = await prisma.user.count({ where: { customRoleId: role.id } })
        if (users > 0) throw new RuleError(409, `Move the ${users} user${users === 1 ? "" : "s"} on this role to another role first.`)

        await prisma.$transaction(async tx => {
            await tx.customRole.delete({ where: { id: role.id } })
            await audit(tx, {
                actorId: g.access.userId, actorName: g.access.name, action: "role.delete", targetType: "Role",
                targetId: role.id, targetName: role.name, summary: `${role.name}: deleted`,
                before: roleSnapshot(role, isScope(meta?.scope) ? meta!.scope as DataScope : null), ...requestMeta(req),
            })
        })
        return new NextResponse(null, { status: 204 })
    } catch (e) {
        return ruleResponse(e, "[ROLE_DELETE]")
    }
}
