// Users screen: the paged table (GET ?page=…) and Create user (POST).

import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import bcrypt from "bcryptjs"
import prisma from "@/lib/prisma"
import { guard, has, accessTablesReady, audit, auditLater, requestMeta } from "@/lib/access"
import { csvSafe } from "@/lib/csv-safe"
import { assertCanAssignRole, ADMIN_ROLE_ID, RuleError } from "@/lib/role-rules"
import { isScope } from "@/lib/permission-catalogue"
import { NO_PASSWORD } from "@/lib/credentials"
import { ruleResponse } from "@/lib/role-admin"
import {
    isRealEmail, mobileOf, parseMobile, parseEmail, assertMobileFree, assertEmailFree,
    parseSiteIds, assertSitesExist, setUserSites, parseLoginMethod, parseInitialPassword,
} from "@/lib/user-admin"

export const PAGE_SIZE = 50
// Quoted, formula-safe CSV cell.
const cell = (v: unknown) => `"${csvSafe(v).replace(/"/g, '""')}"`
const DAY = 24 * 60 * 60 * 1000

export async function usersTable(req: Request) {
    const g = await guard(req, ["users.view", "users.manage"])
    if (g instanceof NextResponse) return g
    try {
        const sp = new URL(req.url).searchParams
        const page = Math.max(1, parseInt(sp.get("page") || "1") || 1)
        const q = (sp.get("q") || "").trim()
        const role = sp.get("role") || ""
        const site = sp.get("site") || ""
        const status = sp.get("status") || ""
        const login = sp.get("login") || ""
        const lastLogin = sp.get("lastLogin") || ""
        const ready = await accessTablesReady()

        const and: Prisma.UserWhereInput[] = []
        if (q) {
            const digits = q.replace(/\D/g, "")
            and.push({
                OR: [
                    { name: { contains: q, mode: "insensitive" } },
                    { email: { contains: q, mode: "insensitive" } },
                    ...(digits.length >= 3 ? [{ phone: { contains: digits } }, { email: { contains: digits } }] : []),
                    { employeeProfile: { is: { employeeId: { contains: q, mode: "insensitive" } } } },
                ],
            })
        }
        if (role === ADMIN_ROLE_ID) and.push({ role: "ADMIN" })
        else if (role === "none") and.push({ customRoleId: null, role: { notIn: ["ADMIN", "CLIENT"] } })
        else if (role) and.push({ customRoleId: role, role: { not: "ADMIN" } })
        if (site) and.push({ siteMemberships: { some: { siteId: site, status: "active" } } })
        if (status === "active") and.push({ isActive: true })
        if (status === "disabled") and.push({ isActive: false })
        if (ready && (login === "OTP" || login === "PASSWORD")) {
            and.push(login === "OTP"
                ? { OR: [{ access: { is: null } }, { access: { is: { loginMethod: "OTP" } } }] }
                : { access: { is: { loginMethod: "PASSWORD" } } })
        }
        if (ready && lastLogin === "never") and.push({ OR: [{ access: { is: null } }, { access: { is: { lastLoginAt: null } } }] })
        if (ready && lastLogin === "30d") {
            and.push({ OR: [{ access: { is: null } }, { access: { is: { lastLoginAt: null } } }, { access: { is: { lastLoginAt: { lt: new Date(Date.now() - 30 * DAY) } } } }] })
        }
        const where: Prisma.UserWhereInput = and.length ? { AND: and } : {}

        const select = {
            id: true, name: true, email: true, phone: true, role: true, isActive: true, createdAt: true,
            customRoleId: true,
            customRole: { select: { id: true, name: true, color: true, isActive: true } },
            employeeProfile: { select: { id: true, employeeId: true, phone: true, designation: true, status: true } },
            siteMemberships: { where: { status: "active" }, select: { site: { select: { id: true, name: true } } } },
            ...(ready ? { access: { select: { loginMethod: true, lastLoginAt: true } } } : {}),
        } satisfies Prisma.UserSelect

        const csv = sp.get("format") === "csv"
        if (csv && !has(g.access, "users.export")) return NextResponse.json({ error: "Forbidden — missing users.export" }, { status: 403 })

        const [rows, total, metas] = await Promise.all([
            prisma.user.findMany({
                where, select, orderBy: [{ isActive: "desc" }, { name: "asc" }],
                ...(csv ? { take: 10000 } : { take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
            }),
            prisma.user.count({ where }),
            ready ? prisma.roleMeta.findMany({ select: { roleId: true, scope: true } }) : Promise.resolve([]),
        ])
        const scopeBy = new Map(metas.map(m => [m.roleId, m.scope]))

        const users = rows.map(u => {
            const acc = (u as { access?: { loginMethod: string; lastLoginAt: Date | null } | null }).access ?? null
            const isAdminRole = u.role === "ADMIN"
            const roleScope = isAdminRole ? "ALL" : u.customRoleId ? (scopeBy.get(u.customRoleId) ?? null) : null
            return {
                id: u.id,
                name: u.name,
                employeeCode: u.employeeProfile?.employeeId ?? null,
                employeeId: u.employeeProfile?.id ?? null,
                designation: u.employeeProfile?.designation ?? null,
                mobile: mobileOf(u, u.employeeProfile?.phone),
                email: isRealEmail(u.email) ? u.email : null,
                role: isAdminRole
                    ? { id: ADMIN_ROLE_ID, name: "Admin", color: "#0f172a", system: true }
                    : u.customRole ? { id: u.customRole.id, name: u.customRole.name, color: u.customRole.color, system: false, off: !u.customRole.isActive } : null,
                baseRole: u.role,
                scope: isScope(roleScope) ? roleScope : null,
                sites: u.siteMemberships.map(m => m.site),
                isActive: u.isActive,
                loginMethod: acc?.loginMethod ?? "OTP",
                lastLoginAt: acc?.lastLoginAt ?? null,
                createdAt: u.createdAt,
            }
        })

        if (csv) {
            const head = ["Name", "Employee ID", "Mobile", "Email", "Role", "Sites", "Status", "Login", "Last login", "Created"]
            const lines = users.map(u => [
                u.name, u.employeeCode ?? "", u.mobile ?? "", u.email ?? "", u.role?.name ?? "No role",
                u.sites.map(x => x.name).join("; "), u.isActive ? "Active" : "Disabled", u.loginMethod,
                u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : "Never", new Date(u.createdAt).toISOString(),
            ].map(cell).join(","))
            auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "export.users", targetType: "Export", targetName: "Users", summary: `Users export · ${users.length} rows`, after: { rows: users.length }, ...requestMeta(req) })
            return new NextResponse([head.map(cell).join(","), ...lines].join("\r\n"), {
                headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="users-${new Date().toISOString().slice(0, 10)}.csv"` },
            })
        }

        const [all, active, withoutRole, neverLoggedIn] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({ where: { isActive: true } }),
            prisma.user.count({ where: { customRoleId: null, role: { notIn: ["ADMIN", "CLIENT"] } } }),
            ready ? prisma.user.count({ where: { OR: [{ access: { is: null } }, { access: { is: { lastLoginAt: null } } }] } }) : Promise.resolve(null),
        ])

        return NextResponse.json({
            users, total, page, pageSize: PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
            stats: { total: all, active, disabled: all - active, neverLoggedIn, withoutRole },
            accessReady: ready,
            can: {
                create: has(g.access, "users.create"),
                edit: has(g.access, "users.edit"),
                resetLogin: has(g.access, "users.resetLogin"),
                deactivate: has(g.access, "users.deactivate"),
                export: has(g.access, "users.export"),
                admin: g.access.isAdmin,
            },
        })
    } catch (e) {
        return ruleResponse(e, "[USERS_TABLE]")
    }
}

export async function createUser(req: Request) {
    const g = await guard(req, "users.create")
    if (g instanceof NextResponse) return g
    try {
        if (!(await accessTablesReady())) throw new RuleError(503, "Run scripts/role-manager.sql first — the Users screen records every change in the audit log.")
        const b = (await req.json().catch(() => ({}))) as Record<string, unknown>

        const employeeId = typeof b.employeeId === "string" && b.employeeId ? b.employeeId : null
        const employee = employeeId
            ? await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, userId: true, firstName: true, lastName: true, status: true } })
            : null
        if (employeeId && !employee) throw new RuleError(400, "That employee no longer exists.")
        if (employee?.userId) throw new RuleError(409, "This employee already has a login. Edit that user instead.")

        const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ") : ""
        if (!name) throw new RuleError(400, "Full name is required.")
        const mobile = parseMobile(b.mobile)
        const email = parseEmail(b.email)
        const roleId = typeof b.roleId === "string" ? b.roleId : ""
        if (!roleId) throw new RuleError(400, "Choose a role.")
        await assertCanAssignRole(g.access, roleId)
        const siteIds = parseSiteIds(b.siteIds) ?? []
        await assertSitesExist(siteIds)
        const loginMethod = parseLoginMethod(b.loginMethod)
        const password = loginMethod === "PASSWORD" ? parseInitialPassword(b.password) : null
        const isActive = b.isActive !== false

        await assertMobileFree(mobile)
        if (email) await assertEmailFree(email)
        // The login id: a real email when there is one, else the mobile number
        // (how OTP / MPIN sign-in finds employees today).
        const loginId = email ?? mobile
        await assertEmailFree(loginId)

        const isAdminRole = roleId === ADMIN_ROLE_ID
        const user = await prisma.$transaction(async tx => {
            const created = await tx.user.create({
                data: {
                    name, email: loginId, phone: mobile,
                    password: password ? await bcrypt.hash(password, 10) : NO_PASSWORD,
                    plainPassword: null,
                    // Base role is vestigial for everyone but Admin: access comes
                    // from the custom role (lib/access-session).
                    role: isAdminRole ? "ADMIN" : "MANAGER",
                    customRoleId: isAdminRole ? null : roleId,
                    isActive,
                },
            })
            if (employee) await tx.employee.update({ where: { id: employee.id }, data: { userId: created.id } })
            if (siteIds.length) await setUserSites(tx, created.id, siteIds, g.access.userId)
            await tx.userAccess.create({
                data: { userId: created.id, loginMethod, mustChangePassword: !!password, createdById: g.access.userId },
            })
            await audit(tx, {
                actorId: g.access.userId, actorName: g.access.name, action: "user.create", targetType: "User",
                targetId: created.id, targetName: name, summary: `${name}: created`,
                after: { role: roleId, sites: siteIds, status: isActive ? "Active" : "Disabled", mobile, email, loginMethod, employeeId },
                ...requestMeta(req),
            })
            return created
        })
        return NextResponse.json({ id: user.id }, { status: 201 })
    } catch (e) {
        return ruleResponse(e, "[USERS_CREATE]")
    }
}
