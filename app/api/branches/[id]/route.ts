import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const branch = await prisma.branch.findUnique({
            where: { id: params.id },
            include: {
                company: true,
                departments: true,
                sites: true,
                _count: { select: { employees: true } },
            },
        })

        if (!branch) return new NextResponse("Not Found", { status: 404 })
        return NextResponse.json(branch)
    } catch (error) {
        console.error("[BRANCH_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function PUT(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { name, address, city, state, isActive } = body

        const branch = await prisma.branch.update({
            where: { id: params.id },
            data: { name, address, city, state, isActive },
        })

        return NextResponse.json(branch)
    } catch (error) {
        console.error("[BRANCH_PUT]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        await prisma.branch.delete({ where: { id: params.id } })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[BRANCH_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
