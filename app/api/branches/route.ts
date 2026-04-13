import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const companyId = searchParams.get("companyId")

        const branches = await prisma.branch.findMany({
            where: companyId ? { companyId } : undefined,
            include: {
                company: { select: { id: true, name: true } },
                _count: { select: { employees: true, departments: true, sites: true } },
            },
            orderBy: { createdAt: "desc" },
        })

        return NextResponse.json(branches)
    } catch (error) {
        console.error("[BRANCHES_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { name, address, city, state, companyId } = body

        if (!name || !companyId) {
            return new NextResponse("Name and companyId are required", { status: 400 })
        }

        const branch = await prisma.branch.create({
            data: { name, address, city, state, companyId },
        })

        return NextResponse.json(branch)
    } catch (error) {
        console.error("[BRANCHES_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
