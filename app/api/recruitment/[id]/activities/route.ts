import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { resolveUserId } from "@/lib/resolveUserId"

export async function POST(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== Role.ADMIN && session.user.role !== Role.MANAGER)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { type, content } = await req.json()
    if (!type || !content?.trim()) {
        return NextResponse.json({ error: "Type and content required" }, { status: 400 })
    }

    const lead = await prisma.lead.findUnique({ where: { id: params.id } })
    if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const activity = await prisma.leadActivity.create({
        data: {
            leadId: params.id,
            userId: session.user.id,
            type,
            content: content.trim()
        },
        include: { user: { select: { id: true, name: true } } }
    })

    return NextResponse.json(activity)
}
