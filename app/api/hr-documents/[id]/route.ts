import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { ensureHrDocRecallSchema, type HrDocHistoryEvent } from "@/lib/hr-doc-schema"

export async function GET(_: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    try {
        await ensureHrDocRecallSchema()
        const doc = await prisma.hrDocument.findUnique({
            where: { id: params.id },
            include: {
                employee: { include: { branch: { include: { company: true } }, department: true } },
                type: true
            }
        })
        if (!doc) return new NextResponse("Not found", { status: 404 })
        return NextResponse.json(doc)
    } catch (e) {
        console.error("[HR_DOC_GET]", e)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    // Any HrDocument read/write below selects the recall audit columns, so make
    // sure they exist first (prod migrations don't auto-run).
    await ensureHrDocRecallSchema()
    if (!session || !checkAccess(session, ["MANAGER", "HR_MANAGER"], "documents.view")) {
        // Allow employees to acknowledge their own documents
        if (session) {
            const body = await req.json()
            if (body.action === "acknowledge") {
                const doc = await prisma.hrDocument.findUnique({ where: { id: params.id } })
                if (!doc) return new NextResponse("Not found", { status: 404 })
                const now = new Date()
                const updated = await prisma.hrDocument.update({
                    where: { id: params.id },
                    data: { acknowledged: true, acknowledgedAt: now, updatedAt: now }
                })
                return NextResponse.json(updated)
            }
        }
        return new NextResponse("Forbidden", { status: 403 })
    }
    try {
        const { action, rejectionNote, content, remarks, reason } = await req.json()
        const now = new Date()

        // ── Recall / Re-issue ────────────────────────────────────────────────
        // Pull back a document sent by mistake, or re-issue a recalled one. Both
        // append to the per-document history so the full trail is preserved.
        if (action === "recall" || action === "reissue") {
            const existing = await prisma.hrDocument.findUnique({ where: { id: params.id } })
            if (!existing) return new NextResponse("Not found", { status: 404 })

            if (action === "recall" && existing.status !== "ISSUED") {
                return new NextResponse("Only issued documents can be recalled", { status: 400 })
            }
            if (action === "reissue" && existing.status !== "RECALLED") {
                return new NextResponse("Only recalled documents can be re-issued", { status: 400 })
            }

            const byName = session.user.name || session.user.email || "—"
            const prior: HrDocHistoryEvent[] = Array.isArray((existing as any).history) ? (existing as any).history : []
            const event: HrDocHistoryEvent = {
                action,
                by: session.user.id,
                byName,
                at: now.toISOString(),
                ...(action === "recall" && reason ? { reason } : {}),
            }

            const data: Record<string, unknown> =
                action === "recall"
                    ? {
                        status: "RECALLED",
                        recalledBy: session.user.id,
                        recalledAt: now,
                        recallReason: reason || null,
                        recallCount: { increment: 1 },
                        history: [...prior, event],
                        updatedAt: now,
                    }
                    : {
                        status: "ISSUED",
                        issuedBy: session.user.id,
                        issuedAt: now,
                        // clear the "currently recalled" markers; recallCount +
                        // history keep the audit trail intact
                        recalledBy: null,
                        recalledAt: null,
                        recallReason: null,
                        history: [...prior, event],
                        updatedAt: now,
                    }

            const updated = await prisma.hrDocument.update({ where: { id: params.id }, data })
            return NextResponse.json(updated)
        }

        let data: Record<string, unknown> = { updatedAt: now }

        if (action === "approve") {
            data = { ...data, status: "APPROVED", approvedBy: session.user.id, approvedAt: now }
        } else if (action === "reject") {
            data = { ...data, status: "REJECTED", rejectionNote, approvedBy: session.user.id, approvedAt: now }
        } else if (action === "issue") {
            data = { ...data, status: "ISSUED", issuedBy: session.user.id, issuedAt: now }
        } else if (action === "send_approval") {
            data = { ...data, status: "PENDING_APPROVAL" }
        } else if (action === "save_draft") {
            data = { ...data, status: "DRAFT", content, remarks }
        } else if (action === "acknowledge") {
            data = { ...data, acknowledged: true, acknowledgedAt: now }
        }

        const doc = await prisma.hrDocument.update({ where: { id: params.id }, data })
        return NextResponse.json(doc)
    } catch (e) {
        console.error("[HR_DOC_PUT]", e)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session || !checkAccess(session, [], "documents.view")) return new NextResponse("Forbidden", { status: 403 })
    try {
        await prisma.hrDocument.delete({ where: { id: params.id } })
        return new NextResponse(null, { status: 204 })
    } catch (e) {
        console.error("[HR_DOC_DELETE]", e)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
