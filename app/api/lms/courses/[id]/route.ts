import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const course = await prisma.course.findUnique({
            where: { id: params.id },
            include: {
                modules: { orderBy: { order: "asc" } },
                quiz: {
                    include: {
                        questions: {
                            include: { options: { orderBy: { order: "asc" } } },
                            orderBy: { order: "asc" },
                        },
                    },
                },
                _count: { select: { enrollments: true } },
            },
        })
        if (!course) return new NextResponse("Not found", { status: 404 })

        // Enrollment stats
        const enrollmentStats = await prisma.courseEnrollment.groupBy({
            by: ["status"],
            where: { courseId: params.id },
            _count: { id: true },
        })

        const statsMap: Record<string, number> = {}
        for (const s of enrollmentStats) {
            statsMap[s.status] = s._count.id
        }
        const totalEnrolled = Object.values(statsMap).reduce((a, b) => a + b, 0)
        const completed = statsMap["COMPLETED"] ?? 0
        const inProgress = statsMap["IN_PROGRESS"] ?? 0
        const passRate = totalEnrolled ? Math.round((completed / totalEnrolled) * 100) : 0

        return NextResponse.json({
            ...course,
            stats: { totalEnrolled, completed, inProgress, passRate },
        })
    } catch (error) {
        console.error("[LMS_COURSE_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { title, description, category, duration, passingScore, isMandatory, status, thumbnail } = body

        const course = await prisma.course.update({
            where: { id: params.id },
            data: {
                ...(title !== undefined && { title }),
                ...(description !== undefined && { description }),
                ...(category !== undefined && { category }),
                ...(duration !== undefined && { duration: parseInt(duration) }),
                ...(passingScore !== undefined && { passingScore: parseInt(passingScore) }),
                ...(isMandatory !== undefined && { isMandatory }),
                ...(status !== undefined && { status }),
                ...(thumbnail !== undefined && { thumbnail }),
            },
        })

        return NextResponse.json(course)
    } catch (error) {
        console.error("[LMS_COURSE_PUT]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        // Check no active enrollments
        const activeEnrollments = await prisma.courseEnrollment.count({
            where: {
                courseId: params.id,
                status: { in: ["ENROLLED", "IN_PROGRESS"] },
            },
        })
        if (activeEnrollments > 0) {
            return new NextResponse("Cannot delete course with active enrollments", { status: 400 })
        }

        await prisma.course.delete({ where: { id: params.id } })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[LMS_COURSE_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
