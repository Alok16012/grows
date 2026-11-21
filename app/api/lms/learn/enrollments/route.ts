import { getServerSession } from "next-auth"
import { getLmsSettings } from "@/lib/lms-settings"
import { questionsForAttempt, currentAttemptNo, attemptSeed } from "@/lib/lms-quiz"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { learnerEmployee } from "@/lib/lms-learner"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const employee = await learnerEmployee(session)
        if (!employee) return NextResponse.json([])

        const enrollments = await prisma.courseEnrollment.findMany({
            // Only published courses reach the learner.
            where: { employeeId: employee.id, course: { status: "PUBLISHED" } },
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
                                docUrl: true,
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

        // Question bank (LMS → Settings): each attempt shows its own random set.
        const qs = (await getLmsSettings()).quiz
        const attemptNo = new Map<string, number>()
        for (const e of enrollments) if (e.course.quiz) attemptNo.set(e.id, await currentAttemptNo(e.course.quiz.id, employee.id, e.enrolledAt))
        for (const e of enrollments) {
            if (!e.course.quiz) continue
            e.course.quiz.questions = questionsForAttempt(e.course.quiz.questions, { perAttempt: qs.questionsPerAttempt, shuffleOptions: qs.shuffleOptions, seed: attemptSeed(e.id, attemptNo.get(e.id) ?? 1) })
        }

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
                modules: e.course.modules.map(m => ({ ...m, content: m.content || undefined, videoUrl: m.videoUrl || undefined, docUrl: m.docUrl || undefined })),
            },
            employeeName: employee ? `${employee.firstName} ${employee.lastName}` : "Employee",
        }))

        return NextResponse.json(result)
    } catch (error) {
        console.error("[LMS_LEARN_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
