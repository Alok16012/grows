import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    try {
        const types = await prisma.hrDocumentType.findMany({
            where: { isActive: true },
            include: { _count: { select: { documents: true } } },
            orderBy: { name: "asc" }
        })
        return NextResponse.json(types)
    } catch (e) {
        console.error("[HR_DOC_TYPES_GET]", e)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== "ADMIN" && session.user.role !== "HR_MANAGER")) {
        return new NextResponse("Forbidden", { status: 403 })
    }
    try {
        const { name, description, templateContent, autoGenerate, requiresApproval } = await req.json()
        if (!name?.trim()) return new NextResponse("Name required", { status: 400 })
        const type = await prisma.hrDocumentType.create({
            data: { name: name.trim(), description, templateContent, autoGenerate: autoGenerate ?? false, requiresApproval: requiresApproval ?? true }
        })
        return NextResponse.json(type)
    } catch (e) {
        console.error("[HR_DOC_TYPES_POST]", e)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
