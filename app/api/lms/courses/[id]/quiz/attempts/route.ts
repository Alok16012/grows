import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const quiz = await prisma.quiz.findUnique({
            where: { courseId: params.id },
            include: {
                questions: {
                    include: { options: { orderBy: { order: "asc" } } },
                    orderBy: { order: "asc" },
                },
                attempts: {
                    where: { employeeId: session.user.id },
                    orderBy: { startedAt: "desc" },
                },
            },
        })

        if (!quiz) return NextResponse.json(null)

        const { attempts, ...quizData } = quiz

        return NextResponse.json({ quiz: quizData, attempts })
    } catch (error) {
        console.error("[LMS_QUIZ_ATTEMPTS_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const body = await req.json()
        const { answers } = body

        if (!answers || typeof answers !== "object") {
            return new NextResponse("answers object is required", { status: 400 })
        }

        const quiz = await prisma.quiz.findUnique({
            where: { courseId: params.id },
            include: {
                questions: {
                    include: { options: true },
                },
                attempts: {
                    where: { employeeId: session.user.id },
                },
            },
        })

        if (!quiz) return new NextResponse("Quiz not found", { status: 404 })
        if (!quiz.isActive) return new NextResponse("Quiz is not active", { status: 400 })

        if (quiz.maxAttempts && quiz.attempts.length >= quiz.maxAttempts) {
            return new NextResponse(`Maximum ${quiz.maxAttempts} attempts allowed`, { status: 400 })
        }

        let totalPoints = 0
        let earnedPoints = 0
        const results: { questionId: string; correct: boolean; correctOptionId: string | null }[] = []

        for (const question of quiz.questions) {
            totalPoints += question.points || 1
            const selectedOptionId = answers[question.id]
            const correctOption = question.options.find(o => o.isCorrect)

            const isCorrect = selectedOptionId === correctOption?.id
            if (isCorrect) {
                earnedPoints += question.points || 1
            }

            results.push({
                questionId: question.id,
                correct: isCorrect,
                correctOptionId: correctOption?.id || null,
            })
        }

        const scorePercent = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0
        const passed = scorePercent >= quiz.passingScore

        const attempt = await prisma.quizAttempt.create({
            data: {
                quizId: quiz.id,
                employeeId: session.user.id,
                score: scorePercent,
                passed,
                submittedAt: new Date(),
                answers: answers as object,
            },
        })

        if (passed) {
            const enrollment = await prisma.courseEnrollment.findUnique({
                where: {
                    courseId_employeeId: {
                        courseId: params.id,
                        employeeId: session.user.id,
                    },
                },
            })

            if (enrollment) {
                await prisma.courseEnrollment.update({
                    where: { id: enrollment.id },
                    data: {
                        score: scorePercent,
                        status: "COMPLETED",
                        completedAt: new Date(),
                        attempts: { increment: 1 },
                    },
                })
            }
        } else {
            const enrollment = await prisma.courseEnrollment.findUnique({
                where: {
                    courseId_employeeId: {
                        courseId: params.id,
                        employeeId: session.user.id,
                    },
                },
            })

            if (enrollment) {
                await prisma.courseEnrollment.update({
                    where: { id: enrollment.id },
                    data: {
                        score: Math.max(enrollment.score || 0, scorePercent),
                        status: "IN_PROGRESS",
                        attempts: { increment: 1 },
                    },
                })
            }
        }

        return NextResponse.json({
            attempt,
            score: scorePercent,
            passed,
            passingScore: quiz.passingScore,
            results,
        })
    } catch (error) {
        console.error("[LMS_QUIZ_ATTEMPT_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
