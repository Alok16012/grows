import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function PUT(req: Request, { params }: { params: { id: string; questionId: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { question, questionType, options, points, order } = body

        if (!question) return new NextResponse("question is required", { status: 400 })

        if (options && Array.isArray(options)) {
            const hasCorrectOption = options.some((o: { isCorrect?: boolean }) => o.isCorrect)
            if (!hasCorrectOption) {
                return new NextResponse("At least one option must be marked as correct", { status: 400 })
            }

            await prisma.quizOption.deleteMany({ where: { questionId: params.questionId } })

            await prisma.quizOption.createMany({
                data: options.map((opt: { text: string; isCorrect?: boolean; order?: number }, idx: number) => ({
                    questionId: params.questionId,
                    text: opt.text,
                    isCorrect: opt.isCorrect || false,
                    order: opt.order ?? idx,
                })),
            })
        }

        const updated = await prisma.quizQuestion.update({
            where: { id: params.questionId },
            data: {
                question,
                questionType: questionType || "MULTIPLE_CHOICE",
                points: points ? parseInt(points) : 1,
                order: order ?? 0,
            },
            include: { options: { orderBy: { order: "asc" } } },
        })

        return NextResponse.json(updated)
    } catch (error) {
        console.error("[LMS_QUESTION_PUT]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function DELETE(req: Request, { params }: { params: { id: string; questionId: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        await prisma.quizQuestion.delete({ where: { id: params.questionId } })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[LMS_QUESTION_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
