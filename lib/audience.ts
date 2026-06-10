import prisma from "@/lib/prisma"
import { Session } from "next-auth"
import { checkAccess } from "@/lib/permissions"
import { resolveUserId } from "@/lib/resolveUserId"

/**
 * Build a Prisma `where` fragment that limits rows (Announcement / Holiday) to
 * those targeted at the viewing user's site and/or custom role.
 *
 * Targeting model — each row has `targetSiteIds` and `targetRoleIds` (String[]):
 *   • empty array on a dimension  → no restriction on that dimension
 *   • a row is visible to an employee when
 *       (no site target OR one of their active sites matches)  AND
 *       (no role target OR their custom role matches)
 *
 * Returns `null` for users who manage announcements (ADMIN / anyone with
 * announcements.manage) — they see everything so they can administer it.
 */
export async function audienceWhere(session: Session | null): Promise<any | null> {
    if (!session) return { AND: [{ targetSiteIds: { isEmpty: true } }, { targetRoleIds: { isEmpty: true } }] }
    if (checkAccess(session, ["MANAGER", "HR_MANAGER"], "announcements.manage")) return null

    const uid = await resolveUserId(session)
    let siteIds: string[] = []
    let roleId: string | null = null

    if (uid) {
        const user = await prisma.user.findUnique({ where: { id: uid }, select: { customRoleId: true } })
        roleId = user?.customRoleId ?? null
        const emp = await prisma.employee.findFirst({
            where: { userId: uid },
            select: { deployments: { where: { isActive: true }, select: { siteId: true } } },
        })
        siteIds = emp?.deployments.map(d => d.siteId) ?? []
    }

    const siteClause = siteIds.length
        ? { OR: [{ targetSiteIds: { isEmpty: true } }, { targetSiteIds: { hasSome: siteIds } }] }
        : { targetSiteIds: { isEmpty: true } }

    const roleClause = roleId
        ? { OR: [{ targetRoleIds: { isEmpty: true } }, { targetRoleIds: { has: roleId } }] }
        : { targetRoleIds: { isEmpty: true } }

    return { AND: [siteClause, roleClause] }
}

/** Normalise an incoming targeting value to a clean string[] (or []). */
export function cleanIdArray(v: unknown): string[] {
    if (!Array.isArray(v)) return []
    return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
}
