import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

export async function GET(_: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    try {
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
        const { action, rejectionNote, content, remarks } = await req.json()
        const now = new Date()
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
