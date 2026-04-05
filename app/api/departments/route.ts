import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const { searchParams } = new URL(req.url)
        const branchId = searchParams.get("branchId")

        const departments = await prisma.department.findMany({
            where: branchId ? { branchId } : undefined,
            include: {
                branch: { select: { id: true, name: true } },
                _count: { select: { employees: true } },
            },
            orderBy: { name: "asc" },
        })

        return NextResponse.json(departments)
    } catch (error) {
        console.error("[DEPARTMENTS_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { name, branchId, description, headId } = body

        if (!name || !branchId) {
            return new NextResponse("Name and branchId are required", { status: 400 })
        }

        const department = await prisma.department.create({
            data: {
                name,
                branchId,
                description: description || null,
                headId: headId || null,
            },
            include: {
                branch: { select: { id: true, name: true } },
                _count: { select: { employees: true } },
            },
        })

        return NextResponse.json(department)
    } catch (error) {
        console.error("[DEPARTMENTS_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
