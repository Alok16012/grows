import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { policyErrorResponse, PolicyError, audit } from "@/lib/policy-signoff"
import { adminCtx, requireManage, cleanDesignations, employeesInScope, notifyToSign } from "@/lib/policy-admin"

// PUT { designations: string[], appliesToAll?: boolean } — replace the mapping.
// Unassigning keeps every signature already given; newly covered employees of a
// live policy are told they have something to sign.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
    try {
        const ctx = await adminCtx(req)
        requireManage(ctx)
        const b = await req.json().catch(() => ({}))
        const list = cleanDesignations(b?.designations ?? [])
        const p = await prisma.signoffPolicy.findUnique({ where: { id: params.id }, include: { designations: { select: { designationKey: true, designation: true } } } })
        if (!p) throw new PolicyError(404, "NOT_FOUND", "Policy not found")
        if (p.status === "ARCHIVED") throw new PolicyError(409, "ARCHIVED", "Restore the policy before changing who it applies to")
        const appliesToAll = b?.appliesToAll === undefined ? p.appliesToAll : b.appliesToAll === true
        if (p.status === "ACTIVE" && !appliesToAll && list.length === 0) {
            throw new PolicyError(400, "NO_DESIGNATIONS", "A live policy needs at least one designation — archive it instead")
        }
        const before = await employeesInScope(p)
        await prisma.$transaction(async tx => {
            await tx.signoffPolicyDesignation.deleteMany({ where: { policyId: p.id, designationKey: { notIn: list.map(d => d.key) } } })
            await tx.signoffPolicyDesignation.createMany({
                data: list.map(d => ({ policyId: p.id, designationKey: d.key, designation: d.label, assignedBy: ctx.userId })),
                skipDuplicates: true,
            })
            if (appliesToAll !== p.appliesToAll) await tx.signoffPolicy.update({ where: { id: p.id }, data: { appliesToAll } })
            await audit(tx, {
                actorId: ctx.userId, entity: "SignoffPolicy", entityId: p.id, action: "ASSIGN",
                before: { appliesToAll: p.appliesToAll, designations: p.designations.map(d => d.designation) },
                after: { appliesToAll, designations: list.map(d => d.label) },
            })
        })
        let notified = 0
        if (p.status === "ACTIVE" && p.currentVersionId) {
            const after = await employeesInScope({ id: p.id, appliesToAll, designations: list.map(d => ({ designationKey: d.key })) })
            const had = new Set(before.map(e => e.id))
            notified = await notifyToSign(after.filter(e => !had.has(e.id) && e.status !== "ONBOARDING"), p.title, false)
        }
        return NextResponse.json({ designations: list.map(d => d.label), appliesToAll, notified })
    } catch (e) {
        return policyErrorResponse(e, "[POLICY_DESIGNATIONS_PUT]")
    }
}
