import prisma from "@/lib/prisma"
import { RuleError } from "@/lib/role-rules"

// An employee's "Reports to" (Employee.managerId) holds a login (User) id, not
// an employee id: the My-team data scope (lib/access employeeScope) matches it
// against the signed-in user. The employee form showed it as a raw id in a
// free-text box that the save routes then ignored, so it could be neither read
// nor changed after joining.

export type ManagerOption = { id: string; name: string; role: string; active: boolean }

/**
 * People who can be picked as a manager: active logins on office roles (or
 * Admin). Field roles — scoped to their assigned sites or to themselves, like
 * Quality Engineer — are left out: hundreds of inspectors would bury the dozen
 * people anyone reports to. `alwaysInclude` keeps a current manager listed even
 * if they no longer qualify (left, role changed), so the form can still name them.
 * Only id, name and role go out — never login ids or contact details.
 */
export async function managerOptions(alwaysInclude: string[] = []): Promise<ManagerOption[]> {
    const fieldRoleIds = (await prisma.roleMeta.findMany({
        where: { scope: { in: ["ASSIGNED_SITES", "SELF"] } },
        select: { roleId: true },
    }).catch(() => [] as { roleId: string }[])).map(m => m.roleId)
    const users = await prisma.user.findMany({
        where: {
            OR: [
                { isActive: true, role: { not: "CLIENT" }, NOT: { customRoleId: { in: fieldRoleIds } } },
                ...(alwaysInclude.length ? [{ id: { in: alwaysInclude } }] : []),
            ],
        },
        select: { id: true, name: true, role: true, isActive: true, customRole: { select: { name: true } } },
        orderBy: { name: "asc" },
    })
    return users
        .filter(u => u.role === "ADMIN" || u.customRole || alwaysInclude.includes(u.id))
        .map(u => ({ id: u.id, name: u.name || "Unnamed", role: u.role === "ADMIN" ? "Admin" : u.customRole?.name ?? u.role, active: u.isActive }))
}

/**
 * The managerId to store for a save body value: undefined = leave as is,
 * "" / null = no manager, otherwise an existing login that isn't the
 * employee's own. Throws RuleError (400) for anything else.
 */
export async function resolveManagerId(value: unknown, ownUserId?: string | null): Promise<string | null | undefined> {
    if (value === undefined) return undefined
    if (value === null || value === "") return null
    if (typeof value !== "string") throw new RuleError(400, "Reports to must be a person picked from the list.")
    if (ownUserId && value === ownUserId) throw new RuleError(400, "An employee can't report to themselves.")
    const user = await prisma.user.findUnique({ where: { id: value }, select: { id: true } })
    if (!user) throw new RuleError(400, "Reports to: that person no longer exists. Pick someone else.")
    return value
}
