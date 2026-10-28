// Policy sign-off — server rules shared by the admin API, the onboarding link
// (token) API and the logged-in self-service API.
//
// The server decides everything that makes a signature valid (Section 7.2 of
// the architecture doc): the version is the policy's current one, the policy
// is active and applies to the employee's designation, the reader reached the
// end, the agree box was ticked and the typed name matches the record. The
// screens only mirror these rules.
import { createHash } from "crypto"
import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { isMissingTableErr, isUniqueErr } from "@/lib/asset-workflow"
import {
    SIGNOFF_MISSING_MESSAGE, ONBOARDING_CATEGORY, designationKey, nameKey, normalizePolicyText,
    type RequiredPolicy, type PolicyStatus, type PolicyScope,
} from "@/lib/policy-text"

export { isUniqueErr }

// ─── Errors ──────────────────────────────────────────────────────────────────

/** An expected failure with a machine-readable code the screens can act on. */
export class PolicyError extends Error {
    status: number
    code: string
    extra?: Record<string, unknown>
    constructor(status: number, code: string, message: string, extra?: Record<string, unknown>) {
        super(message)
        this.status = status
        this.code = code
        this.extra = extra
    }
}

export const policyJson = (status: number, code: string, message: string, extra?: Record<string, unknown>) =>
    NextResponse.json({ error: message, code, message, ...(extra ?? {}) }, { status })

export function policyErrorResponse(e: unknown, tag: string) {
    if (e instanceof PolicyError) return policyJson(e.status, e.code, e.message, e.extra)
    if (isMissingTableErr(e)) return policyJson(503, "NOT_SET_UP", SIGNOFF_MISSING_MESSAGE)
    console.error(tag, e)
    return policyJson(500, "INTERNAL", "Internal Error")
}

/** True when the sign-off tables don't exist yet (the step is then skipped). */
export async function signoffReady(): Promise<boolean> {
    try {
        await prisma.signoffPolicy.findFirst({ select: { id: true } })
        return true
    } catch (e) {
        if (isMissingTableErr(e)) return false
        throw e
    }
}

// ─── Hash / validation ───────────────────────────────────────────────────────

/** SHA-256 over exactly what the employee reads: title, text and attachment link. */
export function versionHash(v: { title: string; content: string; attachmentUrl: string | null }) {
    return createHash("sha256")
        .update(`${v.title.trim()}\n\n${normalizePolicyText(v.content)}\n\n${v.attachmentUrl ?? ""}`, "utf8")
        .digest("hex")
}

const MAX_CONTENT = 100_000
const URL_RE = /^(https?:\/\/|\/)[^\s<>"']+$/i

export function cleanText(v: unknown, max: number): string | null {
    if (typeof v !== "string") return null
    const t = v.trim()
    return t ? t.slice(0, max) : null
}

export function cleanUrl(v: unknown): string | null {
    const t = cleanText(v, 1000)
    if (!t) return null
    if (!URL_RE.test(t)) throw new PolicyError(400, "BAD_URL", "Attachment must be a full link (https://…)")
    return t
}

export function cleanContent(v: unknown): string {
    if (v !== undefined && typeof v !== "string") throw new PolicyError(400, "BAD_CONTENT", "Policy text must be text")
    const t = normalizePolicyText((v as string | undefined) ?? "")
    if (t.length > MAX_CONTENT) throw new PolicyError(400, "BAD_CONTENT", `Policy text is too long (max ${MAX_CONTENT.toLocaleString("en-IN")} characters)`)
    return t
}

export function parseDate(v: unknown): Date | null {
    if (v === null || v === undefined || v === "") return null
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v)) throw new PolicyError(400, "BAD_DATE", "Effective date must be YYYY-MM-DD")
    const d = new Date(v.slice(0, 10) + "T00:00:00Z")
    if (isNaN(d.getTime())) throw new PolicyError(400, "BAD_DATE", "Effective date must be YYYY-MM-DD")
    return d
}

// ─── Audit ───────────────────────────────────────────────────────────────────

// The shared client is $extends-ed, so derive the transaction type from it.
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
type Db = Tx | typeof prisma

export async function audit(db: Db, entry: { actorId: string | null; entity: string; entityId: string; action: string; before?: unknown; after?: unknown }) {
    await (db as typeof prisma).signoffAudit.create({
        data: {
            actorId: entry.actorId, entity: entry.entity, entityId: entry.entityId, action: entry.action,
            before: entry.before === undefined ? undefined : (entry.before as Prisma.InputJsonValue),
            after: entry.after === undefined ? undefined : (entry.after as Prisma.InputJsonValue),
        },
    })
}

// ─── Who must sign what ──────────────────────────────────────────────────────

/** Parses ?scope= from a request: "onboarding" or everything. */
export function scopeFrom(v: unknown): PolicyScope {
    return v === "onboarding" ? "onboarding" : "all"
}

