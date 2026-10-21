import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { getSelfAssessment, saveSelfAssessment } from "@/lib/performance-server"
import { notifyApprovers } from "@/lib/hr-notify"

async function access(reviewId: string, session: { user: { id: string; role: string; permissions?: string[] } }) {
    const review = await prisma.performanceReview.findUnique({
        where: { id: reviewId },
        select: { id: true, status: true, employeeId: true, reviewerId: true, employee: { select: { firstName: true, lastName: true, userId: true } } },
    })
    if (!review) return { review: null, isOwner: false, isManager: false }
    const isOwner = review.employee.userId === session.user.id
    const isManager = checkAccess(session, ["MANAGER"], "performance.view")
    return { review, isOwner, isManager }
}

// GET — the employee's KPI-by-KPI self-assessment (owner or managers).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    const { review, isOwner, isManager } = await access(params.id, session)
    if (!review) return new NextResponse("Not Found", { status: 404 })
    if (!isOwner && !isManager) return new NextResponse("Forbidden", { status: 403 })
    return NextResponse.json(await getSelfAssessment(params.id))
}

// PUT { entries: { [kpiId]: { actual, rating, comment } }, submit?: boolean }
// Only the employee the review belongs to, and only while it's a draft and
// they haven't submitted yet — after that the manager is evaluating against it.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    const { review, isOwner } = await access(params.id, session)
    if (!review) return new NextResponse("Not Found", { status: 404 })
    if (!isOwner) return new NextResponse("Only the employee can fill in their self-assessment", { status: 403 })
    if (review.status !== "DRAFT") return new NextResponse("Your manager has already evaluated this review", { status: 400 })
    const prev = await getSelfAssessment(params.id)
    if (prev.submittedAt) return new NextResponse("You have already submitted your self-assessment", { status: 400 })

    const body = await req.json()
    const submit = body.submit === true
    if (submit) {
        const kpiCount = await prisma.kPI.count({ where: { reviewId: params.id } })
        const merged = { ...prev.entries, ...(body.entries || {}) } as Record<string, { rating?: unknown }>
        const rated = Object.values(merged).filter(e => e && e.rating).length
        if (kpiCount === 0) return new NextResponse("No goals have been set on this review yet", { status: 400 })
        if (rated < kpiCount) return new NextResponse(`Rate yourself on every KPI before submitting (${rated} of ${kpiCount} done)`, { status: 400 })
    }
    const saved = await saveSelfAssessment(params.id, body.entries || {}, submit, session.user.id)
    if (submit) {
        await notifyApprovers(["performance.manage"], {
            title: "Self-assessment submitted",
            message: `${review.employee.firstName} ${review.employee.lastName} has submitted their self-assessment — ready for your evaluation`,
            type: "performance", link: `/performance?id=${params.id}`,
        }, session.user.id)
    }
    return NextResponse.json(saved)
}
