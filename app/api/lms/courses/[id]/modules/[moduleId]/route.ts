import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function PUT(req: Request, { params }: { params: { id: string; moduleId: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { title, content, videoUrl, duration, order, isRequired } = body

        const module = await prisma.courseModule.update({
            where: { id: params.moduleId },
            data: {
                ...(title !== undefined && { title }),
                ...(content !== undefined && { content }),
                ...(videoUrl !== undefined && { videoUrl }),
                ...(duration !== undefined && { duration: parseInt(duration) }),
                ...(order !== undefined && { order }),
                ...(isRequired !== undefined && { isRequired }),
            },
        })

        return NextResponse.json(module)
    } catch (error) {
        console.error("[LMS_MODULE_PUT]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function DELETE(req: Request, { params }: { params: { id: string; moduleId: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        await prisma.courseModule.delete({ where: { id: params.moduleId } })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[LMS_MODULE_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