/**
 * Active, signature-required policies that apply to a designation, with their
 * current version. `scope: "onboarding"` keeps only the Onboarding category —
 * what the joining screens ask for; other categories are signed from the profile.
 */
export async function applicablePolicies(designation: string | null | undefined, scope: PolicyScope = "all") {
    const key = designationKey(designation)
    const policies = await prisma.signoffPolicy.findMany({
        where: {
            status: "ACTIVE",
            requiresSignature: true,
            currentVersionId: { not: null },
            ...(scope === "onboarding" ? { category: { equals: ONBOARDING_CATEGORY, mode: "insensitive" as const } } : {}),
            OR: [
                { appliesToAll: true },
                ...(key ? [{ designations: { some: { designationKey: key } } }] : []),
            ],
        },
        select: {
            id: true, title: true, category: true, currentVersionId: true,
            versions: { select: { id: true, versionNo: true, requireResign: true }, orderBy: { versionNo: "asc" } },
        },
        orderBy: [{ title: "asc" }],
    })
    return policies.flatMap(p => {
        const current = p.versions.find(v => v.id === p.currentVersionId)
        if (!current) return []
        // A signature on an older version still counts unless a later version
        // (up to the current one) was published with "re-sign required".
        let minVersionNo = 1
        for (const v of p.versions) if (v.requireResign && v.versionNo <= current.versionNo) minVersionNo = v.versionNo
        return [{ policyId: p.id, title: p.title, category: p.category, currentVersionId: current.id, currentVersionNo: current.versionNo, minVersionNo }]
    })
}

/** Required policies for one employee, with what they have read and signed. */
export async function statusFor(employeeId: string, designation: string | null | undefined, scope: PolicyScope = "all"): Promise<RequiredPolicy[]> {
    const apps = await applicablePolicies(designation, scope)
    if (!apps.length) return []
    const [versions, acks] = await Promise.all([
        prisma.signoffPolicyVersion.findMany({
            where: { id: { in: apps.map(a => a.currentVersionId) } },
            select: { id: true, versionNo: true, title: true, content: true, contentHash: true, attachmentUrl: true, effectiveFrom: true },
        }),
        prisma.signoffAck.findMany({
            where: { employeeId, version: { policyId: { in: apps.map(a => a.policyId) } } },
            select: { id: true, versionId: true, scrolledAt: true, signedAt: true, version: { select: { policyId: true, versionNo: true } } },
        }),
    ])
    const vById = new Map(versions.map(v => [v.id, v]))
    return apps.map(a => {
        const v = vById.get(a.currentVersionId)!
        const mine = acks.filter(k => k.version.policyId === a.policyId)
        const current = mine.find(k => k.versionId === a.currentVersionId)
        // Newest valid signature (current version, or an older one still in force).
        const signed = mine
            .filter(k => k.signedAt && k.version.versionNo >= a.minVersionNo)
            .sort((x, y) => y.version.versionNo - x.version.versionNo)[0]
        const status: PolicyStatus = signed ? "SIGNED" : current?.scrolledAt ? "READY" : "TO_READ"
        return {
            policyId: a.policyId,
            versionId: v.id,
            versionNo: v.versionNo,
            title: v.title,
            category: a.category,
            content: v.content,
            contentHash: v.contentHash,
            attachmentUrl: v.attachmentUrl,
            effectiveFrom: v.effectiveFrom?.toISOString() ?? null,
            status,
            scrolledAt: current?.scrolledAt?.toISOString() ?? null,
            signedAt: signed?.signedAt?.toISOString() ?? null,
            signedVersionNo: signed?.version.versionNo ?? null,
            ackId: signed?.id ?? null,
        }
    })
}

/** Titles of required policies not yet signed (for the submit / approval gates). */
export async function pendingTitles(employeeId: string, designation: string | null | undefined, scope: PolicyScope = "all"): Promise<string[]> {
    if (!(await signoffReady())) return []
    const list = await statusFor(employeeId, designation, scope)
    return list.filter(p => p.status !== "SIGNED").map(p => p.title)
}

// ─── Reading and signing ─────────────────────────────────────────────────────

export type Signer = {
    id: string
    firstName: string
    middleName: string | null
    lastName: string
    nameAsPerAadhar: string | null
}

export type Evidence = { ip: string | null; userAgent: string | null; channel: "ONBOARDING_LINK" | "SELF_SERVICE"; actorId: string | null }

