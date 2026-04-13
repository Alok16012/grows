import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function PUT(
    req: Request,
    { params }: { params: { id: string; kpiId: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const body = await req.json()
        const { actual, rating, remarks, title, target, weightage } = body

        const updateData: Record<string, unknown> = {}
        if (actual !== undefined) updateData.actual = actual
        if (rating !== undefined) updateData.rating = rating
        if (remarks !== undefined) updateData.remarks = remarks
        if (title !== undefined) updateData.title = title
        if (target !== undefined) updateData.target = target
        if (weightage !== undefined) updateData.weightage = weightage

        const kpi = await prisma.kPI.update({
            where: { id: params.kpiId },
            data: updateData,
        })

        return NextResponse.json(kpi)
    } catch (error) {
        console.error("[KPI_PUT]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string; kpiId: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        await prisma.kPI.delete({ where: { id: params.kpiId } })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[KPI_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
