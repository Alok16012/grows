import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { policyErrorResponse, PolicyError, audit } from "@/lib/policy-signoff"
import { adminCtx, requireManage, cleanDesignations } from "@/lib/policy-admin"

// POST { policyIds: string[], designations: string[] } — add designations to
// many policies at once (existing mappings are left as they are).
export async function POST(req: Request) {
    try {
        const ctx = await adminCtx(req)
        requireManage(ctx)
        const b = await req.json().catch(() => ({}))
        const ids: string[] = Array.isArray(b?.policyIds) ? Array.from(new Set((b.policyIds as unknown[]).map(String).filter(Boolean))) : []
        const list = cleanDesignations(b?.designations ?? [])
        if (!ids.length) throw new PolicyError(400, "NO_POLICIES", "Pick at least one policy")
        if (!list.length) throw new PolicyError(400, "NO_DESIGNATIONS", "Pick at least one designation")
        if (ids.length > 200) throw new PolicyError(400, "TOO_MANY", "At most 200 policies at a time")
        const found = await prisma.signoffPolicy.findMany({ where: { id: { in: ids } }, select: { id: true, status: true } })
        if (found.length !== ids.length) throw new PolicyError(400, "NOT_FOUND", "A policy wasn't found")
        if (found.some(p => p.status === "ARCHIVED")) throw new PolicyError(409, "ARCHIVED", "Archived policies can't be assigned — restore them first")
        const res = await prisma.$transaction(async tx => {
            const r = await tx.signoffPolicyDesignation.createMany({
                data: ids.flatMap(policyId => list.map(d => ({ policyId, designationKey: d.key, designation: d.label, assignedBy: ctx.userId }))),
                skipDuplicates: true,
            })
            for (const policyId of ids) {
                await audit(tx, { actorId: ctx.userId, entity: "SignoffPolicy", entityId: policyId, action: "BULK_ASSIGN", after: { designations: list.map(d => d.label) } })
            }
            return r
        })
        return NextResponse.json({ added: res.count, policies: ids.length, designations: list.length })
    } catch (e) {
        return policyErrorResponse(e, "[POLICY_BULK_ASSIGN]")
    }
}
