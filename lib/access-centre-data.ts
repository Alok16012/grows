// Admin → Access centre: what each tab shows, and the fixes it offers.
import prisma from "@/lib/prisma"
import { audit, bumpAccessVersion } from "@/lib/access"
import { buildLoginEmail, NO_PASSWORD } from "@/lib/credentials"
import { clearFailedLogins } from "@/lib/login-security"
import { signOutEverywhere } from "@/lib/user-activity"
import { applyAutoRoleSafe } from "@/lib/auto-role-server"
import { notifyApprovers } from "@/lib/hr-notify"
import { getAccessCentre, trackingSince, getReviews } from "@/lib/access-centre-server"

const DAY = 86_400_000
const LIVE_EMP = ["ACTIVE", "ON_LEAVE", "ONBOARDING"]
type Actor = { id: string; name: string }

// ─── Activity ────────────────────────────────────────────────────────────────

export async function activity(now = new Date()) {
    const since = await trackingSince()
    const [users, acts, roles] = await Promise.all([
        prisma.user.findMany({
            where: { isActive: true },
            select: { id: true, name: true, email: true, role: true, customRoleId: true, createdAt: true, access: { select: { lastLoginAt: true } }, employeeProfile: { select: { employeeId: true, designation: true, status: true, deployments: { where: { isActive: true }, select: { site: { select: { name: true } } }, take: 1 } } } },
        }),
        prisma.userActivity.findMany({ select: { userId: true, lastSeenAt: true, lastSeenVia: true } }).catch(() => []),
        prisma.customRole.findMany({ select: { id: true, name: true } }),
    ])
    const actOf = new Map(acts.map(a => [a.userId, a]))
    const roleName = new Map(roles.map(r => [r.id, r.name]))
    const rows = users.map(u => {
        const a = actOf.get(u.id)
        const seen = [a?.lastSeenAt, u.access?.lastLoginAt].filter((d): d is Date => !!d).sort((x, y) => y.getTime() - x.getTime())[0] ?? null
        const idleFrom = seen ?? (u.createdAt > since ? u.createdAt : since)
        const idleDays = Math.floor((now.getTime() - idleFrom.getTime()) / DAY)
        return {
            userId: u.id, name: u.name, loginId: u.email, isAdmin: u.role === "ADMIN", roleId: u.customRoleId,
            role: u.role === "ADMIN" ? "Admin" : u.customRoleId ? roleName.get(u.customRoleId) ?? "—" : "No role",
            code: u.employeeProfile?.employeeId ?? null, designation: u.employeeProfile?.designation ?? null, site: u.employeeProfile?.deployments[0]?.site?.name ?? null,
            lastSeen: seen?.toISOString() ?? null, via: a?.lastSeenVia ?? null, idleDays, neverSeen: !seen,
        }
    }).sort((a, b) => b.idleDays - a.idleDays)
    const band = (lo: number, hi: number) => rows.filter(r => !r.neverSeen && r.idleDays >= lo && r.idleDays < hi).length
    return {
        trackingSince: since.toISOString().slice(0, 10),
        summary: { logins: rows.length, last7: band(0, 7), d7to30: band(7, 30), d30to90: band(30, 90), over90: rows.filter(r => !r.neverSeen && r.idleDays >= 90).length, neverSeen: rows.filter(r => r.neverSeen).length, app: rows.filter(r => r.via === "app").length, web: rows.filter(r => r.via === "web").length },
        rows,
    }
}

/** Daily: disable logins idle longer than the setting (never Admins, exempt roles, or anyone seen recently). */
export async function disableIdleLogins(now = new Date()) {
    const s = await getAccessCentre()
    if (!s.idleDisableDays) return 0
    const { rows } = await activity(now)
    const victims = rows.filter(r => !r.isAdmin && r.idleDays >= s.idleDisableDays && !(r.roleId && s.idleExemptRoleIds.includes(r.roleId)))
    if (!victims.length) return 0
    const ids = victims.slice(0, 200).map(v => v.userId)
    await prisma.$transaction(async tx => {
        await tx.user.updateMany({ where: { id: { in: ids }, role: { not: "ADMIN" } }, data: { isActive: false } })
        await bumpAccessVersion(tx, ids)
        await audit(tx, { actorName: "Daily job", action: "user.idle_disable", targetType: "User", targetName: `${ids.length} login(s)`, summary: `Disabled ${ids.length} login(s) not used for ${s.idleDisableDays}+ days`, after: { userIds: ids } })
    })
    return ids.length
}

