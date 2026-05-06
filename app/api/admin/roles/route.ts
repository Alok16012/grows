import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET() {
    const session = await getServerSession(authOptions)
    // Read access for ADMIN/MANAGER/HR_MANAGER so dashboards can display role names
    const r = session?.user?.role
    if (!session || (r !== "ADMIN" && r !== "MANAGER" && r !== "HR_MANAGER")) {
        return new NextResponse("Unauthorized", { status: 401 })
    }
    try {
        const roles = await prisma.customRole.findMany({
            orderBy: { createdAt: "asc" },
            include: { _count: { select: { users: true } } },
        })
        return NextResponse.json(roles)
    } catch (e) {
        console.error("[ROLES_GET]", e)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== "ADMIN") {
        return new NextResponse("Unauthorized", { status: 401 })
    }
    try {
        const { name, description, permissions, color } = await req.json()
        if (!name?.trim()) return new NextResponse("Name is required", { status: 400 })

        const existing = await prisma.customRole.findUnique({ where: { name: name.trim() } })
        if (existing) return new NextResponse("Role name already exists", { status: 409 })

        const role = await prisma.customRole.create({
            data: {
                name: name.trim(),
                description: description?.trim() || null,
                permissions: permissions || [],
                color: color || "#6366f1",
            },
            include: { _count: { select: { users: true } } },
        })
        return NextResponse.json(role)
    } catch (e) {
        console.error("[ROLES_POST]", e)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
