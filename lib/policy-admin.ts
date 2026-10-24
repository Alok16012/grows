// Admin side of policy sign-off: who is affected by a policy, sign-off counts,
// and notifying employees who now have something to sign.
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { canManagePolicies, canReportPolicies, canViewPolicies } from "@/lib/permissions"
import { PolicyError } from "@/lib/policy-signoff"
import { designationKey } from "@/lib/policy-text"

export type AdminCtx = { userId: string; canManage: boolean; canReport: boolean; canView: boolean }

export async function adminCtx(req: Request): Promise<AdminCtx> {
    const session = await getApiSession(req)
    if (!session?.user?.id) throw new PolicyError(401, "UNAUTHORIZED", "Unauthorized")
    const ctx = {
        userId: session.user.id,
        canManage: canManagePolicies(session),
        canReport: canReportPolicies(session),
        canView: canViewPolicies(session),
    }
    if (!ctx.canView) throw new PolicyError(403, "FORBIDDEN", "Forbidden")
    return ctx
}

export function requireManage(ctx: AdminCtx) {
    if (!ctx.canManage) throw new PolicyError(403, "FORBIDDEN", "Only HR with policy.manage can change policies")
}

export function requireReport(ctx: AdminCtx) {
    if (!ctx.canReport) throw new PolicyError(403, "FORBIDDEN", "Only HR with policy.report can see sign-offs")
}

/** Designations from a request body: trimmed, de-duplicated by key, at most 300. */
export function cleanDesignations(v: unknown): { key: string; label: string }[] {
    if (v === undefined) return []
    if (!Array.isArray(v)) throw new PolicyError(400, "BAD_DESIGNATIONS", "designations must be a list")
    const seen = new Map<string, string>()
    for (const raw of v) {
        if (typeof raw !== "string") continue
        const label = raw.trim().replace(/\s+/g, " ").slice(0, 120)
        const key = designationKey(label)
        if (key && !seen.has(key)) seen.set(key, label)
    }
    if (seen.size > 300) throw new PolicyError(400, "BAD_DESIGNATIONS", "At most 300 designations per policy")
    return Array.from(seen, ([key, label]) => ({ key, label }))
}

/** People who still count as staff: joining, working or on leave. */
const STAFF_WHERE = { status: { in: ["ONBOARDING", "ACTIVE", "ON_LEAVE"] as ("ONBOARDING" | "ACTIVE" | "ON_LEAVE")[] } }

type PolicyScope = { id: string; appliesToAll: boolean; designations: { designationKey: string }[] }

/** Employees a policy applies to (by designation, or everyone). */
export async function employeesInScope(p: PolicyScope) {
    const all = await prisma.employee.findMany({
        where: STAFF_WHERE,
        select: { id: true, employeeId: true, firstName: true, lastName: true, designation: true, status: true, userId: true },
    })
    if (p.appliesToAll) return all
    const keys = new Set(p.designations.map(d => d.designationKey))
    return all.filter(e => keys.has(designationKey(e.designation)))
}

/** Lowest version number whose signature still counts (last "re-sign" publish). */
export function minValidVersion(versions: { versionNo: number; requireResign: boolean }[], currentNo: number) {
    let min = 1
    for (const v of versions) if (v.requireResign && v.versionNo <= currentNo) min = v.versionNo
    return min
}

/** Sign-off counts for many policies in one pass. */
export async function signoffCounts(policies: (PolicyScope & { currentVersionId: string | null; status: string; versions: { id: string; versionNo: number; requireResign: boolean }[] })[]) {
    const out = new Map<string, { required: number; signed: number }>()
    if (!policies.length) return out
    const live = policies.filter(p => p.currentVersionId)
    const [staff, acks] = await Promise.all([
        prisma.employee.findMany({ where: STAFF_WHERE, select: { id: true, designation: true } }),
        live.length ? prisma.signoffAck.findMany({
            where: { signedAt: { not: null }, version: { policyId: { in: live.map(p => p.id) } } },
            select: { employeeId: true, version: { select: { policyId: true, versionNo: true } } },
        }) : Promise.resolve([]),
    ])
    for (const p of policies) {
        const keys = new Set(p.designations.map(d => d.designationKey))
        const inScope = staff.filter(e => p.appliesToAll || keys.has(designationKey(e.designation)))
        const current = p.versions.find(v => v.id === p.currentVersionId)
        // A draft has no signatures yet, but HR still sees how many people it will reach.
        if (!current) { out.set(p.id, { required: inScope.length, signed: 0 }); continue }
        const min = minValidVersion(p.versions, current.versionNo)
        const ids = new Set(inScope.map(e => e.id))
        const signed = new Set(acks.filter(a => a.version.policyId === p.id && a.version.versionNo >= min && ids.has(a.employeeId)).map(a => a.employeeId))
        out.set(p.id, { required: inScope.length, signed: signed.size })
    }
    return out
}

/** In-app notification to employees (with a login) who now have a policy to sign. */
export async function notifyToSign(employees: { userId: string | null }[], title: string, resign: boolean) {
    const userIds = Array.from(new Set(employees.map(e => e.userId).filter((x): x is string => !!x))).slice(0, 5000)
    if (!userIds.length) return 0
    await prisma.notification.createMany({
        data: userIds.map(userId => ({
            userId,
            title: resign ? "Policy updated — please sign again" : "New policy to sign",
            message: resign ? `“${title}” was updated. Read it and sign the new version.` : `Read and sign “${title}”.`,
            type: "policy",
            link: "/profile?tab=policies",
        })),
    }).catch(e => console.error("[POLICY_NOTIFY]", e))
    return userIds.length
}

export const POLICY_INCLUDE = {
    designations: { select: { designationKey: true, designation: true }, orderBy: { designation: "asc" } },
    versions: {
        select: { id: true, versionNo: true, title: true, contentHash: true, changeNote: true, effectiveFrom: true, requireResign: true, publishedAt: true, publishedBy: true, attachmentUrl: true },
        orderBy: { versionNo: "desc" },
    },
} as const
