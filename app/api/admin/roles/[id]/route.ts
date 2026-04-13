import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(_: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== "ADMIN") {
        return new NextResponse("Unauthorized", { status: 401 })
    }
    try {
        const role = await prisma.customRole.findUnique({
            where: { id: params.id },
            include: { _count: { select: { users: true } } },
        })
        if (!role) return new NextResponse("Not found", { status: 404 })
        return NextResponse.json(role)
    } catch (e) {
        console.error("[ROLE_GET]", e)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== "ADMIN") {
        return new NextResponse("Unauthorized", { status: 401 })
    }
    try {
        const { name, description, permissions, color, isActive } = await req.json()
        if (!name?.trim()) return new NextResponse("Name is required", { status: 400 })

        // Check name uniqueness (excluding current)
        const conflict = await prisma.customRole.findFirst({
            where: { name: name.trim(), NOT: { id: params.id } },
        })
        if (conflict) return new NextResponse("Role name already exists", { status: 409 })

        const role = await prisma.customRole.update({
            where: { id: params.id },
            data: {
                name: name.trim(),
                description: description?.trim() || null,
                permissions: permissions || [],
                color: color || "#6366f1",
                isActive: isActive ?? true,
                updatedAt: new Date(),
            },
            include: { _count: { select: { users: true } } },
        })
        return NextResponse.json(role)
    } catch (e) {
        console.error("[ROLE_PUT]", e)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== "ADMIN") {
        return new NextResponse("Unauthorized", { status: 401 })
    }
    try {
        // Unassign users before deleting
        await prisma.user.updateMany({
            where: { customRoleId: params.id },
            data: { customRoleId: null },
        })
        await prisma.customRole.delete({ where: { id: params.id } })
        return new NextResponse(null, { status: 204 })
    } catch (e) {
        console.error("[ROLE_DELETE]", e)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
