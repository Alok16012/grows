import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function POST(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const record = await prisma.onboardingRecord.findUnique({ where: { id: params.id } })
        if (!record) return new NextResponse("Onboarding record not found", { status: 404 })

        const body = await req.json()
        const { title, category, dueDate, description } = body

        if (!title || !category) {
            return new NextResponse("title and category are required", { status: 400 })
        }

        // Get max order
        const maxOrder = await prisma.onboardingTask.aggregate({
            where: { onboardingId: params.id },
            _max: { order: true },
        })

        const task = await prisma.onboardingTask.create({
            data: {
                onboardingId: params.id,
                employeeId: record.employeeId,
                title,
                category,
                description: description || null,
                dueDate: dueDate ? new Date(dueDate) : null,
                status: "PENDING",
                isRequired: false,
                order: (maxOrder._max.order || 0) + 1,
            },
        })

        return NextResponse.json(task)
    } catch (error) {
        console.error("[ONBOARDING_TASKS_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
