import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { checkAccess } from "@/lib/permissions"

export async function POST(
    req: Request,
    { params }: { params: { id: string } }
) {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER"], "assignments.manage")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const inspection = await prisma.inspection.findUnique({ where: { id: params.id } })
    if (!inspection || inspection.status !== "approved") {
        return NextResponse.json({ error: "Only approved inspections can be shared" }, { status: 400 })
    }

    // Upsert shareable link
    const link = await prisma.shareableLink.upsert({
        where: { inspectionId: params.id },
        create: {
            inspectionId: params.id,
            createdBy: session!.user.id
        },
        update: {}
    })

    return NextResponse.json({ token: link.token })
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } }
) {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER"], "assignments.manage")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await prisma.shareableLink.deleteMany({ where: { inspectionId: params.id } })
    return NextResponse.json({ success: true })
}
