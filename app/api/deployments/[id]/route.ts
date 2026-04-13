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
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { shift, role, endDate, relievedAt, notes } = body

        const updateData: Record<string, unknown> = {}
        if (shift !== undefined) updateData.shift = shift
        if (role !== undefined) updateData.role = role
        if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null
        if (notes !== undefined) updateData.notes = notes
        if (relievedAt !== undefined) {
            updateData.relievedAt = relievedAt ? new Date(relievedAt) : null
            updateData.isActive = false
            updateData.endDate = relievedAt ? new Date(relievedAt) : null
        }

        const deployment = await prisma.deployment.update({
            where: { id: params.id },
            data: updateData,
            include: {
                employee: {
                    select: {
                        id: true,
                        employeeId: true,
                        firstName: true,
                        lastName: true,
                        designation: true,
                        phone: true,
                        photo: true,
                    },
                },
                site: {
                    select: { id: true, name: true, code: true },
                },
            },
        })

        return NextResponse.json(deployment)
    } catch (error) {
        console.error("[DEPLOYMENT_PUT]", error)
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

        await prisma.deployment.delete({ where: { id: params.id } })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[DEPLOYMENT_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
