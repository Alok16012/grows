import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { computeSettlement } from "@/lib/exit-settlement"
import { notifyEmployee } from "@/lib/hr-notify"

// Exit moves forward one stage at a time. Jumping straight to COMPLETED used to
// be possible with clearance half-done and nothing paid, which then offboarded
// the person (status, deployment, login) with money still owed either way.
const NEXT: Record<string, string[]> = {
  INITIATED: ["NOTICE_PERIOD", "CLEARANCE_PENDING", "CANCELLED"],
  NOTICE_PERIOD: ["CLEARANCE_PENDING", "CANCELLED"],
  CLEARANCE_PENDING: ["FULL_FINAL_PENDING", "NOTICE_PERIOD", "CANCELLED"],
  FULL_FINAL_PENDING: ["COMPLETED", "CLEARANCE_PENDING", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: ["INITIATED"],
}
const STAGE_LABEL: Record<string, string> = {
  NOTICE_PERIOD: "Your notice period has started",
  CLEARANCE_PENDING: "Your exit clearance has started",
  FULL_FINAL_PENDING: "Clearance is complete — your full & final settlement is being processed",
  COMPLETED: "Your exit is complete. Your relieving documents will be shared by HR",
  CANCELLED: "Your exit request has been withdrawn",
}

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
    const { status, lastWorkingDate, hrComments, fnfAmount, fnfPaidAt, fnfPaidBy, approvedBy, force } = body

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

    // Read the previous status first: offboarding must run only on the
    // transition into COMPLETED, so a later PUT that happens to carry the same
    // status can't re-terminate someone HR has since reinstated.
    const before = await prisma.exitRequest.findUnique({
      where: { id: params.id },
      select: { status: true, employeeId: true, fnfPaidAt: true, clearanceTasks: { select: { status: true, title: true } } },
    })
    if (!before) return new NextResponse("Exit request not found", { status: 404 })
    const isCompleting = status === "COMPLETED" && before.status !== "COMPLETED"

    // Stage rules. ADMIN can push past them with force:true (data repair).
    const overriding = force === true && session?.user.role === "ADMIN"
    if (status !== undefined && status !== before.status && !overriding) {
      if (!(NEXT[before.status] ?? []).includes(status)) {
        return new NextResponse(`Can't move an exit from ${before.status.replace(/_/g, " ").toLowerCase()} to ${String(status).replace(/_/g, " ").toLowerCase()}`, { status: 400 })
      }
      if (status === "FULL_FINAL_PENDING") {
        const open = before.clearanceTasks.filter(t => t.status !== "COMPLETED" && t.status !== "WAIVED")
        if (open.length) return new NextResponse(`${open.length} clearance item(s) still open: ${open.slice(0, 3).map(t => t.title).join(", ")}${open.length > 3 ? "…" : ""}`, { status: 400 })
      }
      if (status === "COMPLETED" && !before.fnfPaidAt && !fnfPaidAt) {
        return new NextResponse("Record the F&F payment (amount and date) before completing the exit", { status: 400 })
      }
    }

    // The ExitRequest update and the offboarding happen together. Splitting them
    // meant a failure after the first write left the exit marked COMPLETED while
    // the employee was still active with a working login — and the UI hides the
    // action once an exit is complete, so it could not be retried.
    const exit = await prisma.$transaction(async (tx) => {
      const updated = await tx.exitRequest.update({
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

      // Completing an exit actually offboards the person. This route used to
      // move only the ExitRequest row, so a fully-processed leaver stayed
      // ACTIVE, kept their site deployment, kept counting in headcount and
      // payroll, and could still sign in.
      if (isCompleting) {
        // Only a dismissal is a termination. Retirement and contract end are
        // neither that nor a resignation, but RESIGNED is the closest status
        // this enum offers for a voluntary or scheduled departure.
        const leftAs = updated.exitType === "TERMINATION" || updated.exitType === "ABSCONDING"
          ? "TERMINATED"
          : "RESIGNED"
        const leavingDate = updated.lastWorkingDate ?? new Date()

        const emp = await tx.employee.update({
          where: { id: updated.employeeId },
          data: { status: leftAs, dateOfLeaving: leavingDate },
          select: { userId: true },
        })

        // Free the site slot so the leaver stops appearing under it.
        await tx.deployment.updateMany({
          where: { employeeId: updated.employeeId, isActive: true },
          data: { isActive: false, endDate: leavingDate, relievedAt: leavingDate },
        })

        // Revoke the login. lib/auth.ts also invalidates any live session on its
        // next refresh once the employee is in a terminal status.
        if (emp.userId) {
          await tx.user.update({ where: { id: emp.userId }, data: { isActive: false } })
        }
      }

      return updated
    })

    // Moving into clearance: add a return task for every asset still held, so
    // nothing issued walks out of the door unnoticed.
    if (status === "CLEARANCE_PENDING" && before.status !== "CLEARANCE_PENDING") {
      const held = await prisma.employeeAsset.findMany({
        where: { employeeId: before.employeeId, isActive: true, returnedAt: null },
        include: { asset: { select: { name: true, assetCode: true } } },
      })
      const have = new Set(exit.clearanceTasks.map(t => t.title))
      const add = held.map(h => `Return asset: ${h.asset.name} (${h.asset.assetCode})`).filter(t => !have.has(t))
      if (add.length) {
        const maxOrder = exit.clearanceTasks.reduce((m, t) => Math.max(m, t.order), 0)
        await prisma.exitClearanceTask.createMany({
          data: add.map((title, i) => ({ exitId: exit.id, title, department: "Assets", order: maxOrder + i + 1, status: "PENDING" })),
        })
      }
    }

    // Recording payment without an amount: take the worked-out net.
    if (fnfPaidAt && fnfAmount === undefined && exit.fnfAmount == null) {
      const s = await computeSettlement(exit.id)
      if (s) await prisma.exitRequest.update({ where: { id: exit.id }, data: { fnfAmount: s.net } })
    }

    if (status !== undefined && status !== before.status && STAGE_LABEL[status]) {
      await notifyEmployee(before.employeeId, { title: "Exit update", message: STAGE_LABEL[status], type: "exit", link: "/profile" })
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
