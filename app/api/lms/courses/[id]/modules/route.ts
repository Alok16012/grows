import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const modules = await prisma.courseModule.findMany({
            where: { courseId: params.id },
            orderBy: { order: "asc" },
        })

        return NextResponse.json(modules)
    } catch (error) {
        console.error("[LMS_MODULES_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { title, content, videoUrl, duration, order, isRequired } = body

        if (!title) return new NextResponse("title is required", { status: 400 })

        // Get max order if not specified
        let moduleOrder = order
        if (moduleOrder === undefined || moduleOrder === null) {
            const maxModule = await prisma.courseModule.findFirst({
                where: { courseId: params.id },
                orderBy: { order: "desc" },
                select: { order: true },
            })
            moduleOrder = (maxModule?.order ?? -1) + 1
        }

        const module = await prisma.courseModule.create({
            data: {
                courseId: params.id,
                title,
                content: content || null,
                videoUrl: videoUrl || null,
                duration: duration ? parseInt(duration) : 15,
                order: moduleOrder,
                isRequired: isRequired ?? true,
            },
        })

        return NextResponse.json(module)
    } catch (error) {
        console.error("[LMS_MODULES_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
