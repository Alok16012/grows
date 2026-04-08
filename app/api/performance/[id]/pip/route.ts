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

        const pip = await prisma.pIP.findUnique({
            where: { reviewId: params.id },
        })

        if (!pip) return NextResponse.json(null)

        return NextResponse.json(pip)
    } catch (error) {
        console.error("[PIP_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const review = await prisma.performanceReview.findUnique({
            where: { id: params.id },
            select: { id: true, employeeId: true },
        })
        if (!review) return new NextResponse("Review not found", { status: 404 })

        const body = await req.json()
        const { startDate, endDate, goals, managerNotes } = body

        if (!startDate || !endDate || !goals) {
            return new NextResponse("startDate, endDate, goals are required", { status: 400 })
        }

        const pip = await prisma.pIP.create({
            data: {
                reviewId: params.id,
                employeeId: review.employeeId,
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                goals: typeof goals === "string" ? goals : JSON.stringify(goals),
                managerNotes: managerNotes || null,
                status: "ACTIVE",
            },
        })

        // Also mark pipRequired on the review
        await prisma.performanceReview.update({
            where: { id: params.id },
            data: { pipRequired: true },
        })

        return NextResponse.json(pip)
    } catch (error) {
        console.error("[PIP_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const body = await req.json()
        const { status, managerNotes, goals, startDate, endDate } = body

        const updateData: Record<string, unknown> = {}
        if (status !== undefined) updateData.status = status
        if (managerNotes !== undefined) updateData.managerNotes = managerNotes
        if (goals !== undefined) updateData.goals = typeof goals === "string" ? goals : JSON.stringify(goals)
        if (startDate !== undefined) updateData.startDate = new Date(startDate)
        if (endDate !== undefined) updateData.endDate = new Date(endDate)

        const pip = await prisma.pIP.update({
            where: { reviewId: params.id },
            data: updateData,
        })

        return NextResponse.json(pip)
    } catch (error) {
        console.error("[PIP_PATCH]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
