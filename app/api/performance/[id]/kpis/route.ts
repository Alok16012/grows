import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function POST(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const review = await prisma.performanceReview.findUnique({
            where: { id: params.id },
            select: { id: true },
        })
        if (!review) return new NextResponse("Review not found", { status: 404 })

        const body = await req.json()
        const { title, description, target, weightage } = body

        if (!title || !target) {
            return new NextResponse("title and target are required", { status: 400 })
        }

        const kpi = await prisma.kPI.create({
            data: {
                reviewId: params.id,
                title,
                description: description || null,
                target,
                weightage: weightage ?? 10,
            },
        })

        return NextResponse.json(kpi)
    } catch (error) {
        console.error("[KPI_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
