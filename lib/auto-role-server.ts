// Login role by designation — work out the role, apply it to a login (with the
// same access refresh and audit trail as a manual change), list mismatches.
import prisma from "@/lib/prisma"
import { audit, bumpAccessVersion, type Access } from "@/lib/access"
import { assertCanAssignRole, RuleError } from "@/lib/role-rules"
import { foldDesignation, matchDesignation, type DesignationEntry } from "@/lib/people-masters"
import { getDesignations } from "@/lib/people-masters-server"
import { sanitizeAutoRole, type AutoRoleSettings } from "@/lib/auto-role"

const KEY = "autoRoleSettings"

export async function getAutoRole(): Promise<AutoRoleSettings> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: KEY } })
        return sanitizeAutoRole(row?.value ? JSON.parse(row.value) : {})
    } catch { return sanitizeAutoRole({}) }
}

/** Saving needs the right to assign every role it maps to (same rule as the Users screen). */
export async function saveAutoRole(input: unknown, access: Access): Promise<AutoRoleSettings> {
    const s = sanitizeAutoRole(input)
    const used = Array.from(new Set([...Object.values(s.map), ...(s.defaultRoleId ? [s.defaultRoleId] : [])]))
    for (const r of used) await assertCanAssignRole(access, r)
    const live = new Set((await prisma.customRole.findMany({ where: { id: { in: [...used, ...s.protectedRoleIds] } }, select: { id: true } })).map(r => r.id))
    for (const [k, r] of Object.entries(s.map)) if (!live.has(r)) delete s.map[k]
    if (s.defaultRoleId && !live.has(s.defaultRoleId)) s.defaultRoleId = null
    s.protectedRoleIds = s.protectedRoleIds.filter(r => live.has(r))
    const value = JSON.stringify(s)
    await prisma.appSetting.upsert({ where: { key: KEY }, update: { value, updatedBy: access.userId }, create: { key: KEY, value, updatedBy: access.userId } })
    return s
}

/** The role a designation should have (its standard designation's mapping, else the default). */
export function roleFor(designation: string | null | undefined, s: AutoRoleSettings, master: DesignationEntry[]): string | null {
    const std = matchDesignation(master, designation)
    return (std ? s.map[foldDesignation(std.name)] : undefined) ?? s.map[foldDesignation(designation)] ?? s.defaultRoleId
}

type Actor = { id: string | null; name: string | null }

async function setRole(userId: string, userName: string | null, from: string | null, to: string, reason: string, actor: Actor, names: Map<string, string>) {
    await prisma.$transaction(async tx => {
        await tx.user.update({ where: { id: userId }, data: { role: "MANAGER", customRoleId: to } })
        await bumpAccessVersion(tx, [userId])
        await audit(tx, {
            actorId: actor.id, actorName: actor.name ?? "Auto role", action: "user.auto_role", targetType: "User", targetId: userId, targetName: userName,
            summary: `${userName ?? "Login"}: role ${from ? names.get(from) ?? from : "none"} → ${names.get(to) ?? to} (${reason})`,
            before: { role: from }, after: { role: to },
        })
    })
}

/**
 * Give one employee's login the role of their designation.
 *  - a login with no role always gets it;
 *  - after a designation change (oldDesignation given) the role follows only
 *    if it was still the old designation's role or the default — a role given
 *    by hand stays; - Admin logins and protected roles are never changed.
 */
export async function applyAutoRole(employeeId: string, opts: { oldDesignation?: string | null; reason: string; actor?: Actor }) {
    const s = await getAutoRole()
    if (!s.enabled) return null
    const e = await prisma.employee.findUnique({ where: { id: employeeId }, select: { designation: true, userId: true, user: { select: { id: true, name: true, role: true, customRoleId: true } } } })
    const u = e?.user
    if (!u || u.role === "ADMIN") return null
    if (u.customRoleId && s.protectedRoleIds.includes(u.customRoleId)) return null
    const master = await getDesignations()
    const target = roleFor(e!.designation, s, master)
    if (!target || target === u.customRoleId) return null
    let allowed = !u.customRoleId
    if (!allowed && opts.oldDesignation !== undefined && s.followDesignation) {
        const old = roleFor(opts.oldDesignation, s, master)
        allowed = u.customRoleId === old || u.customRoleId === s.defaultRoleId
    }
    if (!allowed) return null
    const names = new Map((await prisma.customRole.findMany({ where: { id: { in: [target, ...(u.customRoleId ? [u.customRoleId] : [])] } }, select: { id: true, name: true } })).map(r => [r.id, r.name]))
    await setRole(u.id, u.name, u.customRoleId, target, opts.reason, opts.actor ?? { id: null, name: "Auto role" }, names)
    return { from: u.customRoleId, to: target }
}

