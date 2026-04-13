import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
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
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
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
