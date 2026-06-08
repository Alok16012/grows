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
    if ("name" in body) data.name = body.name
    if ("type" in body) data.type = body.type
    if ("description" in body) data.description = body.description
    if ("date" in body) data.date = new Date(body.date)
    const updated = await prisma.holiday.update({ where: { id: params.id }, data })
    return NextResponse.json(updated)
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "announcements.manage")) {
        return new NextResponse("Forbidden", { status: 403 })
    }
    await prisma.holiday.delete({ where: { id: params.id } })
    return NextResponse.json({ ok: true })
}
