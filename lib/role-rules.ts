// ─── Rules that cannot be broken (Role & User Manager spec) ──────────────────
// • A user cannot grant a permission they do not hold themselves.
// • Only Admin can assign the Admin role.
// • The last active Admin cannot be deactivated or demoted.
// Every route that changes a role's permissions or a user's role calls these,
// so the same answer comes back however the change is attempted.

import prisma from "@/lib/prisma"
import { type Access, has } from "@/lib/access"
import { toCataloguePermissions, isCataloguePermission } from "@/lib/permission-catalogue"

/** The id the UI and APIs use for the built-in Admin role (base role ADMIN). */
export const ADMIN_ROLE_ID = "admin"

export class RuleError extends Error {
    constructor(public status: number, message: string) { super(message) }
}

/** May this caller assign roles to users at all? */
export function canAssignRoles(access: Access): boolean {
    return access.isAdmin || has(access, "users.edit") || has(access, "users.manage")
}

/**
 * Permissions in `wanted` the caller does not hold. Admin holds everything.
 * Both sides are compared as catalogue keys, so a role saved before the
 * catalogue (leaves.manage…) and one saved after (leaves.create…) compare alike.
 */
export function missingGrants(access: Access, wanted: string[]): string[] {
    if (access.isAdmin) return []
    const held = new Set(toCataloguePermissions(access.permissions))
    for (const p of access.permissions) if (isCataloguePermission(p)) held.add(p)
    return toCataloguePermissions(wanted).filter(p => p !== "self.view" && !held.has(p))
}

/** Unknown permission strings in a role save (the API rejects them). */
export function unknownPermissions(perms: string[]): string[] {
    return perms.filter(p => !isCataloguePermission(p))
}

/**
 * Throws unless `access` may put someone on `roleId` ("admin" = the Admin
 * system role, null/"" = no role).
 */
export async function assertCanAssignRole(access: Access, roleId: string | null | undefined) {
    if (!canAssignRoles(access)) throw new RuleError(403, "You cannot change user roles.")
    if (!roleId) return
    if (roleId === ADMIN_ROLE_ID) {
        if (!access.isAdmin) throw new RuleError(403, "Only an Admin can assign the Admin role.")
        return
    }
    const role = await prisma.customRole.findUnique({ where: { id: roleId }, select: { name: true, permissions: true, isActive: true } })
    if (!role) throw new RuleError(400, "That role does not exist.")
    if (!role.isActive) throw new RuleError(400, `${role.name} is switched off. Pick another role.`)
    const missing = missingGrants(access, role.permissions)
    if (missing.length) {
        throw new RuleError(403, `${role.name} holds ${missing.length} permission${missing.length === 1 ? "" : "s"} you do not have (${missing.slice(0, 4).join(", ")}${missing.length > 4 ? "…" : ""}).`)
    }
}

/** Active users on the Admin role other than `exceptUserIds`. */
export async function otherActiveAdmins(exceptUserIds: string[]): Promise<number> {
    return prisma.user.count({ where: { role: "ADMIN", isActive: true, id: { notIn: exceptUserIds } } })
}

/** Throws when demoting or disabling these users would leave no active Admin. */
export async function assertKeepsAnAdmin(userIds: string[]) {
    const admins = await prisma.user.count({ where: { role: "ADMIN", isActive: true, id: { in: userIds } } })
    if (admins === 0) return
    if ((await otherActiveAdmins(userIds)) === 0) {
        throw new RuleError(409, "This is the last active Admin. Make someone else an Admin first.")
    }
}
