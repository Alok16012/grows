// ─── Access: permission, data scope, field masking, audit ────────────────────
// Server-only. Every route that reads people data should go through `guard`
// (permission check + scope + mask) instead of hand-rolled checks, so hiding a
// button in the UI is never the only thing standing between a role and a record.
//
// Scope and assigned sites ride in the session token (set at sign-in and on
// every refresh), so applying them costs no extra query except for MY_TEAM.

import { NextResponse } from "next/server"
import type { Session } from "next-auth"
import { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { isMissingTableErr } from "@/lib/asset-workflow"
import { type DataScope, isScope, SENSITIVE_FIELDS, NEVER_RETURNED } from "@/lib/permission-catalogue"

export { roleScope, userSiteIds, resolveAccess, accessVersion } from "@/lib/access-session"

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
/** The client or a transaction client — pass the transaction when recording an access change. */
export type Db = Pick<Tx, "userAccess" | "auditLog">

/** Make every live session of these users re-read their access on the next request. */
export async function bumpAccessVersion(db: Db, userIds: string[]) {
    for (const userId of Array.from(new Set(userIds))) {
        await db.userAccess.upsert({
            where: { userId },
            create: { userId, permissionsVersion: 2 },
            update: { permissionsVersion: { increment: 1 } },
        })
    }
}

let accessTablesState: boolean | null = null
/** Whether scripts/role-manager.sql has run. Cached once true. */
export async function accessTablesReady(): Promise<boolean> {
    if (accessTablesState) return true
    try {
        await prisma.auditLog.findFirst({ select: { id: true } })
        await prisma.roleMeta.findFirst({ select: { roleId: true } })
        await prisma.userAccess.findFirst({ select: { userId: true } })
        accessTablesState = true
        return true
    } catch (e) {
        if (isMissingTableErr(e)) return false
        throw e
    }
}

export const ACCESS_NOT_SET_UP =
    "The role manager tables are not installed yet. Run scripts/role-manager.sql on the database."

// ─── Access object ───────────────────────────────────────────────────────────

export type Access = {
    userId: string
    name: string
    isAdmin: boolean
    permissions: string[]
    scope: DataScope
    siteIds: string[]
}

export function accessFrom(session: Session): Access {
    const u = session.user as Session["user"] & { scope?: string; siteIds?: string[] }
    const isAdmin = u.role === "ADMIN"
    return {
        userId: u.id,
        name: u.name ?? "",
        isAdmin,
        permissions: u.permissions ?? [],
        // A session minted before scopes existed behaves as before: company-wide.
        scope: isAdmin ? "ALL" : isScope(u.scope) ? u.scope : "ALL",
        siteIds: Array.isArray(u.siteIds) ? u.siteIds : [],
    }
}

export function has(access: Access, perm: string): boolean {
    return access.isAdmin || access.permissions.includes(perm)
}

export function hasAny(access: Access, perms: string[]): boolean {
    return access.isAdmin || perms.some(p => access.permissions.includes(p))
}

// ─── Data scope ──────────────────────────────────────────────────────────────

/** User ids of the people who report to this user, one and two levels down. */
export async function teamUserIds(userId: string): Promise<string[]> {
    const direct = await prisma.employee.findMany({
        where: { managerId: userId, userId: { not: null } },
        select: { userId: true },
    })
    const level1 = direct.map(d => d.userId!).filter(Boolean)
    if (level1.length === 0) return []
    const second = await prisma.employee.findMany({
        where: { managerId: { in: level1 }, userId: { not: null } },
        select: { userId: true },
    })
    return Array.from(new Set([...level1, ...second.map(s => s.userId!).filter(Boolean)]))
}

/**
 * Prisma `where` limiting Employee rows to this caller's scope, or null when
 * the caller sees everyone. Lists, counts, dashboards and exports all use it,
 * so a number on screen always matches the list behind it.
 */
export async function employeeScope(access: Access): Promise<Prisma.EmployeeWhereInput | null> {
    switch (access.scope) {
        case "ALL":
            return null
        case "ASSIGNED_SITES":
            return {
                OR: [
                    { deployments: { some: { isActive: true, siteId: { in: access.siteIds } } } },
                    { userId: access.userId },
                ],
            }
        case "MY_TEAM": {
            const team = await teamUserIds(access.userId)
            return {
                OR: [
                    { managerId: access.userId },
                    ...(team.length ? [{ managerId: { in: team } }] : []),
                    { userId: access.userId },
                ],
            }
        }
        case "SELF":
        default:
            return { userId: access.userId }
    }
}

/** Ids of the employees in scope; null = everyone. For models that only hold employeeId. */
export async function employeeIdsInScope(access: Access): Promise<string[] | null> {
    const where = await employeeScope(access)
    if (!where) return null
    const rows = await prisma.employee.findMany({ where, select: { id: true } })
    return rows.map(r => r.id)
}

/** Site filter for site-keyed records (projects, sites, attendance by site); null = all sites. */
export function siteScope(access: Access): string[] | null {
    if (access.scope === "ALL") return null
    if (access.scope === "ASSIGNED_SITES") return access.siteIds
    return []
}

// ─── Field masking ───────────────────────────────────────────────────────────

const LOCKED_FIELDS: { perm: string; fields: string[] }[] = SENSITIVE_FIELDS.map(s => ({ perm: s.key, fields: s.fields }))

/** Fields this caller may not receive. */
export function hiddenFields(access: Access): Set<string> {
    const out = new Set<string>(NEVER_RETURNED)
    if (access.isAdmin) return out
    for (const g of LOCKED_FIELDS) if (!access.permissions.includes(g.perm)) for (const f of g.fields) out.add(f)
    return out
}

/** The sensitive fields this caller sees masked — for the UI to label them. */
export function lockedFieldNames(access: Access): string[] {
    return Array.from(hiddenFields(access)).filter(f => !NEVER_RETURNED.includes(f))
}

/** Strip locked fields from one employee-shaped object (shallow). */
export function maskEmployee<T>(row: T, access: Access): T {
    if (!row || typeof row !== "object") return row
    const hidden = hiddenFields(access)
    const copy: Record<string, unknown> = { ...(row as Record<string, unknown>) }
    for (const f of Array.from(hidden)) if (f in copy) delete copy[f]
    return copy as T
}

/** Strip locked fields from any nested `employee` objects too. */
export function maskDeep<T>(value: T, access: Access): T {
    const hidden = hiddenFields(access)
    const walk = (v: unknown): unknown => {
        if (Array.isArray(v)) return v.map(x => walk(x))
        if (!v || typeof v !== "object" || v instanceof Date) return v
        const o: Record<string, unknown> = {}
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
            if (hidden.has(k)) continue
            o[k] = walk(val)
        }
        return o
    }
    return walk(value) as T
}

