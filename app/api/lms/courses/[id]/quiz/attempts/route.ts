import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { learnerEmployee, nextCertificateNumber } from "@/lib/lms-learner"

export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const employee = await learnerEmployee(session)
        if (!employee) return new NextResponse("No employee record linked to your login", { status: 404 })

        // Options go out WITHOUT isCorrect — sending it handed the answers to
        // anyone who opened the network tab.
        const quiz = await prisma.quiz.findUnique({
            where: { courseId: params.id },
            include: {
                questions: {
                    include: { options: { orderBy: { order: "asc" }, select: { id: true, text: true, order: true } } },
                    orderBy: { order: "asc" },
                },
                attempts: {
                    where: { employeeId: employee.id },
                    orderBy: { startedAt: "desc" },
                    select: { id: true, score: true, passed: true, startedAt: true, submittedAt: true },
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

        const employee = await learnerEmployee(session)
        if (!employee) return new NextResponse("No employee record linked to your login", { status: 404 })

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
                    where: { employeeId: employee.id },
                },
            },
        })

        if (!quiz) return new NextResponse("Quiz not found", { status: 404 })
        if (!quiz.isActive) return new NextResponse("Quiz is not active", { status: 400 })

        // Only someone enrolled, who has worked through the modules, sits the test.
        const enrollment = await prisma.courseEnrollment.findUnique({
            where: { courseId_employeeId: { courseId: params.id, employeeId: employee.id } },
        })
        if (!enrollment) return new NextResponse("You are not enrolled in this course", { status: 403 })
        if (enrollment.status === "COMPLETED") return new NextResponse("You have already passed this course", { status: 400 })
        const moduleCount = await prisma.courseModule.count({ where: { courseId: params.id, isRequired: true } })
        if (moduleCount > 0 && enrollment.progress < 100) return new NextResponse("Finish all modules before taking the assessment", { status: 400 })

        if (quiz.maxAttempts && quiz.attempts.length >= quiz.maxAttempts) {
            return new NextResponse(`Maximum ${quiz.maxAttempts} attempts allowed`, { status: 400 })
        }

        let totalPoints = 0
        let earnedPoints = 0
        const results: { questionId: string; correct: boolean; correctOptionId: string | null }[] = []
        const attemptsLeft = quiz.maxAttempts ? quiz.maxAttempts - quiz.attempts.length - 1 : null

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
                employeeId: employee.id,
                score: scorePercent,
                passed,
                submittedAt: new Date(),
                answers: answers as object,
            },
        })

        if (passed) {
            await prisma.courseEnrollment.update({
                where: { id: enrollment.id },
                data: {
                    score: scorePercent,
                    status: "COMPLETED",
                    progress: 100,
                    completedAt: new Date(),
                    attempts: { increment: 1 },
                    certificate: enrollment.certificate ?? await nextCertificateNumber(),
                },
            })
        } else {
            await prisma.courseEnrollment.update({
                where: { id: enrollment.id },
                data: {
                    score: Math.max(enrollment.score || 0, scorePercent),
                    // Out of attempts = failed; HR can re-enroll.
                    status: attemptsLeft !== null && attemptsLeft <= 0 ? "FAILED" : "IN_PROGRESS",
                    attempts: { increment: 1 },
                },
            })
        }

        // Reveal the right answers only once there's nothing left to gain from
        // them — after a pass or the last attempt.
        const reveal = passed || (attemptsLeft !== null && attemptsLeft <= 0)
        const shown = results.map(r => ({ ...r, correctOptionId: reveal ? r.correctOptionId : null }))

        return NextResponse.json({
            attempt,
            score: scorePercent,
            passed,
            passingScore: quiz.passingScore,
            attemptsLeft,
            results: shown,
        })
    } catch (error) {
        console.error("[LMS_QUIZ_ATTEMPT_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
