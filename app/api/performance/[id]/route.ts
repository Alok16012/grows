import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const review = await prisma.performanceReview.findUnique({
            where: { id: params.id },
            include: {
                employee: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        employeeId: true,
                        designation: true,
                        photo: true,
                        branch: { select: { name: true } },
                    },
                },
                kpis: { orderBy: { weightage: "desc" } },
                kras: {
                    include: {
                        kpis: { orderBy: { weightage: "desc" } },
                    },
                    orderBy: { weightage: "desc" },
                },
                pip: true,
            },
        })

        if (!review) return new NextResponse("Not Found", { status: 404 })

        return NextResponse.json(review)
    } catch (error) {
        console.error("[PERFORMANCE_GET_ID]", error)
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
        const {
            status,
            overallRating,
            strengths,
            improvements,
            managerComments,
            employeeComments,
            promotionRecommended,
            incrementPercent,
            selfRating,
            selfComments,
            hrApprovedAt,
            hrApprovedBy,
            bonusPercent,
            performanceRank,
            pipRequired,
        } = body

        const updateData: Record<string, unknown> = {}
        if (overallRating !== undefined) updateData.overallRating = overallRating
        if (strengths !== undefined) updateData.strengths = strengths
        if (improvements !== undefined) updateData.improvements = improvements
        if (managerComments !== undefined) updateData.managerComments = managerComments
        if (employeeComments !== undefined) updateData.employeeComments = employeeComments
        if (promotionRecommended !== undefined) updateData.promotionRecommended = promotionRecommended
        if (incrementPercent !== undefined) updateData.incrementPercent = incrementPercent
        if (selfRating !== undefined) updateData.selfRating = selfRating
        if (selfComments !== undefined) updateData.selfComments = selfComments
        if (hrApprovedAt !== undefined) updateData.hrApprovedAt = hrApprovedAt ? new Date(hrApprovedAt) : null
        if (hrApprovedBy !== undefined) updateData.hrApprovedBy = hrApprovedBy
        if (bonusPercent !== undefined) updateData.bonusPercent = bonusPercent
        if (performanceRank !== undefined) updateData.performanceRank = performanceRank
        if (pipRequired !== undefined) updateData.pipRequired = pipRequired

        if (status !== undefined) {
            updateData.status = status
            if (status === "SUBMITTED") updateData.submittedAt = new Date()
            if (status === "ACKNOWLEDGED") updateData.acknowledgedAt = new Date()
            if (status === "COMPLETED") updateData.completedAt = new Date()
        }

        const review = await prisma.performanceReview.update({
            where: { id: params.id },
            data: updateData,
            include: {
                kpis: { orderBy: { weightage: "desc" } },
                kras: {
                    include: {
                        kpis: { orderBy: { weightage: "desc" } },
                    },
                },
                pip: true,
                employee: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        employeeId: true,
                        designation: true,
                        photo: true,
                        branch: { select: { name: true } },
                    },
                },
            },
        })

        return NextResponse.json(review)
    } catch (error) {
        console.error("[PERFORMANCE_PATCH]", error)
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

        const body = await req.json()
        const {
            status,
            overallRating,
            strengths,
            improvements,
            managerComments,
            employeeComments,
            promotionRecommended,
            incrementPercent,
            selfRating,
            selfComments,
            hrApprovedAt,
            hrApprovedBy,
            bonusPercent,
            performanceRank,
            pipRequired,
        } = body

        const updateData: Record<string, unknown> = {}
        if (overallRating !== undefined) updateData.overallRating = overallRating
        if (strengths !== undefined) updateData.strengths = strengths
        if (improvements !== undefined) updateData.improvements = improvements
        if (managerComments !== undefined) updateData.managerComments = managerComments
        if (employeeComments !== undefined) updateData.employeeComments = employeeComments
        if (promotionRecommended !== undefined) updateData.promotionRecommended = promotionRecommended
        if (incrementPercent !== undefined) updateData.incrementPercent = incrementPercent
        if (selfRating !== undefined) updateData.selfRating = selfRating
        if (selfComments !== undefined) updateData.selfComments = selfComments
        if (hrApprovedAt !== undefined) updateData.hrApprovedAt = hrApprovedAt ? new Date(hrApprovedAt) : null
        if (hrApprovedBy !== undefined) updateData.hrApprovedBy = hrApprovedBy
        if (bonusPercent !== undefined) updateData.bonusPercent = bonusPercent
        if (performanceRank !== undefined) updateData.performanceRank = performanceRank
        if (pipRequired !== undefined) updateData.pipRequired = pipRequired

        if (status !== undefined) {
            updateData.status = status
            if (status === "SUBMITTED") updateData.submittedAt = new Date()
            if (status === "ACKNOWLEDGED") updateData.acknowledgedAt = new Date()
            if (status === "COMPLETED") updateData.completedAt = new Date()
        }

        const review = await prisma.performanceReview.update({
            where: { id: params.id },
            data: updateData,
            include: {
                kpis: { orderBy: { weightage: "desc" } },
                kras: {
                    include: {
                        kpis: { orderBy: { weightage: "desc" } },
                    },
                },
                pip: true,
                employee: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        employeeId: true,
                        designation: true,
                        photo: true,
                        branch: { select: { name: true } },
                    },
                },
            },
        })

        return NextResponse.json(review)
    } catch (error) {
        console.error("[PERFORMANCE_PUT]", error)
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
        if (!checkAccess(session, [], "performance.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const review = await prisma.performanceReview.findUnique({
            where: { id: params.id },
            select: { status: true },
        })

        if (!review) return new NextResponse("Not Found", { status: 404 })
        if (review.status !== "DRAFT") {
            return new NextResponse("Only DRAFT reviews can be deleted", { status: 400 })
        }

        await prisma.performanceReview.delete({ where: { id: params.id } })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[PERFORMANCE_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
