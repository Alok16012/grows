import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { resolveUserId } from "@/lib/resolveUserId"

export async function GET(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== Role.ADMIN && session.user.role !== Role.MANAGER && session.user.role !== Role.HR_MANAGER)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const followUps = await prisma.leadFollowUp.findMany({
        where: { leadId: params.id },
        include: { creator: { select: { id: true, name: true } } },
        orderBy: { scheduledAt: "asc" }
    })

    return NextResponse.json(followUps)
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== Role.ADMIN && session.user.role !== Role.MANAGER && session.user.role !== Role.HR_MANAGER)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { type, note, scheduledAt } = await req.json()
    if (!type || !scheduledAt) {
        return NextResponse.json({ error: "type and scheduledAt are required" }, { status: 400 })
    }

    const lead = await prisma.lead.findUnique({ where: { id: params.id } })
    if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const creatorId = await resolveUserId(session)
    if (!creatorId) return NextResponse.json({ error: "User not found. Please log in again." }, { status: 403 })

    const followUp = await prisma.leadFollowUp.create({
        data: {
            leadId: params.id,
            type,
            note: note || null,
            scheduledAt: new Date(scheduledAt),
            createdBy: creatorId,
        },
        include: { creator: { select: { id: true, name: true } } }
    })

    return NextResponse.json(followUp)
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== Role.ADMIN && session.user.role !== Role.MANAGER && session.user.role !== Role.HR_MANAGER)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { followUpId, status } = await req.json()
    if (!followUpId || !status) {
        return NextResponse.json({ error: "followUpId and status required" }, { status: 400 })
    }

    const updateData: any = { status }
    if (status === "DONE") updateData.completedAt = new Date()

    const followUp = await prisma.leadFollowUp.update({
        where: { id: followUpId },
        data: updateData,
        include: { creator: { select: { id: true, name: true } } }
    })

    return NextResponse.json(followUp)
}
