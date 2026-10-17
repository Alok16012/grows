import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { notifyApprovers, notifyEmployee } from "@/lib/hr-notify"
import { reviewScore } from "@/lib/performance-server"

// The review moves DRAFT (goals set, self-appraisal) → SUBMITTED (manager has
// evaluated) → COMPLETED (HR approved). The employee acknowledges once it's
// been shared; acknowledging a COMPLETED review stamps acknowledgedAt but keeps
// it COMPLETED, so HR's counts don't go backwards.
async function statusRules(
    reviewId: string, status: string, canManage: boolean, isAdmin: boolean,
    updateData: Record<string, unknown>, force: boolean,
): Promise<string | null> {
    const cur = await prisma.performanceReview.findUnique({
        where: { id: reviewId },
        select: { status: true, overallRating: true, performanceRank: true, incrementPercent: true, bonusPercent: true, pipRequired: true },
    })
    if (!cur) return "Review not found"
    if (status === cur.status) return null

    if (!canManage) {
        if (status !== "ACKNOWLEDGED") return "You can only acknowledge your review"
        if (cur.status === "COMPLETED") { delete updateData.status; return null }
        if (cur.status !== "SUBMITTED") return "Your review hasn't been shared with you yet"
        return null
    }

    if (status === "SUBMITTED") {
        if (cur.status !== "DRAFT") return "Only a draft review can be submitted"
        const sc = await reviewScore(reviewId)
        if (sc.issues.length && !(force && isAdmin)) return `Can't submit yet: ${sc.issues.join("; ")}`
        // Fill what the manager left blank from the calculated score and band.
        if (updateData.overallRating === undefined && cur.overallRating == null && sc.overall != null) updateData.overallRating = sc.overall
        if (sc.band) {
            if (updateData.performanceRank === undefined && !cur.performanceRank) updateData.performanceRank = sc.band.rank
            if (updateData.incrementPercent === undefined && cur.incrementPercent == null) updateData.incrementPercent = sc.band.increment
            if (updateData.bonusPercent === undefined && cur.bonusPercent == null) updateData.bonusPercent = sc.band.bonus
            if (updateData.pipRequired === undefined && !cur.pipRequired && sc.band.pip) updateData.pipRequired = true
        }
    }
    if (status === "COMPLETED") {
        if (cur.status !== "SUBMITTED" && cur.status !== "ACKNOWLEDGED" && !(force && isAdmin)) return "Only a submitted review can be approved"
        if (cur.overallRating == null && updateData.overallRating == null) return "Set the overall rating before approving"
    }
    if (status === "DRAFT" && cur.status === "COMPLETED" && !isAdmin) return "A completed review can only be reopened by an admin"
    return null
}

// Tell the people on the other side of each step that it's their turn.
async function notifyReviewStep(review: { id: string; employeeId: string; status: string }, actorIsManager: boolean) {
    const link = "/performance"
    if (review.status === "SUBMITTED" && actorIsManager) {
        await notifyEmployee(review.employeeId, { title: "Performance review shared", message: "Your manager has shared your performance review. Add your self-assessment and acknowledge it.", type: "performance", link })
    } else if (review.status === "COMPLETED") {
        await notifyEmployee(review.employeeId, { title: "Performance review completed", message: "Your performance review has been approved by HR.", type: "performance", link })
    } else if (review.status === "ACKNOWLEDGED" && !actorIsManager) {
        await notifyApprovers(["performance.manage"], { title: "Review acknowledged", message: "An employee has acknowledged their performance review.", type: "performance", link })
    }
}

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

        // Same scoping as the list route: without performance.view a user only
        // sees their own review.
        if (!checkAccess(session, ["MANAGER"], "performance.view")) {
            const emp = await prisma.employee.findFirst({
                where: { userId: session.user.id },
                select: { id: true },
            })
            if (!emp || review.employeeId !== emp.id) {
                return new NextResponse("Forbidden", { status: 403 })
            }
        }

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

        // Ratings, increments and status are manager/HR territory. The employee
        // the review belongs to may only fill in their self-appraisal and
        // acknowledge the finished review.
        const canManage = checkAccess(session, ["MANAGER", "HR_MANAGER"], "performance.manage")
        if (!canManage) {
            const target = await prisma.performanceReview.findUnique({
                where: { id: params.id },
                select: { employeeId: true },
            })
            if (!target) return new NextResponse("Not Found", { status: 404 })
            const emp = await prisma.employee.findFirst({
                where: { userId: session.user.id },
                select: { id: true },
            })
            if (!emp || emp.id !== target.employeeId) {
                return new NextResponse("Forbidden", { status: 403 })
            }
        }

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
            bonusPercent,
            performanceRank,
            pipRequired,
        } = body

        const updateData: Record<string, unknown> = {}
        if (canManage) {
            if (overallRating !== undefined) updateData.overallRating = overallRating
            if (strengths !== undefined) updateData.strengths = strengths
            if (improvements !== undefined) updateData.improvements = improvements
            if (managerComments !== undefined) updateData.managerComments = managerComments
            if (promotionRecommended !== undefined) updateData.promotionRecommended = promotionRecommended
            if (incrementPercent !== undefined) updateData.incrementPercent = incrementPercent
            if (hrApprovedAt !== undefined) {
                updateData.hrApprovedAt = hrApprovedAt ? new Date(hrApprovedAt) : null
                // The approver is always the caller — never taken from the body.
                updateData.hrApprovedBy = hrApprovedAt ? session.user.id : null
            }
            if (bonusPercent !== undefined) updateData.bonusPercent = bonusPercent
            if (performanceRank !== undefined) updateData.performanceRank = performanceRank
            if (pipRequired !== undefined) updateData.pipRequired = pipRequired
        }
        if (employeeComments !== undefined) updateData.employeeComments = employeeComments
        if (selfRating !== undefined) updateData.selfRating = selfRating
        if (selfComments !== undefined) updateData.selfComments = selfComments
        if (!canManage && (selfRating !== undefined || selfComments !== undefined)) {
            const cur = await prisma.performanceReview.findUnique({ where: { id: params.id }, select: { status: true } })
            if (cur?.status === "COMPLETED") return new NextResponse("This review is closed", { status: 400 })
        }

        if (status !== undefined) {
            updateData.status = status
            const err = await statusRules(params.id, status, canManage, session.user.role === "ADMIN", updateData, body.force === true)
            if (err) return new NextResponse(err, { status: 400 })
            if (status === "SUBMITTED") updateData.submittedAt = new Date()
            if (status === "ACKNOWLEDGED") updateData.acknowledgedAt = new Date()
            if (status === "COMPLETED" && updateData.status === "COMPLETED") updateData.completedAt = new Date()
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

        if (status !== undefined) await notifyReviewStep(review, canManage)
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
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "performance.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

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
        if (hrApprovedAt !== undefined) {
            updateData.hrApprovedAt = hrApprovedAt ? new Date(hrApprovedAt) : null
            // The approver is always the caller — never taken from the body.
            updateData.hrApprovedBy = hrApprovedAt ? session.user.id : null
        }
        if (bonusPercent !== undefined) updateData.bonusPercent = bonusPercent
        if (performanceRank !== undefined) updateData.performanceRank = performanceRank
        if (pipRequired !== undefined) updateData.pipRequired = pipRequired

        if (status !== undefined) {
            updateData.status = status
            const err = await statusRules(params.id, status, true, session.user.role === "ADMIN", updateData, body.force === true)
            if (err) return new NextResponse(err, { status: 400 })
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

        if (status !== undefined) await notifyReviewStep(review, true)
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
