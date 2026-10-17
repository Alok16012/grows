import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

export async function PUT(
  req: Request,
  { params }: { params: { id: string; taskId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "exit.manage")) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const body = await req.json()
    const { status, completedBy, remarks } = body

    const taskUpdateData: Record<string, unknown> = {}
    if (status !== undefined) taskUpdateData.status = status
    if (remarks !== undefined) taskUpdateData.remarks = remarks

    if (status === "COMPLETED") {
      taskUpdateData.completedAt = new Date()
      taskUpdateData.completedBy = completedBy || session!.user.name || session!.user.id
    } else {
      taskUpdateData.completedAt = null
      taskUpdateData.completedBy = null
    }

    // The task must belong to the exit in the URL — otherwise any task id
    // could be ticked off through any exit's route.
    const task = await prisma.exitClearanceTask.findFirst({ where: { id: params.taskId, exitId: params.id }, select: { id: true } })
    if (!task) return new NextResponse("Clearance task not found", { status: 404 })
    if (status !== undefined && !["PENDING", "IN_PROGRESS", "COMPLETED", "WAIVED"].includes(status)) {
      return new NextResponse("Invalid status", { status: 400 })
    }
    if (status === "WAIVED" && !String(remarks || "").trim()) {
      return new NextResponse("Say why this item is being waived", { status: 400 })
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
