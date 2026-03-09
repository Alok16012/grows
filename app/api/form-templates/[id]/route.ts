
import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function PUT(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { fieldLabel, fieldType, options, defaultValue, isRequired, displayOrder } = body

        const field = await prisma.formTemplate.update({
            where: { id: params.id },
            data: {
                ...(fieldLabel !== undefined && { fieldLabel }),
                ...(fieldType !== undefined && { fieldType }),
                ...(options !== undefined && { options }),
                ...(defaultValue !== undefined && { defaultValue }),
                ...(isRequired !== undefined && { isRequired }),
                ...(displayOrder !== undefined && { displayOrder }),
            },
        })

        return NextResponse.json(field)
    } catch (error) {
        console.error("[FORM_TEMPLATE_PUT]", error)
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

        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        await prisma.formTemplate.delete({
            where: { id: params.id },
        })

        return new NextResponse(null, { status: 204 })
    } catch (error) {
        console.error("[FORM_TEMPLATE_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
