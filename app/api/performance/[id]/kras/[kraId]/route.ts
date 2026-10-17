import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

// PUT — rename / reweight a KRA. DELETE — remove it with its KPIs.
export async function PUT(req: Request, { params }: { params: { id: string; kraId: string } }) {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "performance.manage")) return new NextResponse("Forbidden", { status: 403 })
    const { title, description, weightage } = await req.json()
    const data: Record<string, unknown> = {}
    if (title !== undefined) { if (!String(title).trim()) return new NextResponse("Title is required", { status: 400 }); data.title = String(title).trim() }
    if (description !== undefined) data.description = description || null
    if (weightage !== undefined) data.weightage = Math.max(0, Math.min(100, Number(weightage) || 0))
    const res = await prisma.kRA.updateMany({ where: { id: params.kraId, reviewId: params.id }, data })
    if (!res.count) return new NextResponse("KRA not found", { status: 404 })
    return NextResponse.json({ success: true })
}

export async function DELETE(_req: Request, { params }: { params: { id: string; kraId: string } }) {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "performance.manage")) return new NextResponse("Forbidden", { status: 403 })
    const kra = await prisma.kRA.findFirst({ where: { id: params.kraId, reviewId: params.id }, select: { id: true } })
    if (!kra) return new NextResponse("KRA not found", { status: 404 })
    await prisma.$transaction([
        prisma.kPI.deleteMany({ where: { kraId: kra.id, reviewId: params.id } }),
        prisma.kRA.delete({ where: { id: kra.id } }),
    ])
    return NextResponse.json({ success: true })
}