/** Last four characters with the rest masked, e.g. "XXXX XXXX 1234". */
export function maskValue(v: string | null | undefined): string | null {
    if (!v) return v ?? null
    const tail = v.replace(/\s+/g, "").slice(-4)
    return `XXXX XXXX ${tail}`
}

// ─── Audit ───────────────────────────────────────────────────────────────────

import { auditLater, requestMetaOf } from "@/lib/access-audit"
export { audit, auditLater, type AuditEntry } from "@/lib/access-audit"

export { requestMetaOf as requestMeta } from "@/lib/access-audit"

// ─── Guard ───────────────────────────────────────────────────────────────────

export type Guarded = { session: Session; access: Access }

/**
 * The check every protected route starts with. Passes when the caller holds
 * ANY of `perms`. A refusal is a 403 that is also written to the audit log.
 *
 *     const g = await guard(req, "employees.view")
 *     if (g instanceof NextResponse) return g
 */
export async function guard(req: Request | null, perms: string | string[]): Promise<Guarded | NextResponse> {
    const session = await getApiSession(req ?? undefined)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const access = accessFrom(session)
    const list = Array.isArray(perms) ? perms : [perms]
    if (list.length && !hasAny(access, list)) {
        const meta = requestMetaOf(req)
        const route = req ? new URL(req.url).pathname : null
        auditLater({
            actorId: access.userId, actorName: access.name, action: "permission.denied",
            targetType: "Route", targetId: route, targetName: route,
            summary: `Asked for ${list.join(" or ")}${route ? ` on ${route}` : ""}`, ...meta,
        })
        return NextResponse.json({ error: `Forbidden — missing ${list.join(" or ")}` }, { status: 403 })
    }
    return { session, access }
}

/**
 * AND the caller's employee scope into a `where` for a model that has an
 * `employee` relation (leaves, attendance, expenses, exits…). No scope = as is.
 */
export function withEmployeeScope<W extends Record<string, unknown>>(where: W, scope: Prisma.EmployeeWhereInput | null): W {
    if (!scope) return where
    const and = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []
    return { ...where, AND: [...and, { employee: scope }] }
}
