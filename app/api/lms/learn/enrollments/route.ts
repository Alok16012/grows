import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const employee = await prisma.employee.findFirst({
            where: { userId: session.user.id },
            select: { id: true, firstName: true, lastName: true },
        })
        if (!employee) return NextResponse.json([])

        const enrollments = await prisma.courseEnrollment.findMany({
            where: { employeeId: employee.id },
            include: {
                course: {
                    include: {
                        modules: {
                            orderBy: { order: "asc" },
                            select: {
                                id: true,
                                title: true,
                                content: true,
                                videoUrl: true,
                                duration: true,
                                order: true,
                            },
                        },
                        quiz: {
                            include: {
                                questions: {
                                    include: {
                                        options: {
                                            select: { id: true, text: true },
                                            orderBy: { order: "asc" },
                                        },
                                    },
                                    orderBy: { order: "asc" },
                                },
                            },
                        },
                    },
                },
            },
            orderBy: { enrolledAt: "desc" },
        })

        const result = enrollments.map(e => ({
            id: e.id,
            courseId: e.courseId,
            progress: e.progress,
            status: e.status,
            score: e.score,
            completedAt: e.completedAt?.toISOString(),
            certificate: e.certificate,
            dueDate: e.dueDate?.toISOString(),
            attempts: e.attempts,
            course: {
                ...e.course,
                modules: e.course.modules.map(m => ({ ...m, content: m.content || undefined, videoUrl: m.videoUrl || undefined })),
            },
            employeeName: employee ? `${employee.firstName} ${employee.lastName}` : "Employee",
        }))

        return NextResponse.json(result)
    } catch (error) {
        console.error("[LMS_LEARN_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