export function evidenceFrom(req: Request, channel: Evidence["channel"], actorId: string | null): Evidence {
    const fwd = req.headers.get("x-forwarded-for")
    const ip = (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip"))?.trim() || null
    return { ip: ip ? ip.slice(0, 64) : null, userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null, channel, actorId }
}

/** The version must be the current version of a policy this employee has to sign. */
async function assertSignable(versionId: string, designation: string | null | undefined) {
    const version = await prisma.signoffPolicyVersion.findUnique({
        where: { id: versionId },
        select: { id: true, policyId: true, versionNo: true, contentHash: true, title: true },
    })
    if (!version) throw new PolicyError(404, "NOT_FOUND", "Policy not found")
    const apps = await applicablePolicies(designation)
    const app = apps.find(a => a.policyId === version.policyId)
    if (!app) throw new PolicyError(403, "POLICY_NOT_REQUIRED", "This policy doesn't apply to your designation, or it has been withdrawn")
    if (app.currentVersionId !== version.id) {
        throw new PolicyError(409, "VERSION_OUTDATED", "This policy was updated while you were reading — please read the latest version", { currentVersionId: app.currentVersionId })
    }
    return version
}

export async function recordScrolled(employee: Signer, designation: string | null | undefined, versionId: string, ev: Evidence) {
    await assertSignable(versionId, designation)
    const existing = await prisma.signoffAck.findUnique({ where: { employeeId_versionId: { employeeId: employee.id, versionId } } })
    if (existing?.scrolledAt) return existing
    if (existing) {
        return prisma.signoffAck.update({ where: { id: existing.id }, data: { scrolledAt: new Date() } })
    }
    try {
        return await prisma.signoffAck.create({
            data: { employeeId: employee.id, versionId, scrolledAt: new Date(), channel: ev.channel, ipAddress: ev.ip, userAgent: ev.userAgent },
        })
    } catch (e) {
        // Two tabs / a retried request: the other one won.
        if (!isUniqueErr(e)) throw e
        return prisma.signoffAck.findUniqueOrThrow({ where: { employeeId_versionId: { employeeId: employee.id, versionId } } })
    }
}

const PNG_RE = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/
const MAX_SIGNATURE = 300_000

export function acceptableNames(e: Signer): string[] {
    return Array.from(new Set([
        `${e.firstName} ${e.lastName}`,
        `${e.firstName} ${e.middleName ?? ""} ${e.lastName}`,
        e.nameAsPerAadhar ?? "",
    ].map(nameKey).filter(Boolean)))
}

export async function signPolicy(employee: Signer, designation: string | null | undefined, versionId: string, body: unknown, ev: Evidence) {
    const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
    const version = await assertSignable(versionId, designation)
    const ack = await prisma.signoffAck.findUnique({ where: { employeeId_versionId: { employeeId: employee.id, versionId } } })

    // Idempotent: a double click or a retried request gets the same signature back.
    if (ack?.signedAt) return { ack, contentHash: version.contentHash, created: false }

    if (!ack?.scrolledAt) throw new PolicyError(409, "POLICY_NOT_SCROLLED", "Read the policy to the end before signing")
    if (b.agreed !== true) throw new PolicyError(422, "AGREEMENT_REQUIRED", "Tick “I have read and agree” to sign")

    const typed = typeof b.typedName === "string" ? b.typedName : ""
    if (!nameKey(typed)) throw new PolicyError(422, "NAME_MISMATCH", "Type your full name to sign")
    if (!acceptableNames(employee).includes(nameKey(typed))) {
        throw new PolicyError(422, "NAME_MISMATCH", `The name must match your record: ${employee.firstName} ${employee.lastName}`.trim())
    }

    let image: string | null = null
    if (b.signatureImage !== undefined && b.signatureImage !== null && b.signatureImage !== "") {
        if (typeof b.signatureImage !== "string" || !PNG_RE.test(b.signatureImage)) {
            throw new PolicyError(400, "BAD_SIGNATURE", "The drawn signature couldn't be read — clear it and draw again")
        }
        if (b.signatureImage.length > MAX_SIGNATURE) throw new PolicyError(400, "BAD_SIGNATURE", "The drawn signature is too large — clear it and draw again")
        image = b.signatureImage
    }

    const signedAt = new Date()
    const done = await prisma.$transaction(async tx => {
        // Guarded on signedAt so two concurrent signs can't both write.
        const res = await tx.signoffAck.updateMany({
            where: { id: ack.id, signedAt: null },
            data: {
                signedAt, typedName: typed.trim().slice(0, 120), signatureType: image ? "DRAWN" : "TYPED",
                signatureImage: image, ipAddress: ev.ip, userAgent: ev.userAgent, channel: ev.channel,
            },
        })
        if (res.count === 0) return false
        await audit(tx, {
            actorId: ev.actorId, entity: "SignoffAck", entityId: ack.id, action: "SIGN",
            after: { employeeId: employee.id, versionId, versionNo: version.versionNo, contentHash: version.contentHash, channel: ev.channel, ip: ev.ip },
        })
        return true
    })
    const fresh = await prisma.signoffAck.findUniqueOrThrow({ where: { id: ack.id } })
    return { ack: fresh, contentHash: version.contentHash, created: done }
}

export const SIGNER_SELECT = {
    id: true, firstName: true, middleName: true, lastName: true, nameAsPerAadhar: true,
    designation: true, status: true, employeeId: true, userId: true,
} as const
