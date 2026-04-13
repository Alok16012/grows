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
    const { status, completedBy, remarks } = body

    const taskUpdateData: Record<string, unknown> = {}
    if (status !== undefined) taskUpdateData.status = status
    if (remarks !== undefined) taskUpdateData.remarks = remarks

    if (status === "COMPLETED") {
      taskUpdateData.completedAt = new Date()
      taskUpdateData.completedBy = completedBy || session.user.name || session.user.id
    } else {
      taskUpdateData.completedAt = null
      taskUpdateData.completedBy = null
    }

    const updatedTask = await prisma.exitClearanceTask.update({
      where: { id: params.taskId },
      data: taskUpdateData,
    })

    // Check if all tasks are COMPLETED or WAIVED → auto-move to FULL_FINAL_PENDING
    const allTasks = await prisma.exitClearanceTask.findMany({
      where: { exitId: params.id },
    })

    const allDone = allTasks.every(t => t.status === "COMPLETED" || t.status === "WAIVED")

    if (allDone) {
      const currentExit = await prisma.exitRequest.findUnique({ where: { id: params.id } })
      if (currentExit && currentExit.status === "CLEARANCE_PENDING") {
        await prisma.exitRequest.update({
          where: { id: params.id },
          data: { status: "FULL_FINAL_PENDING" },
        })
      }
    }

    return NextResponse.json(updatedTask)
  } catch (error) {
    console.error("[CLEARANCE_TASK_PUT]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}
