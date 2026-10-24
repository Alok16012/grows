import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { cleanContent, cleanText, cleanUrl, parseDate, policyErrorResponse, PolicyError, audit, versionHash } from "@/lib/policy-signoff"
import { adminCtx, requireManage, signoffCounts, POLICY_INCLUDE } from "@/lib/policy-admin"

type Params = { params: { id: string } }

async function load(id: string) {
    const p = await prisma.signoffPolicy.findUnique({ where: { id }, include: POLICY_INCLUDE })
    if (!p) throw new PolicyError(404, "NOT_FOUND", "Policy not found")
    return p
}

// GET — detail: draft, version history, designations, counts.
export async function GET(req: Request, { params }: Params) {
    try {
        await adminCtx(req)
        const p = await load(params.id)
        const current = p.versions.find(v => v.id === p.currentVersionId) ?? null
        const currentContent = current
            ? await prisma.signoffPolicyVersion.findUnique({ where: { id: current.id }, select: { content: true } })
            : null
        const draftHash = versionHash({ title: p.title, content: p.draftContent, attachmentUrl: p.draftAttachmentUrl })
        const counts = (await signoffCounts([p])).get(p.id) ?? { required: 0, signed: 0 }
        // People with a signature on any version — the ones a "re-sign" publish affects.
        const signedAny = await prisma.signoffAck.findMany({
            where: { signedAt: { not: null }, version: { policyId: p.id } },
            select: { employeeId: true }, distinct: ["employeeId"],
        })
        return NextResponse.json({
            policy: {
                ...p,
                designations: p.designations.map(d => d.designation),
                currentVersionNo: current?.versionNo ?? null,
                currentContent: currentContent?.content ?? null,
                hasDraftChanges: !current || draftHash !== current.contentHash,
                required: counts.required,
                signed: counts.signed,
                signedAnyVersion: signedAny.length,
            },
        })
    } catch (e) {
        return policyErrorResponse(e, "[POLICY_GET]")
    }
}

// PUT — save draft edits. Send the updatedAt you loaded; a stale one is refused.
export async function PUT(req: Request, { params }: Params) {
    try {
        const ctx = await adminCtx(req)
        requireManage(ctx)
        const b = await req.json().catch(() => ({}))
        const p = await load(params.id)
        if (p.status === "ARCHIVED") throw new PolicyError(409, "ARCHIVED", "Restore the policy before editing it")
        if (b?.updatedAt && new Date(b.updatedAt).getTime() !== p.updatedAt.getTime()) {
            throw new PolicyError(409, "STALE_DRAFT", "Someone else changed this policy since you opened it — reload to see their changes")
        }
        const data: Record<string, unknown> = {}
        if (b?.title !== undefined) {
            const t = cleanText(b.title, 200)
            if (!t) throw new PolicyError(400, "TITLE_REQUIRED", "Policy title is required")
            data.title = t
        }
        if (b?.category !== undefined) data.category = cleanText(b.category, 60)
        if (b?.content !== undefined) data.draftContent = cleanContent(b.content)
        if (b?.attachmentUrl !== undefined) data.draftAttachmentUrl = cleanUrl(b.attachmentUrl)
        if (b?.effectiveFrom !== undefined) data.draftEffectiveFrom = parseDate(b.effectiveFrom)
        if (b?.changeNote !== undefined) data.draftChangeNote = cleanText(b.changeNote, 500)
        if (b?.requiresSignature !== undefined) data.requiresSignature = b.requiresSignature === true
        if (b?.appliesToAll !== undefined) data.appliesToAll = b.appliesToAll === true
        // Guarded on updatedAt so two admins saving at once can't both win.
        const res = await prisma.signoffPolicy.updateMany({ where: { id: p.id, updatedAt: p.updatedAt }, data })
        if (res.count === 0) throw new PolicyError(409, "STALE_DRAFT", "Someone else changed this policy since you opened it — reload to see their changes")
        await audit(prisma, { actorId: ctx.userId, entity: "SignoffPolicy", entityId: p.id, action: "EDIT_DRAFT", after: Object.keys(data) })
        const fresh = await prisma.signoffPolicy.findUnique({ where: { id: p.id }, select: { id: true, updatedAt: true } })
        return NextResponse.json({ policy: fresh })
    } catch (e) {
        return policyErrorResponse(e, "[POLICY_PUT]")
    }
}

// PATCH { action: ARCHIVE | RESTORE }
export async function PATCH(req: Request, { params }: Params) {
    try {
        const ctx = await adminCtx(req)
        requireManage(ctx)
        const b = await req.json().catch(() => ({}))
        const p = await load(params.id)
        if (b?.action === "ARCHIVE") {
            if (p.status === "ARCHIVED") return NextResponse.json({ status: p.status })
            await prisma.signoffPolicy.update({ where: { id: p.id }, data: { status: "ARCHIVED" } })
        } else if (b?.action === "RESTORE") {
            if (p.status !== "ARCHIVED") return NextResponse.json({ status: p.status })
            await prisma.signoffPolicy.update({ where: { id: p.id }, data: { status: p.currentVersionId ? "ACTIVE" : "DRAFT" } })
        } else {
            throw new PolicyError(400, "BAD_ACTION", "action must be ARCHIVE or RESTORE")
        }
        await audit(prisma, { actorId: ctx.userId, entity: "SignoffPolicy", entityId: p.id, action: b.action, before: { status: p.status } })
        const fresh = await prisma.signoffPolicy.findUnique({ where: { id: p.id }, select: { status: true } })
        return NextResponse.json({ status: fresh?.status })
    } catch (e) {
        return policyErrorResponse(e, "[POLICY_PATCH]")
    }
}

// DELETE — a never-published draft is deleted; anything published is archived instead.
export async function DELETE(req: Request, { params }: Params) {
    try {
        const ctx = await adminCtx(req)
        requireManage(ctx)
        const p = await load(params.id)
        if (p.versions.length === 0) {
            await prisma.$transaction(async tx => {
                await tx.signoffPolicy.delete({ where: { id: p.id } })
                await audit(tx, { actorId: ctx.userId, entity: "SignoffPolicy", entityId: p.id, action: "DELETE", before: { title: p.title } })
            })
            return NextResponse.json({ deleted: true })
        }
        if (p.status !== "ARCHIVED") {
            await prisma.signoffPolicy.update({ where: { id: p.id }, data: { status: "ARCHIVED" } })
            await audit(prisma, { actorId: ctx.userId, entity: "SignoffPolicy", entityId: p.id, action: "ARCHIVE", before: { status: p.status } })
        }
        return NextResponse.json({ deleted: false, archived: true, message: "Published policies are archived, never deleted — signatures and versions are kept" })
    } catch (e) {
        return policyErrorResponse(e, "[POLICY_DELETE]")
    }
}
