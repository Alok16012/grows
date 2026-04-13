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
            },
        })

        if (!quiz) return NextResponse.json([])

        return NextResponse.json(quiz.questions)
    } catch (error) {
        console.error("[LMS_QUESTIONS_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { question, questionType, options, points, order } = body

        if (!question) return new NextResponse("question is required", { status: 400 })
        if (!options || !Array.isArray(options) || options.length < 2) {
            return new NextResponse("At least 2 options are required", { status: 400 })
        }

        const quiz = await prisma.quiz.findUnique({ where: { courseId: params.id } })
        if (!quiz) return new NextResponse("Quiz not found", { status: 404 })

        let questionOrder = order
        if (questionOrder === undefined || questionOrder === null) {
            const maxQ = await prisma.quizQuestion.findFirst({
                where: { quizId: quiz.id },
                orderBy: { order: "desc" },
                select: { order: true },
            })
            questionOrder = (maxQ?.order ?? -1) + 1
        }

        const hasCorrectOption = options.some((o: { isCorrect: boolean }) => o.isCorrect)
        if (!hasCorrectOption) {
            return new NextResponse("At least one option must be marked as correct", { status: 400 })
        }

        const createdQuestion = await prisma.quizQuestion.create({
            data: {
                quizId: quiz.id,
                question,
                questionType: questionType || "MULTIPLE_CHOICE",
                points: points ? parseInt(points) : 1,
                order: questionOrder,
                options: {
                    create: options.map((opt: { text: string; isCorrect?: boolean; order?: number }, idx: number) => ({
                        text: opt.text,
                        isCorrect: opt.isCorrect || false,
                        order: opt.order ?? idx,
                    })),
                },
            },
            include: { options: { orderBy: { order: "asc" } } },
        })

        return NextResponse.json(createdQuestion)
    } catch (error) {
        console.error("[LMS_QUESTIONS_POST]", error)
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
        const { questions } = body

        if (!questions || !Array.isArray(questions)) {
            return new NextResponse("questions array is required", { status: 400 })
        }

        const quiz = await prisma.quiz.findUnique({ where: { courseId: params.id } })
        if (!quiz) return new NextResponse("Quiz not found", { status: 404 })

        for (const q of questions) {
            if (q.id) {
                await prisma.quizQuestion.update({
                    where: { id: q.id },
                    data: {
                        question: q.question,
                        questionType: q.questionType,
                        points: q.points ? parseInt(q.points) : 1,
                        order: q.order ?? 0,
                    },
                })

                if (q.options && Array.isArray(q.options)) {
                    for (const opt of q.options) {
                        if (opt.id) {
                            await prisma.quizOption.update({
                                where: { id: opt.id },
                                data: {
                                    text: opt.text,
                                    isCorrect: opt.isCorrect || false,
                                    order: opt.order ?? 0,
                                },
                            })
                        }
                    }
                }
            }
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[LMS_QUESTIONS_PUT]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
