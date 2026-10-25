// Shared pieces of the Roles API (app/api/admin/roles…).

import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { type Access, accessTablesReady, ACCESS_NOT_SET_UP } from "@/lib/access"
import { RuleError, missingGrants, unknownPermissions, ADMIN_ROLE_ID } from "@/lib/role-rules"
import {
    type DataScope, isScope, normalizePermissions, toCataloguePermissions, allCataloguePermissions,
} from "@/lib/permission-catalogue"

export type RoleInput = {
    name: string
    description: string
    color: string
    scope: DataScope
    permissions: string[]
    isActive: boolean
}

const HEX = /^#[0-9a-f]{6}$/i

/** Validate a create / edit body. Throws RuleError with a message for the form. */
export function parseRoleInput(body: unknown, access: Access): RoleInput {
    const b = (body ?? {}) as Record<string, unknown>
    const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ") : ""
    const description = typeof b.description === "string" ? b.description.trim() : ""
    if (!name) throw new RuleError(400, "Role name is required.")
    if (name.length > 60) throw new RuleError(400, "Role name must be 60 characters or fewer.")
    if (name.toLowerCase() === "admin" || name.toLowerCase() === "administrator") {
        throw new RuleError(400, "Admin is the built-in system role. Pick another name.")
    }
    if (!description) throw new RuleError(400, "Description is required.")
    if (description.length > 240) throw new RuleError(400, "Description must be 240 characters or fewer.")
    const color = typeof b.color === "string" && HEX.test(b.color) ? b.color : "#6366f1"
    if (!isScope(b.scope)) throw new RuleError(400, "Pick which records this role can see.")
    const raw = Array.isArray(b.permissions) ? b.permissions.filter((p): p is string => typeof p === "string") : []
    const unknown = unknownPermissions(raw)
    if (unknown.length) throw new RuleError(400, `Unknown permission${unknown.length === 1 ? "" : "s"}: ${unknown.slice(0, 5).join(", ")}`)
    const permissions = normalizePermissions(raw)
    const missing = missingGrants(access, permissions)
    if (missing.length) {
        throw new RuleError(403, `You cannot grant permissions you do not hold: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}`)
    }
    return { name, description, color, scope: b.scope, permissions, isActive: b.isActive !== false }
}

export async function assertNameFree(name: string, exceptId?: string) {
    const clash = await prisma.customRole.findFirst({
        where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
        select: { id: true },
    })
    if (clash) throw new RuleError(409, "A role with this name already exists.")
}

export async function requireAccessTables() {
    if (!(await accessTablesReady())) throw new RuleError(503, ACCESS_NOT_SET_UP)
}

export function ruleResponse(e: unknown, tag: string) {
    if (e instanceof RuleError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(tag, e)
    return NextResponse.json({ error: "Internal Error" }, { status: 500 })
}

/** What the audit log and the save summary record about a role. */
export function roleSnapshot(r: { name: string; description: string | null; color: string; isActive: boolean; permissions: string[] }, scope: DataScope | null) {
    return {
        name: r.name, description: r.description, color: r.color, isActive: r.isActive,
        scope: scope ?? "ALL (not set)", permissions: [...r.permissions].sort(),
    }
}

export function diffSummary(before: { permissions: string[]; scope: string } | null, after: { permissions: string[]; scope: string }, users: number) {
    const b = new Set(before?.permissions ?? [])
    const a = new Set(after.permissions)
    const added = after.permissions.filter(p => !b.has(p))
    const removed = (before?.permissions ?? []).filter(p => !a.has(p))
    const parts: string[] = []
    if (added.length) parts.push(`+${added.length} permission${added.length === 1 ? "" : "s"}`)
    if (removed.length) parts.push(`−${removed.length} permission${removed.length === 1 ? "" : "s"}`)
    if (before && before.scope !== after.scope) parts.push(`scope ${before.scope} → ${after.scope}`)
    parts.push(`affects ${users} user${users === 1 ? "" : "s"}`)
    return { added, removed, text: parts.join(", ") }
}

// ─── Listing ─────────────────────────────────────────────────────────────────

export type RoleCard = {
    id: string
    name: string
    description: string | null
    color: string
    isActive: boolean
    isSystem: boolean
    scope: DataScope | null
    // True for a role saved before the role manager (no stored scope and older
    // permission keys). Saving it in the editor converts it.
    legacy: boolean
    permissions: string[]
    permissionCount: number
    users: number
    activeUsers: number
    updatedAt: string | null
}

export async function listRoleCards(): Promise<RoleCard[]> {
    const roles = await prisma.customRole.findMany({ orderBy: { createdAt: "asc" } })
    const metas = await prisma.roleMeta.findMany().catch(() => [] as { roleId: string; scope: string; isSystem: boolean }[])
    const metaBy = new Map(metas.map(m => [m.roleId, m]))
    const counts = await prisma.user.groupBy({ by: ["customRoleId", "isActive"], where: { customRoleId: { not: null }, role: { not: "ADMIN" } }, _count: { _all: true } })
    const tally = (id: string, activeOnly: boolean) =>
        counts.filter(c => c.customRoleId === id && (!activeOnly || c.isActive)).reduce((n, c) => n + c._count._all, 0)

    const [admins, activeAdmins] = await Promise.all([
        prisma.user.count({ where: { role: "ADMIN" } }),
        prisma.user.count({ where: { role: "ADMIN", isActive: true } }),
    ])
    const adminCard: RoleCard = {
        id: ADMIN_ROLE_ID, name: "Admin", description: "Everything, including roles and users. Cannot be edited or deleted.",
        color: "#0f172a", isActive: true, isSystem: true, scope: "ALL", legacy: false,
        permissions: allCataloguePermissions(), permissionCount: allCataloguePermissions().length,
        users: admins, activeUsers: activeAdmins, updatedAt: null,
    }

    return [adminCard, ...roles.map(r => {
        const meta = metaBy.get(r.id)
        const catalogue = toCataloguePermissions(r.permissions)
        return {
            id: r.id, name: r.name, description: r.description, color: r.color, isActive: r.isActive,
            isSystem: !!meta?.isSystem, scope: isScope(meta?.scope) ? meta!.scope as DataScope : null, legacy: !meta,
            permissions: catalogue, permissionCount: catalogue.filter(p => p !== "self.view").length,
            users: tally(r.id, false), activeUsers: tally(r.id, true), updatedAt: r.updatedAt.toISOString(),
        }
    })]
}
