import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

// Public GET — no auth required (used by public apply page)
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
    const form = await prisma.leadForm.findUnique({
        where: { slug: params.slug },
        include: { site: { select: { id: true, name: true } } },
    })
    if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404 })
    if (!form.isActive) return NextResponse.json({ error: "This form is no longer active" }, { status: 410 })
    return NextResponse.json({ id: form.id, title: form.title, description: form.description, siteName: form.site?.name ?? null })
}

// PATCH — toggle active / update (admin only)
export async function PATCH(req: Request, { params }: { params: { slug: string } }) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const body = await req.json()
    const form = await prisma.leadForm.update({
        where: { slug: params.slug },
        data: {
            ...(body.title       !== undefined && { title: body.title }),
            ...(body.description !== undefined && { description: body.description }),
            ...(body.isActive    !== undefined && { isActive: body.isActive }),
            ...(body.siteId      !== undefined && { siteId: body.siteId || null }),
        },
    })
    return NextResponse.json(form)
}

export async function DELETE(_req: Request, { params }: { params: { slug: string } }) {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    await prisma.leadForm.delete({ where: { slug: params.slug } })
    return NextResponse.json({ success: true })
}
