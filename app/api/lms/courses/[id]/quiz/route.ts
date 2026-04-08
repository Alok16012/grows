import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const quiz = await prisma.quiz.findUnique({
            where: { courseId: params.id },
            include: {
                questions: {
                    include: { options: { orderBy: { order: "asc" } } },
                    orderBy: { order: "asc" },
                },
            },
        })

        return NextResponse.json(quiz)
    } catch (error) {
        console.error("[LMS_QUIZ_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { title, description, passingScore, timeLimit, maxAttempts } = body

        const course = await prisma.course.findUnique({ where: { id: params.id } })
        if (!course) return new NextResponse("Course not found", { status: 404 })

        const existingQuiz = await prisma.quiz.findUnique({ where: { courseId: params.id } })
        if (existingQuiz) {
            return new NextResponse("Quiz already exists for this course", { status: 400 })
        }

        const quiz = await prisma.quiz.create({
            data: {
                courseId: params.id,
                title: title || "Course Assessment",
                description: description || null,
                passingScore: passingScore ? parseInt(passingScore) : 70,
                timeLimit: timeLimit ? parseInt(timeLimit) : null,
                maxAttempts: maxAttempts ? parseInt(maxAttempts) : 3,
            },
        })

        return NextResponse.json(quiz)
    } catch (error) {
        console.error("[LMS_QUIZ_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { title, description, passingScore, timeLimit, maxAttempts, isActive } = body

        const quiz = await prisma.quiz.update({
            where: { courseId: params.id },
            data: {
                ...(title !== undefined && { title }),
                ...(description !== undefined && { description }),
                ...(passingScore !== undefined && { passingScore: parseInt(passingScore) }),
                ...(timeLimit !== undefined && { timeLimit: timeLimit ? parseInt(timeLimit) : null }),
                ...(maxAttempts !== undefined && { maxAttempts: parseInt(maxAttempts) }),
                ...(isActive !== undefined && { isActive }),
            },
        })

        return NextResponse.json(quiz)
    } catch (error) {
        console.error("[LMS_QUIZ_PUT]", error)
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

        await prisma.quiz.delete({ where: { courseId: params.id } })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[LMS_QUIZ_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