// ─── Login health ────────────────────────────────────────────────────────────

const last10 = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "").slice(-10)

export async function loginHealth() {
    const [emps, users] = await Promise.all([
        prisma.employee.findMany({ where: { status: { in: LIVE_EMP as any } }, select: { id: true, employeeId: true, firstName: true, lastName: true, status: true, phone: true, designation: true, userId: true, user: { select: { id: true, isActive: true, role: true, customRoleId: true, phone: true, email: true, access: { select: { userId: true } } } } } }),
        prisma.user.findMany({ where: { isActive: true, role: { not: "ADMIN" } }, select: { id: true, name: true, email: true, phone: true, employeeProfile: { select: { id: true } } } }),
    ])
    const name = (e: { firstName: string; lastName: string | null }) => `${e.firstName} ${e.lastName ?? ""}`.trim()
    const issues: { kind: string; label: string; employeeId: string | null; userId: string | null; code: string | null; name: string; detail: string; fix: string | null }[] = []
    for (const e of emps) {
        const u = e.user
        if (!u) { if (e.status !== "ONBOARDING") issues.push({ kind: "NO_LOGIN", label: "No login", employeeId: e.id, userId: null, code: e.employeeId, name: name(e), detail: e.designation ?? "", fix: "createLogin" }); continue }
        if (!u.isActive && e.status !== "ONBOARDING") issues.push({ kind: "DISABLED", label: "Employed but login disabled", employeeId: e.id, userId: u.id, code: e.employeeId, name: name(e), detail: `${e.status.toLowerCase()} employee cannot sign in`, fix: "enable" })
        if (u.isActive && u.role !== "ADMIN" && !u.customRoleId) issues.push({ kind: "NO_ROLE", label: "Login without a role", employeeId: e.id, userId: u.id, code: e.employeeId, name: name(e), detail: e.designation ?? "", fix: "autoRole" })
        if (u.isActive && last10(e.phone).length === 10 && last10(u.phone).length === 10 && last10(e.phone) !== last10(u.phone)) issues.push({ kind: "PHONE", label: "Login phone ≠ employee phone", employeeId: e.id, userId: u.id, code: e.employeeId, name: name(e), detail: "OTP goes to the login's phone", fix: "syncPhone" })
        if (u.isActive && !u.access) issues.push({ kind: "NO_ACCESS", label: "Login settings missing", employeeId: e.id, userId: u.id, code: e.employeeId, name: name(e), detail: "No sign-in method recorded", fix: "addAccess" })
    }
    // Non-admin logins with no employee behind them.
    for (const u of users) if (!u.employeeProfile) issues.push({ kind: "ORPHAN", label: "Login with no employee", employeeId: null, userId: u.id, code: null, name: u.name ?? u.email, detail: u.email, fix: null })
    // Same phone on several active logins.
    const byPhone = new Map<string, typeof users>()
    for (const u of users) { const k = last10(u.phone); if (k.length === 10) byPhone.set(k, [...(byPhone.get(k) ?? []), u]) }
    for (const list of Array.from(byPhone.values())) if (list.length > 1) for (const u of list) issues.push({ kind: "SHARED_PHONE", label: "Phone shared by several logins", employeeId: u.employeeProfile?.id ?? null, userId: u.id, code: null, name: u.name ?? u.email, detail: `${list.length} logins share this phone`, fix: null })
    const counts: Record<string, number> = {}
    for (const i of issues) counts[i.kind] = (counts[i.kind] ?? 0) + 1
    return { counts, issues }
}

