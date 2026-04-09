import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { resolveUserId } from "@/lib/resolveUserId"

export async function GET(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== Role.ADMIN && session.user.role !== Role.MANAGER)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const docs = await prisma.leadDocument.findMany({
        where: { leadId: params.id },
        include: { uploader: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" }
    })

    return NextResponse.json(docs)
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== Role.ADMIN && session.user.role !== Role.MANAGER)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { docType, fileName, url } = await req.json()
    if (!docType || !fileName || !url) {
        return NextResponse.json({ error: "docType, fileName and url are required" }, { status: 400 })
    }

    const lead = await prisma.lead.findUnique({ where: { id: params.id } })
    if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const uploaderId = await resolveUserId(session)
    if (!uploaderId) return NextResponse.json({ error: "User not found. Please log in again." }, { status: 403 })

    const doc = await prisma.leadDocument.create({
        data: {
            leadId: params.id,
            docType,
            fileName,
            url,
            uploadedBy: uploaderId,
        },
        include: { uploader: { select: { id: true, name: true } } }
    })

    return NextResponse.json(doc)
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== Role.ADMIN && session.user.role !== Role.MANAGER)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { docId, verified } = await req.json()
    if (!docId || !verified) {
        return NextResponse.json({ error: "docId and verified status required" }, { status: 400 })
    }

    const doc = await prisma.leadDocument.update({
        where: { id: docId },
        data: { verified },
        include: { uploader: { select: { id: true, name: true } } }
    })

    return NextResponse.json(doc)
}
