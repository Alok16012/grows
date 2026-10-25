// Access facts the session token carries, resolved at sign-in and on refresh.
// Kept apart from lib/access (which imports the session helpers) so lib/auth
// can use it without an import cycle.

import prisma from "@/lib/prisma"
import { type DataScope, isScope, expandPermissions } from "@/lib/permission-catalogue"

/** Scope stored for a custom role; null = no RoleMeta row or table not installed. */
export async function roleScope(roleId: string | null | undefined): Promise<DataScope | null> {
    if (!roleId) return null
    try {
        const meta = await prisma.roleMeta.findUnique({ where: { roleId }, select: { scope: true } })
        return isScope(meta?.scope) ? meta!.scope as DataScope : null
    } catch {
        return null
    }
}

/** Sites a user covers (site team membership). */
export async function userSiteIds(userId: string): Promise<string[]> {
    try {
        const rows = await prisma.siteAssignment.findMany({
            where: { userId, status: "active" },
            select: { siteId: true },
        })
        return rows.map(r => r.siteId)
    } catch {
        return []
    }
}

/**
 * Everything the session carries about access. Base role ADMIN is the system
 * Admin role. A custom role without a RoleMeta row keeps the behaviour it had
 * before the role manager: everything it holds, company-wide.
 */
export async function resolveAccess(user: {
    id: string
    role: string
    customRoleId?: string | null
    customRole?: { isActive: boolean; permissions: string[] } | null
}): Promise<{ permissions: string[]; scope: DataScope; siteIds: string[] }> {
    if (user.role === "ADMIN") return { permissions: ["self.view"], scope: "ALL", siteIds: [] }
    const active = user.customRole?.isActive ? user.customRole : null
    if (!active) return { permissions: ["self.view"], scope: "SELF", siteIds: [] }
    const stored = await roleScope(user.customRoleId)
    const scope = stored ?? "ALL"
    const siteIds = scope === "ASSIGNED_SITES" ? await userSiteIds(user.id) : []
    const permissions = expandPermissions(active.permissions, scope)
    // A role not yet saved in the role editor predates the sensitive-field
    // switches. Keep the fields its people already work with (HR editing an
    // employee, payroll building bank sheets) and mask them for view-only roles.
    if (!stored) permissions.push(...legacySensitive(active.permissions))
    return { permissions: Array.from(new Set(permissions)), scope, siteIds }
}

function legacySensitive(perms: string[]): string[] {
    const out: string[] = []
    // Exporting was part of viewing before export became its own action.
    if (perms.includes("employees.view")) out.push("employees.export")
    if (["employees.create", "employees.edit", "onboarding.manage"].some(p => perms.includes(p))) {
        out.push("employees.viewKyc", "employees.viewBank", "employees.viewPersonal")
    }
    if (["payroll.view", "payroll.manage"].some(p => perms.includes(p))) {
        out.push("employees.viewKyc", "employees.viewBank")
    }
    // Locking, reopening and paying a month were all "process payroll" before
    // they became separate switches.
    if (perms.includes("payroll.manage")) out.push("payroll.lock", "payroll.unlock", "payroll.markPaid")
    return out
}

/** Current access version; 0 when the user has no row or the table is missing. */
export async function accessVersion(userId: string): Promise<number> {
    try {
        const row = await prisma.userAccess.findUnique({ where: { userId }, select: { permissionsVersion: true } })
        return row?.permissionsVersion ?? 0
    } catch {
        return 0
    }
}

/** Set by Users → Create / Edit with an initial password; cleared once replaced. */
export async function mustChangePasswordFor(userId: string): Promise<boolean> {
    try {
        const row = await prisma.userAccess.findUnique({ where: { userId }, select: { mustChangePassword: true } })
        return !!row?.mustChangePassword
    } catch {
        return false
    }
}
