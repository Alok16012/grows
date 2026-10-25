import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import prisma from "@/lib/prisma"
import { guard, has, accessTablesReady, audit, requestMeta, bumpAccessVersion } from "@/lib/access"
import { assertCanAssignRole, assertKeepsAnAdmin, ADMIN_ROLE_ID, RuleError } from "@/lib/role-rules"
import { ruleResponse } from "@/lib/role-admin"
import {
    isRealEmail, mobileOf, parseMobile, parseEmail, assertMobileFree, assertEmailFree,
    parseSiteIds, assertSitesExist, setUserSites, parseLoginMethod, parseInitialPassword,
} from "@/lib/user-admin"

type Ctx = { params: { id: string } }

const roleIdOf = (u: { role: string; customRoleId: string | null }) => (u.role === "ADMIN" ? ADMIN_ROLE_ID : u.customRoleId)

// Edit user: everything the form shows, with the current role selected.
export async function GET(req: Request, { params }: Ctx) {
    const g = await guard(req, ["users.view", "users.manage"])
    if (g instanceof NextResponse) return g
    try {
        const ready = await accessTablesReady()
        const u = await prisma.user.findUnique({
            where: { id: params.id },
            select: {
                id: true, name: true, email: true, phone: true, role: true, customRoleId: true, isActive: true, createdAt: true,
                customRole: { select: { id: true, name: true, color: true } },
                employeeProfile: {
                    select: { id: true, employeeId: true, firstName: true, lastName: true, phone: true, designation: true, managerId: true },
                },
                siteMemberships: { where: { status: "active" }, select: { site: { select: { id: true, name: true, code: true } } } },
            },
        })
        if (!u) return NextResponse.json({ error: "User not found" }, { status: 404 })
        const acc = ready ? await prisma.userAccess.findUnique({ where: { userId: u.id } }) : null
        const [createdBy, manager] = await Promise.all([
            acc?.createdById ? prisma.user.findUnique({ where: { id: acc.createdById }, select: { id: true, name: true } }) : null,
            u.employeeProfile?.managerId ? prisma.user.findUnique({ where: { id: u.employeeProfile.managerId }, select: { id: true, name: true } }) : null,
        ])
        return NextResponse.json({
            user: {
                id: u.id, name: u.name, mobile: mobileOf(u, u.employeeProfile?.phone),
                email: isRealEmail(u.email) ? u.email : null, loginId: u.email,
                roleId: roleIdOf(u), isActive: u.isActive, createdAt: u.createdAt,
                employee: u.employeeProfile ? {
                    id: u.employeeProfile.id, employeeId: u.employeeProfile.employeeId,
                    name: `${u.employeeProfile.firstName} ${u.employeeProfile.lastName ?? ""}`.trim(),
                    designation: u.employeeProfile.designation,
                } : null,
                reportsTo: manager,
                sites: u.siteMemberships.map(m => m.site),
                loginMethod: acc?.loginMethod ?? "OTP",
                mustChangePassword: acc?.mustChangePassword ?? false,
                lastLoginAt: acc?.lastLoginAt ?? null,
                createdBy,
            },
            can: {
                edit: has(g.access, "users.edit"),
                resetLogin: has(g.access, "users.resetLogin"),
                deactivate: has(g.access, "users.deactivate"),
                admin: g.access.isAdmin,
            },
        })
    } catch (e) {
        return ruleResponse(e, "[USER_GET]")
    }
}

