import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

// GET /api/lms/feedback?courseId=xxx  — get current employee's feedback for a course
export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const { searchParams } = new URL(req.url)
        const courseId = searchParams.get("courseId")

        if (!session.user.email) return new NextResponse("User email required", { status: 400 })
        const employee = await prisma.employee.findFirst({
            where: { email: session.user.email },
            select: { id: true },
        })
        if (!employee) return new NextResponse("Employee not found", { status: 404 })

        if (courseId) {
            const feedback = await prisma.courseFeedback.findUnique({
                where: { courseId_employeeId: { courseId, employeeId: employee.id } },
            })
            return NextResponse.json(feedback ?? null)
        }

        // Return all feedback for admin view
        if (session.user.role === "ADMIN" || session.user.role === "MANAGER") {
            const allFeedback = await prisma.courseFeedback.findMany({
                include: {
                    course: { select: { title: true, courseCode: true } },
                    employee: { select: { firstName: true, lastName: true, employeeId: true } },
                },
                orderBy: { submittedAt: "desc" },
                take: 100,
            })
            return NextResponse.json(allFeedback)
        }

        return NextResponse.json([])
    } catch (error) {
        console.error("[LMS_FEEDBACK_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

// POST /api/lms/feedback  — submit or update feedback
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const body = await req.json()
        const { courseId, enrollmentId, rating, comment } = body

        if (!courseId || !rating || rating < 1 || rating > 5) {
            return new NextResponse("courseId and rating (1-5) are required", { status: 400 })
        }

        if (!session.user.email) return new NextResponse("User email required", { status: 400 })
        const employee = await prisma.employee.findFirst({
            where: { email: session.user.email },
            select: { id: true },
        })
        if (!employee) return new NextResponse("Employee not found", { status: 404 })

        // Verify enrollment exists and is completed
        const enrollment = await prisma.courseEnrollment.findUnique({
            where: { courseId_employeeId: { courseId, employeeId: employee.id } },
        })
        if (!enrollment) return new NextResponse("Not enrolled in this course", { status: 403 })

        const feedback = await prisma.courseFeedback.upsert({
            where: { courseId_employeeId: { courseId, employeeId: employee.id } },
            create: {
                courseId,
                employeeId: employee.id,
                enrollmentId: enrollmentId ?? enrollment.id,
                rating,
                comment: comment ?? null,
            },
            update: {
                rating,
                comment: comment ?? null,
                submittedAt: new Date(),
            },
        })

        return NextResponse.json(feedback)
    } catch (error) {
        console.error("[LMS_FEEDBACK_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