/** Best effort wrapper for hooks — never fails the action that triggered it. */
export async function applyAutoRoleSafe(employeeId: string, opts: { oldDesignation?: string | null; reason: string; actor?: Actor }) {
    try { return await applyAutoRole(employeeId, opts) } catch (e) { console.error("[AUTO_ROLE]", e); return null }
}

export type RoleRow = { employeeId: string; code: string; name: string; designation: string | null; site: string | null; userId: string; current: string | null; currentName: string | null; target: string | null; targetName: string | null; locked: string | null }

/** Every login whose role differs from its designation's role (protected / admin ones flagged, not offered). */
export async function roleMismatches() {
    const s = await getAutoRole()
    const [master, roles, emps] = await Promise.all([
        getDesignations(),
        prisma.customRole.findMany({ select: { id: true, name: true } }),
        prisma.employee.findMany({
            where: { status: { in: ["ACTIVE", "ON_LEAVE", "ONBOARDING"] }, userId: { not: null } },
            select: { id: true, employeeId: true, firstName: true, lastName: true, designation: true, user: { select: { id: true, role: true, customRoleId: true, isActive: true } }, deployments: { where: { isActive: true }, select: { site: { select: { name: true } } }, take: 1 } },
        }),
    ])
    const roleName = new Map(roles.map(r => [r.id, r.name]))
    const rows: RoleRow[] = []
    for (const e of emps) {
        const u = e.user
        if (!u) continue
        const target = roleFor(e.designation, s, master)
        if (!target || target === u.customRoleId) continue
        const locked = u.role === "ADMIN" ? "Admin login" : u.customRoleId && s.protectedRoleIds.includes(u.customRoleId) ? "Protected role" : null
        rows.push({
            employeeId: e.id, code: e.employeeId, name: `${e.firstName} ${e.lastName ?? ""}`.trim(), designation: e.designation, site: e.deployments[0]?.site?.name ?? null,
            userId: u.id, current: u.customRoleId, currentName: u.role === "ADMIN" ? "Admin" : u.customRoleId ? roleName.get(u.customRoleId) ?? null : null, target, targetName: roleName.get(target) ?? null, locked,
        })
    }
    rows.sort((a, b) => Number(!!a.locked) - Number(!!b.locked) || (a.designation ?? "").localeCompare(b.designation ?? "") || a.name.localeCompare(b.name))
    return { settings: s, rows }
}

/** Apply the designation role to the chosen logins (from the mismatch list). */
export async function applyRoleFix(employeeIds: string[], access: Access) {
    const s = await getAutoRole()
    const want = new Set(employeeIds)
    const { rows } = await roleMismatches()
    const todo = rows.filter(r => want.has(r.employeeId) && !r.locked && r.target)
    const targets = Array.from(new Set(todo.map(r => r.target!)))
    for (const t of targets) await assertCanAssignRole(access, t)
    const names = new Map((await prisma.customRole.findMany({ select: { id: true, name: true } })).map(r => [r.id, r.name]))
    let changed = 0
    for (const r of todo) { await setRole(r.userId, r.name, r.current, r.target!, `matched to designation ${r.designation ?? "—"}`, { id: access.userId, name: access.name }, names); changed++ }
    void s // fixing by hand works even with automatic roles off
    return { changed, skipped: employeeIds.length - changed }
}

/** Daily safety net: any login without a role gets its designation's role. */
export async function assignMissingRoles() {
    const s = await getAutoRole()
    if (!s.enabled) return 0
    const emps = await prisma.employee.findMany({ where: { status: { in: ["ACTIVE", "ON_LEAVE", "ONBOARDING"] }, user: { customRoleId: null, role: { not: "ADMIN" } } }, select: { id: true }, take: 500 })
    let n = 0
    for (const e of emps) if (await applyAutoRoleSafe(e.id, { reason: "login had no role" })) n++
    return n
}

export { RuleError }
