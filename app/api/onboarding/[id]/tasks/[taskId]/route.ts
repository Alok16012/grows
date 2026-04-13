import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function PUT(
    req: Request,
    { params }: { params: { id: string; taskId: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { status, completedBy } = body

        const task = await prisma.onboardingTask.update({
            where: { id: params.taskId },
            data: {
                ...(status && { status }),
                ...(status === "COMPLETED" && { completedAt: new Date(), completedBy: completedBy || session.user.name || null }),
                ...(status !== "COMPLETED" && { completedAt: null, completedBy: null }),
            },
        })

        // Auto-update onboarding status if all required tasks are COMPLETED or SKIPPED
        const allTasks = await prisma.onboardingTask.findMany({
            where: { onboardingId: params.id },
            select: { status: true, isRequired: true },
        })

        const requiredTasks = allTasks.filter(t => t.isRequired)
        const allRequiredDone = requiredTasks.length > 0 && requiredTasks.every(
            t => t.status === "COMPLETED" || t.status === "SKIPPED"
        )

        if (allRequiredDone) {
            await prisma.onboardingRecord.update({
                where: { id: params.id },
                data: { status: "COMPLETED", completedAt: new Date() },
            })
        } else {
            // Ensure it's IN_PROGRESS if not completed
            const record = await prisma.onboardingRecord.findUnique({ where: { id: params.id } })
            if (record && record.status === "NOT_STARTED") {
                await prisma.onboardingRecord.update({
                    where: { id: params.id },
                    data: { status: "IN_PROGRESS", startedAt: new Date() },
                })
            }
        }

        return NextResponse.json(task)
    } catch (error) {
        console.error("[ONBOARDING_TASK_PUT]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string; taskId: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const task = await prisma.onboardingTask.findUnique({ where: { id: params.taskId } })
        if (!task) return new NextResponse("Task not found", { status: 404 })
        if (task.isRequired) return new NextResponse("Cannot delete a required task", { status: 400 })

        await prisma.onboardingTask.delete({ where: { id: params.taskId } })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[ONBOARDING_TASK_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
