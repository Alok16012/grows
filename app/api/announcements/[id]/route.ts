import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "announcements.manage")) {
        return new NextResponse("Forbidden", { status: 403 })
    }
    const body = await req.json().catch(() => ({}))
    const data: Record<string, unknown> = {}
    for (const k of ["title", "body", "category", "pinned", "isActive"]) {
        if (k in body) data[k] = body[k]
    }
    const updated = await prisma.announcement.update({ where: { id: params.id }, data })
    return NextResponse.json(updated)
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "announcements.manage")) {
        return new NextResponse("Forbidden", { status: 403 })
    }
    await prisma.announcement.delete({ where: { id: params.id } })
    return NextResponse.json({ ok: true })
}
