import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function PUT(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { name, description, isActive } = body

        if (!name) return new NextResponse("Name is required", { status: 400 })

        const department = await prisma.department.update({
            where: { id: params.id },
            data: {
                name,
                description: description || null,
                isActive: isActive ?? true,
            },
            include: { _count: { select: { employees: true } } },
        })

        return NextResponse.json(department)
    } catch (error) {
        console.error("[DEPARTMENTS_PUT]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        // Check if department has employees
        const dept = await prisma.department.findUnique({
            where: { id: params.id },
            include: { _count: { select: { employees: true } } },
        })

        if (!dept) return new NextResponse("Not found", { status: 404 })

        if (dept._count.employees > 0) {
            return new NextResponse(
                `Cannot delete: ${dept._count.employees} employee(s) are in this department`,
                { status: 400 }
            )
        }

        await prisma.department.delete({ where: { id: params.id } })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[DEPARTMENTS_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
