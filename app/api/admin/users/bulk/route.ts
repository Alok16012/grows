import { NextResponse } from "next/server"
import { randomUUID } from "crypto"
import prisma from "@/lib/prisma"
import { guard, has, accessTablesReady, audit, requestMeta, bumpAccessVersion } from "@/lib/access"
import { assertCanAssignRole, assertKeepsAnAdmin, ADMIN_ROLE_ID, RuleError } from "@/lib/role-rules"
import { ruleResponse } from "@/lib/role-admin"
import { parseSiteIds, assertSitesExist, setUserSites } from "@/lib/user-admin"

// Bulk actions on selected users: change role, assign sites, disable, enable.
// More than 20 users needs the count typed back (`confirm`). One audit row per
// user, all sharing a batch id.
const LIMIT_WITHOUT_CONFIRM = 20
const MAX_USERS = 1000

export async function POST(req: Request) {
    const g = await guard(req, ["users.edit", "users.deactivate"])
    if (g instanceof NextResponse) return g
    try {
        if (!(await accessTablesReady())) throw new RuleError(503, "Run scripts/role-manager.sql first — bulk changes are written to the audit log.")
        const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
        const action = b.action
        const ids = Array.isArray(b.userIds) ? Array.from(new Set(b.userIds.filter((x): x is string => typeof x === "string"))) : []
        if (!ids.length) throw new RuleError(400, "Select at least one user.")
        if (ids.length > MAX_USERS) throw new RuleError(400, `At most ${MAX_USERS} users at a time.`)
        if (ids.length > LIMIT_WITHOUT_CONFIRM && Number(b.confirm) !== ids.length) {
            throw new RuleError(400, `Type ${ids.length} to confirm a change to ${ids.length} users.`)
        }
        if (action !== "role" && action !== "sites" && action !== "disable" && action !== "enable") throw new RuleError(400, "Unknown bulk action.")
        if ((action === "disable" || action === "enable") && !has(g.access, "users.deactivate")) throw new RuleError(403, "You cannot enable or disable users.")
        if ((action === "role" || action === "sites") && !has(g.access, "users.edit")) throw new RuleError(403, "You cannot edit users.")

        const users = await prisma.user.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true, role: true, customRoleId: true, isActive: true, siteMemberships: { where: { status: "active" }, select: { siteId: true } } },
        })
        if (users.length !== ids.length) throw new RuleError(400, "Some selected users no longer exist. Reload and try again.")

        let roleId: string | null = null
        let siteIds: string[] = []
        if (action === "role") {
            roleId = typeof b.roleId === "string" && b.roleId ? b.roleId : null
            if (!roleId) throw new RuleError(400, "Choose a role.")
            await assertCanAssignRole(g.access, roleId)
            const admins = users.filter(u => u.role === "ADMIN")
            if (admins.length && roleId !== ADMIN_ROLE_ID) {
                if (!g.access.isAdmin) throw new RuleError(403, "Only an Admin can change an Admin's role.")
                await assertKeepsAnAdmin(admins.map(a => a.id))
            }
        }
        if (action === "sites") {
            siteIds = parseSiteIds(b.siteIds) ?? []
            await assertSitesExist(siteIds)
        }
        if (action === "disable") {
            if (ids.includes(g.access.userId)) throw new RuleError(400, "You cannot disable your own account.")
            if (users.some(u => u.role === "ADMIN") && !g.access.isAdmin) throw new RuleError(403, "Only an Admin can disable an Admin.")
            await assertKeepsAnAdmin(ids)
        }

        const batchId = randomUUID()
        const meta = requestMeta(req)
        await prisma.$transaction(async tx => {
            for (const u of users) {
                const beforeRole = u.role === "ADMIN" ? ADMIN_ROLE_ID : u.customRoleId
                if (action === "role") {
                    if (beforeRole === roleId) continue
                    await tx.user.update({
                        where: { id: u.id },
                        data: roleId === ADMIN_ROLE_ID ? { role: "ADMIN", customRoleId: null } : { role: "MANAGER", customRoleId: roleId },
                    })
                    await audit(tx, { actorId: g.access.userId, actorName: g.access.name, action: "user.bulk", targetType: "User", targetId: u.id, targetName: u.name, summary: `${u.name}: role changed (bulk)`, before: { role: beforeRole }, after: { role: roleId }, batchId, ...meta })
                } else if (action === "sites") {
                    const r = await setUserSites(tx, u.id, siteIds, g.access.userId)
                    if (JSON.stringify(r.before) === JSON.stringify(r.after)) continue
                    await audit(tx, { actorId: g.access.userId, actorName: g.access.name, action: "user.bulk", targetType: "User", targetId: u.id, targetName: u.name, summary: `${u.name}: sites changed (bulk)`, before: { sites: r.before }, after: { sites: r.after }, batchId, ...meta })
                } else {
                    const enable = action === "enable"
                    if (u.isActive === enable) continue
                    await tx.user.update({ where: { id: u.id }, data: { isActive: enable } })
                    await audit(tx, { actorId: g.access.userId, actorName: g.access.name, action: "user.bulk", targetType: "User", targetId: u.id, targetName: u.name, summary: `${u.name}: ${enable ? "enabled" : "disabled"} (bulk)`, before: { status: u.isActive ? "Active" : "Disabled" }, after: { status: enable ? "Active" : "Disabled" }, batchId, ...meta })
                }
            }
            await bumpAccessVersion(tx, ids)
        }, { timeout: 60_000 })
        return NextResponse.json({ ok: true, batchId, users: users.length })
    } catch (e) {
        return ruleResponse(e, "[USERS_BULK]")
    }
}