export async function fixHealth(kind: string, employeeId: string | null, userId: string | null, actor: Actor) {
    if (kind === "createLogin" && employeeId) {
        const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, userId: true, firstName: true, lastName: true, email: true, phone: true, employeeId: true } })
        if (!emp || emp.userId) return "Already has a login"
        const loginEmail = buildLoginEmail({ email: emp.email, phone: emp.phone, employeeId: emp.employeeId })
        const taken = await prisma.user.findUnique({ where: { email: loginEmail }, include: { employeeProfile: { select: { id: true } } } })
        if (taken && taken.employeeProfile) return `Login id ${loginEmail} belongs to someone else — set the login in Employee Logins`
        const user = taken ?? await prisma.user.create({ data: { name: `${emp.firstName} ${emp.lastName || ""}`.trim(), email: loginEmail, password: NO_PASSWORD, plainPassword: null, phone: emp.phone || null, role: "MANAGER" } })
        await prisma.employee.update({ where: { id: emp.id }, data: { userId: user.id } })
        await prisma.userAccess.upsert({ where: { userId: user.id }, create: { userId: user.id, loginMethod: "OTP", createdById: actor.id }, update: {} }).catch(() => {})
        await applyAutoRoleSafe(emp.id, { reason: "login created (Access centre)", actor })
        await prisma.auditLog.create({ data: { actorId: actor.id, actorName: actor.name, action: "user.create", targetType: "User", targetId: user.id, targetName: user.name, summary: `Login created for ${emp.employeeId} (Access centre)` } }).catch(() => {})
        return null
    }
    if (!userId) return "Nothing to fix"
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true, phone: true, isActive: true } })
    if (!u) return "Login not found"
    if (kind === "enable") {
        await prisma.$transaction(async tx => {
            await tx.user.update({ where: { id: u.id }, data: { isActive: true } })
            await bumpAccessVersion(tx, [u.id])
            await audit(tx, { actorId: actor.id, actorName: actor.name, action: "user.enable", targetType: "User", targetId: u.id, targetName: u.name, summary: `${u.name}: enabled (employed, Access centre)` })
        })
        return null
    }
    if (kind === "autoRole" && employeeId) return (await applyAutoRoleSafe(employeeId, { reason: "no role (Access centre)", actor })) ? null : "No role is set for this designation — set it in People → Login Roles"
    if (kind === "syncPhone" && employeeId) {
        const e = await prisma.employee.findUnique({ where: { id: employeeId }, select: { phone: true } })
        if (!e?.phone) return "Employee has no phone"
        await prisma.$transaction(async tx => {
            await tx.user.update({ where: { id: u.id }, data: { phone: e.phone } })
            await audit(tx, { actorId: actor.id, actorName: actor.name, action: "user.update", targetType: "User", targetId: u.id, targetName: u.name, summary: `${u.name}: login phone set to the employee's phone (Access centre)`, before: { phone: u.phone ? `…${last10(u.phone).slice(-4)}` : null }, after: { phone: `…${last10(e.phone).slice(-4)}` } })
        })
        return null
    }
    if (kind === "addAccess") { await prisma.userAccess.upsert({ where: { userId: u.id }, create: { userId: u.id, loginMethod: "OTP", createdById: actor.id }, update: {} }); return null }
    return "Unknown fix"
}

// ─── Security ────────────────────────────────────────────────────────────────

export async function security(now = new Date()) {
    const s = await getAccessCentre()
    const since30 = new Date(now.getTime() - 30 * DAY), since1 = new Date(now.getTime() - DAY)
    const [fails, locks, okCount] = await Promise.all([
        prisma.auditLog.findMany({ where: { action: "auth.loginFailed", at: { gte: since30 } }, select: { at: true, targetName: true, ip: true, summary: true }, orderBy: { at: "desc" }, take: 5000 }),
        prisma.userCredential.findMany({ where: { lockedUntil: { gt: now } }, select: { userId: true, lockedUntil: true, user: { select: { name: true, email: true } } } }).catch(() => []),
        prisma.auditLog.count({ where: { action: "auth.login", at: { gte: since30 } } }),
    ])
    const group = (key: (f: (typeof fails)[number]) => string | null) => {
        const m = new Map<string, { key: string; n30: number; n1: number; last: string; reasons: Record<string, number> }>()
        for (const f of fails) {
            const k = key(f); if (!k) continue
            const g = m.get(k) ?? { key: k, n30: 0, n1: 0, last: f.at.toISOString(), reasons: {} }
            g.n30++; if (f.at >= since1) g.n1++
            const r = (f.summary ?? "").replace(/^.*\((.*)\)$/, "$1").replace(/:\d+$/, "")
            g.reasons[r] = (g.reasons[r] ?? 0) + 1
            m.set(k, g)
        }
        return Array.from(m.values()).sort((a, b) => b.n1 - a.n1 || b.n30 - a.n30).slice(0, 50)
    }
    return {
        settings: { lockAfterFailures: s.lockAfterFailures, lockMinutes: s.lockMinutes, alertAfterFailures: s.alertAfterFailures },
        summary: { failed30: fails.length, failed24h: fails.filter(f => f.at >= since1).length, ok30: okCount, lockedNow: locks.length },
        byLogin: group(f => f.targetName), byIp: group(f => f.ip),
        locks: locks.map(l => ({ userId: l.userId, name: l.user.name, loginId: l.user.email, until: l.lockedUntil!.toISOString() })),
    }
}

