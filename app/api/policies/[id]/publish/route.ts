import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { policyErrorResponse, PolicyError, audit, versionHash } from "@/lib/policy-signoff"
import { adminCtx, requireManage, employeesInScope, minValidVersion, notifyToSign } from "@/lib/policy-admin"

// POST { requireResign } — publish the draft as a new immutable version.
export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        const ctx = await adminCtx(req)
        requireManage(ctx)
        const b = await req.json().catch(() => ({}))
        const result = await prisma.$transaction(async tx => {
            const p = await tx.signoffPolicy.findUnique({
                where: { id: params.id },
                include: { designations: { select: { designationKey: true } }, versions: { select: { id: true, versionNo: true, contentHash: true, requireResign: true }, orderBy: { versionNo: "desc" } } },
            })
            if (!p) throw new PolicyError(404, "NOT_FOUND", "Policy not found")
            if (p.status === "ARCHIVED") throw new PolicyError(409, "ARCHIVED", "Restore the policy before publishing")
            if (!p.draftContent.trim() && !p.draftAttachmentUrl) throw new PolicyError(400, "CONTENT_REQUIRED", "Add the policy text before publishing")
            if (!p.draftContent.trim()) throw new PolicyError(400, "CONTENT_REQUIRED", "Add the policy text — employees read and sign the text, the attachment is extra")
            if (!p.appliesToAll && p.designations.length === 0) {
                throw new PolicyError(400, "NO_DESIGNATIONS", "Assign at least one designation (or “All designations”) before publishing")
            }
            const hash = versionHash({ title: p.title, content: p.draftContent, attachmentUrl: p.draftAttachmentUrl })
            const latest = p.versions[0]
            if (latest && latest.id === p.currentVersionId && latest.contentHash === hash) {
                throw new PolicyError(409, "NO_CHANGES", `Nothing changed since version ${latest.versionNo} — edit the policy first`)
            }
            const versionNo = (latest?.versionNo ?? 0) + 1
            const requireResign = versionNo > 1 && b?.requireResign === true
            const v = await tx.signoffPolicyVersion.create({
                data: {
                    policyId: p.id, versionNo, title: p.title, content: p.draftContent, contentHash: hash,
                    attachmentUrl: p.draftAttachmentUrl, changeNote: p.draftChangeNote, effectiveFrom: p.draftEffectiveFrom,
                    requireResign, publishedBy: ctx.userId,
                },
            })
            // Guarded on updatedAt so a concurrent draft edit isn't silently published.
            const moved = await tx.signoffPolicy.updateMany({
                where: { id: p.id, updatedAt: p.updatedAt },
                data: { currentVersionId: v.id, status: "ACTIVE", draftChangeNote: null },
            })
            if (moved.count === 0) throw new PolicyError(409, "STALE_DRAFT", "The draft changed while publishing — reload and publish again")
            await audit(tx, { actorId: ctx.userId, entity: "SignoffPolicy", entityId: p.id, action: "PUBLISH", after: { versionNo, contentHash: hash, requireResign } })
            return { policy: p, version: v, previousNo: latest?.versionNo ?? 0, versions: [...p.versions, { id: v.id, versionNo, contentHash: hash, requireResign }] }
        })

        // Tell people who now have something to sign (joiners see it in onboarding).
        const scope = await employeesInScope(result.policy)
        let notified = 0
        if (result.version.versionNo === 1) {
            notified = await notifyToSign(scope.filter(e => e.status !== "ONBOARDING"), result.version.title, false)
        } else if (result.version.requireResign) {
            const min = minValidVersion(result.versions, result.previousNo)
            const prior = await prisma.signoffAck.findMany({
                where: { signedAt: { not: null }, employeeId: { in: scope.map(e => e.id) }, version: { policyId: result.policy.id, versionNo: { gte: min, lt: result.version.versionNo } } },
                select: { employeeId: true }, distinct: ["employeeId"],
            })
            const ids = new Set(prior.map(a => a.employeeId))
            notified = await notifyToSign(scope.filter(e => ids.has(e.id)), result.version.title, true)
        }
        return NextResponse.json({
            version: { id: result.version.id, versionNo: result.version.versionNo, contentHash: result.version.contentHash, requireResign: result.version.requireResign },
            notified,
        }, { status: 201 })
    } catch (e) {
        return policyErrorResponse(e, "[POLICY_PUBLISH]")
    }
}
