import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { cleanContent, cleanText, cleanUrl, parseDate, policyErrorResponse, PolicyError, audit, versionHash } from "@/lib/policy-signoff"
import { designationKey } from "@/lib/policy-text"
import { adminCtx, requireManage, cleanDesignations, signoffCounts, POLICY_INCLUDE } from "@/lib/policy-admin"

const STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"]

// GET ?status=&designation=&q= — policy list with designations and sign-off counts.
export async function GET(req: Request) {
    try {
        await adminCtx(req)
        const sp = new URL(req.url).searchParams
        const status = sp.get("status")
        const q = sp.get("q")?.trim()
        const dKey = designationKey(sp.get("designation"))
        const policies = await prisma.signoffPolicy.findMany({
            where: {
                ...(status === "ALL" ? {} : status && STATUSES.includes(status) ? { status } : { status: { not: "ARCHIVED" } }),
                ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { category: { contains: q, mode: "insensitive" } }] } : {}),
                ...(dKey ? { OR: [{ appliesToAll: true }, { designations: { some: { designationKey: dKey } } }] } : {}),
            },
            include: POLICY_INCLUDE,
            orderBy: [{ updatedAt: "desc" }],
        })
        const counts = await signoffCounts(policies)
        return NextResponse.json({
            policies: policies.map(p => {
                const current = p.versions.find(v => v.id === p.currentVersionId) ?? null
                return {
                    id: p.id, title: p.title, category: p.category, status: p.status,
                    requiresSignature: p.requiresSignature, appliesToAll: p.appliesToAll,
                    currentVersionNo: current?.versionNo ?? null,
                    publishedAt: current?.publishedAt ?? null,
                    effectiveFrom: current?.effectiveFrom ?? null,
                    designations: p.designations.map(d => d.designation),
                    updatedAt: p.updatedAt,
                    hasDraftChanges: !current || versionHash({ title: p.title, content: p.draftContent, attachmentUrl: p.draftAttachmentUrl }) !== current.contentHash,
                    required: counts.get(p.id)?.required ?? 0,
                    signed: counts.get(p.id)?.signed ?? 0,
                }
            }),
        })
    } catch (e) {
        return policyErrorResponse(e, "[POLICIES_GET]")
    }
}

// POST — create a draft policy.
export async function POST(req: Request) {
    try {
        const ctx = await adminCtx(req)
        requireManage(ctx)
        const b = await req.json().catch(() => ({}))
        const title = cleanText(b?.title, 200)
        if (!title) throw new PolicyError(400, "TITLE_REQUIRED", "Policy title is required")
        const designations = cleanDesignations(b?.designations)
        const policy = await prisma.$transaction(async tx => {
            const p = await tx.signoffPolicy.create({
                data: {
                    title,
                    category: cleanText(b?.category, 60),
                    requiresSignature: b?.requiresSignature !== false,
                    appliesToAll: b?.appliesToAll === true,
                    draftContent: cleanContent(b?.content),
                    draftAttachmentUrl: cleanUrl(b?.attachmentUrl),
                    draftEffectiveFrom: parseDate(b?.effectiveFrom),
                    draftChangeNote: cleanText(b?.changeNote, 500),
                    createdBy: ctx.userId,
                    designations: { create: designations.map(d => ({ designationKey: d.key, designation: d.label, assignedBy: ctx.userId })) },
                },
            })
            await audit(tx, { actorId: ctx.userId, entity: "SignoffPolicy", entityId: p.id, action: "CREATE", after: { title, designations: designations.map(d => d.label) } })
            return p
        })
        return NextResponse.json({ policy }, { status: 201 })
    } catch (e) {
        return policyErrorResponse(e, "[POLICIES_POST]")
    }
}