export async function unlock(userId: string, actor: Actor) {
    await clearFailedLogins(userId)
    await prisma.auditLog.create({ data: { actorId: actor.id, actorName: actor.name, action: "user.unlock", targetType: "User", targetId: userId, summary: "Login unlocked (Access centre)" } }).catch(() => {})
}

export async function signOutUser(userId: string, actor: Actor) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } })
    if (!u) return "Login not found"
    await signOutEverywhere(u.id)
    await prisma.$transaction(async tx => {
        await bumpAccessVersion(tx, [u.id])
        await audit(tx, { actorId: actor.id, actorName: actor.name, action: "user.signout_all", targetType: "User", targetId: u.id, targetName: u.name, summary: `${u.name}: signed out on every device (Access centre)` })
    })
    return null
}

/** Daily: tell Admins about login ids / IPs failing a lot in the last day. */
export async function alertFailures(now = new Date()) {
    const s = await getAccessCentre()
    if (!s.alertAfterFailures) return 0
    const sec = await security(now)
    const hot = [...sec.byLogin.filter(g => g.n1 >= s.alertAfterFailures).map(g => `login ${g.key} (${g.n1}×)`), ...sec.byIp.filter(g => g.n1 >= s.alertAfterFailures).map(g => `IP ${g.key} (${g.n1}×)`)]
    if (hot.length) await notifyApprovers(["users.manage"], { title: "Repeated failed sign-ins", message: `In the last 24 hours: ${hot.slice(0, 5).join(", ")}${hot.length > 5 ? "…" : ""}. Check Admin → Access centre → Security.`, type: "security", link: "/admin/access?tab=security" })
    return hot.length
}

// ─── Access review ───────────────────────────────────────────────────────────

const POWER = ["users.manage", "users.edit", "roles.edit", "roles.manage", "payroll.process", "payroll.approve", "payroll.edit", "employees.edit", "settings.edit", "audit.view"]

export async function accessReview() {
    const s = await getAccessCentre()
    const [roles, admins, users, reviews] = await Promise.all([
        prisma.customRole.findMany({ select: { id: true, name: true, isActive: true, permissions: true, _count: { select: { users: { where: { isActive: true } } } } }, orderBy: { name: "asc" } }),
        prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true, name: true, email: true } }),
        prisma.user.findMany({ where: { isActive: true, customRoleId: { not: null } }, select: { id: true, customRoleId: true } }),
        getReviews(),
    ])
    const siteRows = await prisma.siteAssignment.findMany({ where: { status: "active" }, select: { userId: true } }).catch(() => [] as { userId: string }[])
    const withSites = new Set(siteRows.map(r => r.userId))
    const roleRows = roles.map(r => {
        const holders = users.filter(u => u.customRoleId === r.id)
        const power = r.permissions.filter(p => POWER.includes(p))
        return { id: r.id, name: r.name, isActive: r.isActive, holders: r._count.users, permissions: r.permissions.length, power, siteLimited: holders.filter(h => withSites.has(h.id)).length }
    }).sort((a, b) => b.power.length - a.power.length || b.holders - a.holders)
    const last = reviews[0] ?? null
    const due = s.reviewEveryDays > 0 ? (last ? new Date(new Date(last.at).getTime() + s.reviewEveryDays * DAY) : new Date()) : null
    return { admins, roles: roleRows, reviews: reviews.slice(0, 10), nextDue: due?.toISOString() ?? null, reviewEveryDays: s.reviewEveryDays }
}

/** Daily: remind once the review is due. */
export async function remindReview(now = new Date()) {
    const r = await accessReview()
    if (!r.nextDue || new Date(r.nextDue) > now) return false
    await notifyApprovers(["users.manage"], { title: "Access review due", message: "Check who holds which role and site, then sign off in Admin → Access centre → Access review.", type: "security", link: "/admin/access?tab=review" })
    return true
}
