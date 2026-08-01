import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "exit.view")) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const exit = await prisma.exitRequest.findUnique({
      where: { id: params.id },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeId: true,
            designation: true,
            photo: true,
            basicSalary: true,
            department: { select: { name: true } },
            branch: { select: { name: true } },
          },
        },
        clearanceTasks: {
          orderBy: { order: "asc" },
        },
      },
    })

    if (!exit) return new NextResponse("Not Found", { status: 404 })

    return NextResponse.json(exit)
  } catch (error) {
    console.error("[EXIT_GET_ID]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "exit.manage")) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const body = await req.json()
    const { status, lastWorkingDate, hrComments, fnfAmount, fnfPaidAt, fnfPaidBy, approvedBy } = body

    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    if (status !== undefined) {
      updateData.status = status
      if (status === "NOTICE_PERIOD") {
        // No special date needed
      }
      if (status === "COMPLETED") {
        updateData.completedAt = new Date()
      }
      if (status === "FULL_FINAL_PENDING" && approvedBy) {
        updateData.approvedBy = approvedBy
        updateData.approvedAt = new Date()
      }
    }
    if (lastWorkingDate !== undefined) updateData.lastWorkingDate = new Date(lastWorkingDate)
    if (hrComments !== undefined) updateData.hrComments = hrComments
    if (fnfAmount !== undefined) updateData.fnfAmount = parseFloat(String(fnfAmount))
    if (fnfPaidAt !== undefined) updateData.fnfPaidAt = new Date(fnfPaidAt)
    if (fnfPaidBy !== undefined) updateData.fnfPaidBy = fnfPaidBy
    if (approvedBy !== undefined) updateData.approvedBy = approvedBy

    const exit = await prisma.exitRequest.update({
      where: { id: params.id },
      data: updateData,
      include: {
        clearanceTasks: { orderBy: { order: "asc" } },
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeId: true,
            designation: true,
          },
        },
      },
    })

    // Completing an exit actually offboards the person. Until now this route
    // only moved the ExitRequest row, so a fully-processed leaver stayed ACTIVE,
    // kept their site deployment, kept counting in headcount and payroll, and
    // could still sign in — offboarding had to be repeated by hand on the
    // employee screen.
    if (status === "COMPLETED") {
      const leftAs = exit.exitType === "TERMINATION" || exit.exitType === "ABSCONDING"
        ? "TERMINATED"
        : "RESIGNED"
      const leavingDate = exit.lastWorkingDate ?? new Date()

      await prisma.$transaction(async (tx) => {
        await tx.employee.update({
          where: { id: exit.employeeId },
          data: { status: leftAs, dateOfLeaving: leavingDate },
        })

        // Free the site slot so the leaver stops appearing under it.
        await tx.deployment.updateMany({
          where: { employeeId: exit.employeeId, isActive: true },
          data: { isActive: false, endDate: leavingDate, relievedAt: leavingDate },
        })

        // Revoke the login. lib/auth.ts also invalidates any live session on its
        // next refresh once the employee is in a terminal status.
        const emp = await tx.employee.findUnique({
          where: { id: exit.employeeId },
          select: { userId: true },
        })
        if (emp?.userId) {
          await tx.user.update({ where: { id: emp.userId }, data: { isActive: false } })
        }
      })
    }

    return NextResponse.json(exit)
  } catch (error) {
    console.error("[EXIT_PUT]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    if (session.user.role !== "ADMIN") {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const exit = await prisma.exitRequest.findUnique({ where: { id: params.id } })
    if (!exit) return new NextResponse("Not Found", { status: 404 })
    if (exit.status !== "INITIATED") {
      return new NextResponse("Only INITIATED exits can be deleted", { status: 400 })
    }

    await prisma.exitRequest.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[EXIT_DELETE]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}
