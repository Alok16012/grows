// Audit writes, kept free of session imports so lib/auth can record sign-ins.

import { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
/** The client or a transaction client — pass the transaction when recording an access change. */
export type Db = Pick<Tx, "auditLog">

export type AuditEntry = {
    actorId?: string | null
    actorName?: string | null
    action: string
    targetType: string
    targetId?: string | null
    targetName?: string | null
    summary?: string | null
    before?: unknown
    after?: unknown
    ip?: string | null
    userAgent?: string | null
    batchId?: string | null
}

const SECRET_KEYS = /password|mpin|otp|token|secret|hash/i

function scrub(v: unknown): unknown {
    if (v === undefined) return undefined
    if (Array.isArray(v)) return v.map(scrub)
    if (!v || typeof v !== "object" || v instanceof Date) return v
    const o: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (SECRET_KEYS.test(k)) continue
        o[k] = scrub(val)
    }
    return o
}

/**
 * Write one audit row. Pass the transaction client when recording an access
 * change, so the change and its audit row commit together or not at all.
 */
export async function audit(db: Db, e: AuditEntry) {
    await db.auditLog.create({
        data: {
            actorId: e.actorId ?? null,
            actorName: e.actorName ?? null,
            action: e.action,
            targetType: e.targetType,
            targetId: e.targetId ?? null,
            targetName: e.targetName ?? null,
            summary: e.summary ?? null,
            before: e.before === undefined ? Prisma.JsonNull : (scrub(e.before) as Prisma.InputJsonValue),
            after: e.after === undefined ? Prisma.JsonNull : (scrub(e.after) as Prisma.InputJsonValue),
            ip: e.ip ?? null,
            userAgent: e.userAgent?.slice(0, 300) ?? null,
            batchId: e.batchId ?? null,
        },
    })
}

/** Best-effort audit for events outside a transaction (sign-ins, refusals, exports). */
export function auditLater(e: AuditEntry) {
    audit(prisma, e).catch(() => { /* table missing or DB hiccup — never block the request */ })
}

// ─── Sign-ins ────────────────────────────────────────────────────────────────

/** Successful sign-in: stamp lastLoginAt and write auth.login. Never blocks. */
export function recordLogin(e: { userId: string; name?: string | null; method: string; ip?: string | null; userAgent?: string | null }) {
    const now = new Date()
    prisma.userAccess.upsert({
        where: { userId: e.userId },
        create: { userId: e.userId, lastLoginAt: now },
        update: { lastLoginAt: now },
    }).catch(() => { /* table not installed */ })
    auditLater({
        actorId: e.userId, actorName: e.name ?? null, action: "auth.login", targetType: "User",
        targetId: e.userId, targetName: e.name ?? null, summary: `${methodLabel(e.method)} sign-in`,
        after: { method: e.method }, ip: e.ip ?? null, userAgent: e.userAgent ?? null,
    })
}

/** Refused sign-in. The login id arrives already masked. */
export function recordLoginFailure(e: { loginId: string; method: string; reason: string; ip?: string | null; userAgent?: string | null }) {
    auditLater({
        action: "auth.loginFailed", targetType: "User", targetName: e.loginId,
        summary: `${methodLabel(e.method)} sign-in refused (${e.reason})`,
        after: { method: e.method, reason: e.reason }, ip: e.ip ?? null, userAgent: e.userAgent ?? null,
    })
}

function methodLabel(m: string) {
    const [base, ...rest] = m.split(" ")
    const label = base === "otp" ? "OTP" : base === "mpin" ? "MPIN" : base === "password" ? "Password" : base
    return [label, ...rest].join(" ")
}

/** Caller IP and user agent from a request. */
export function requestMetaOf(req: Request | null | undefined): { ip: string | null; userAgent: string | null } {
    if (!req) return { ip: null, userAgent: null }
    const fwd = req.headers.get("x-forwarded-for")
    const ip = (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip"))?.trim() || null
    return { ip, userAgent: req.headers.get("user-agent") }
}