export async function PATCH(req: Request, { params }: Ctx) {
    const g = await guard(req, ["users.edit", "users.deactivate"])
    if (g instanceof NextResponse) return g
    try {
        if (!(await accessTablesReady())) throw new RuleError(503, "Run scripts/role-manager.sql first — every user change is written to the audit log.")
        const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
        const u = await prisma.user.findUnique({
            where: { id: params.id },
            select: {
                id: true, name: true, email: true, phone: true, role: true, customRoleId: true, isActive: true,
                employeeProfile: { select: { phone: true } },
                siteMemberships: { where: { status: "active" }, select: { siteId: true } },
            },
        })
        if (!u) throw new RuleError(404, "User not found")
        const acc = await prisma.userAccess.findUnique({ where: { userId: u.id } })

        const statusOnly = Object.keys(b).every(k => k === "isActive")
        if (!statusOnly && !has(g.access, "users.edit")) throw new RuleError(403, "You can enable or disable users, but not edit them.")

        const data: Record<string, unknown> = {}
        const before = {
            name: u.name, role: roleIdOf(u), status: u.isActive ? "Active" : "Disabled",
            mobile: mobileOf(u, u.employeeProfile?.phone), email: isRealEmail(u.email) ? u.email : null,
            sites: u.siteMemberships.map(s => s.siteId).sort(), loginMethod: acc?.loginMethod ?? "OTP",
        }
        const after = { ...before }

        if (typeof b.name === "string") {
            const name = b.name.trim().replace(/\s+/g, " ")
            if (!name) throw new RuleError(400, "Full name is required.")
            data.name = name; after.name = name
        }
        if (b.mobile !== undefined) {
            const mobile = parseMobile(b.mobile)
            if (mobile !== before.mobile) await assertMobileFree(mobile, u.id)
            data.phone = mobile; after.mobile = mobile
            // A login id that was the old mobile follows the new one.
            if (!(u.email ?? "").includes("@") && u.email !== mobile) { await assertEmailFree(mobile, u.id); data.email = mobile }
        }
        if (b.email !== undefined) {
            const email = parseEmail(b.email)
            if (email && email !== before.email) { await assertEmailFree(email, u.id); data.email = email }
            // Clearing the email falls back to the mobile number as the login id.
            if (!email && isRealEmail(u.email)) {
                const fallback = (data.phone as string) ?? before.mobile
                if (!fallback) throw new RuleError(400, "Add a mobile before removing the email — one of them is the login id.")
                await assertEmailFree(fallback, u.id)
                data.email = fallback
            }
            after.email = email
        }

        let roleChanged = false
        if (typeof b.roleId === "string" && b.roleId !== before.role) {
            if (!b.roleId) throw new RuleError(400, "Choose a role.")
            await assertCanAssignRole(g.access, b.roleId)
            // Moving someone off Admin needs Admin rights and another Admin.
            if (before.role === ADMIN_ROLE_ID) {
                if (!g.access.isAdmin) throw new RuleError(403, "Only an Admin can change another Admin's role.")
                await assertKeepsAnAdmin([u.id])
            }
            data.role = b.roleId === ADMIN_ROLE_ID ? "ADMIN" : "MANAGER"
            data.customRoleId = b.roleId === ADMIN_ROLE_ID ? null : b.roleId
            after.role = b.roleId
            roleChanged = true
        }

        let statusChanged = false
        if (typeof b.isActive === "boolean" && b.isActive !== u.isActive) {
            if (!has(g.access, "users.deactivate")) throw new RuleError(403, "You cannot enable or disable users.")
            if (u.id === g.access.userId && !b.isActive) throw new RuleError(400, "You cannot disable your own account.")
            if (before.role === ADMIN_ROLE_ID && !g.access.isAdmin) throw new RuleError(403, "Only an Admin can disable an Admin.")
            if (!b.isActive) await assertKeepsAnAdmin([u.id])
            data.isActive = b.isActive; after.status = b.isActive ? "Active" : "Disabled"
            statusChanged = true
        }

        const siteIds = parseSiteIds(b.siteIds)
        if (siteIds) { await assertSitesExist(siteIds); after.sites = [...siteIds].sort() }
        const sitesChanged = !!siteIds && JSON.stringify(after.sites) !== JSON.stringify(before.sites)

        const loginMethod = b.loginMethod !== undefined ? parseLoginMethod(b.loginMethod) : null
        let newPassword: string | null = null
        if (loginMethod === "PASSWORD" && (before.loginMethod !== "PASSWORD" || typeof b.password === "string")) {
            newPassword = parseInitialPassword(b.password)
        }
        if (loginMethod) after.loginMethod = loginMethod
        if (newPassword) data.password = await bcrypt.hash(newPassword, 10)

        const changed = Object.keys(data).length > 0 || sitesChanged || (loginMethod && loginMethod !== before.loginMethod) || !!newPassword
        if (!changed) return NextResponse.json({ ok: true, unchanged: true })

        const action = statusChanged && Object.keys(data).length === 1 && !sitesChanged ? (b.isActive ? "user.enable" : "user.disable") : "user.update"
        const changes = (Object.keys(after) as (keyof typeof after)[]).filter(k => JSON.stringify(after[k]) !== JSON.stringify(before[k]))
        await prisma.$transaction(async tx => {
            if (Object.keys(data).length) await tx.user.update({ where: { id: u.id }, data })
            if (siteIds && sitesChanged) await setUserSites(tx, u.id, siteIds, g.access.userId)
            if (loginMethod || newPassword) {
                await tx.userAccess.upsert({
                    where: { userId: u.id },
                    create: { userId: u.id, loginMethod: loginMethod ?? "OTP", mustChangePassword: !!newPassword },
                    update: { ...(loginMethod ? { loginMethod } : {}), ...(newPassword ? { mustChangePassword: true } : {}) },
                })
            }
            if (roleChanged || statusChanged || sitesChanged) await bumpAccessVersion(tx, [u.id])
            await audit(tx, {
                actorId: g.access.userId, actorName: g.access.name, action, targetType: "User", targetId: u.id,
                targetName: (data.name as string) ?? u.name,
                summary: `${(data.name as string) ?? u.name}: ${changes.length ? changes.join(", ") + " changed" : "password reset"}${newPassword ? " (new initial password)" : ""}`,
                before, after, ...requestMeta(req),
            })
        })
        return NextResponse.json({ ok: true })
    } catch (e) {
        return ruleResponse(e, "[USER_PATCH]")
    }
}

// Deleting a login is Admin-only; disabling is the normal way to remove access.
export async function DELETE(req: Request, { params }: Ctx) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    try {
        if (!g.access.isAdmin) throw new RuleError(403, "Only an Admin can delete a login. Disable it instead.")
        if (params.id === g.access.userId) throw new RuleError(400, "You cannot delete your own account.")
        const u = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, name: true, role: true, customRoleId: true, isActive: true } })
        if (!u) throw new RuleError(404, "User not found")
        await assertKeepsAnAdmin([u.id])
        await prisma.$transaction(async tx => {
            await tx.user.delete({ where: { id: u.id } })
            if (await accessTablesReady()) {
                await audit(tx, {
                    actorId: g.access.userId, actorName: g.access.name, action: "user.delete", targetType: "User",
                    targetId: u.id, targetName: u.name, summary: `${u.name}: login deleted`,
                    before: { role: roleIdOf(u), status: u.isActive ? "Active" : "Disabled" }, ...requestMeta(req),
                })
            }
        })
        return NextResponse.json({ success: true })
    } catch (e) {
        return ruleResponse(e, "[USER_DELETE]")
    }
}
