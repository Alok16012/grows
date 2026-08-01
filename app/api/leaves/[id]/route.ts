import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { syncLeaveStatus } from "@/lib/leave-status"

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const leave = await prisma.leave.findUnique({
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
                        branch: { select: { name: true } },
                    },
                },
            },
        })

        if (!leave) return new NextResponse("Not found", { status: 404 })

        // Non-admin/manager can only view own employee's leave
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "leaves.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        return NextResponse.json(leave)
    } catch (error) {
        console.error("[LEAVE_GET]", error)
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

        const body = await req.json()
        const { status, rejectionReason } = body

        const existing = await prisma.leave.findUnique({ where: { id: params.id } })
        if (!existing) return new NextResponse("Not found", { status: 404 })

        // Approving/rejecting leaves needs the dedicated approve permission (or the
        // broader manage). A read-only `leaves.view` role must NOT be able to
        // approve — it may only cancel its own pending request below.
        const isAdminOrManager =
            checkAccess(session, [], "leaves.approve") || checkAccess(session, [], "leaves.manage")

        if (!isAdminOrManager) {
            // Owner can only cancel their own PENDING leave. The ownership check
            // was missing entirely, so any signed-in user could cancel anyone's
            // pending leave by passing its id.
            const linkedEmployee = await prisma.employee.findFirst({
                where: { userId: session.user.id },
                select: { id: true },
            })
            if (!linkedEmployee || existing.employeeId !== linkedEmployee.id) {
                return new NextResponse("Forbidden", { status: 403 })
            }
            if (status !== "CANCELLED") return new NextResponse("Forbidden", { status: 403 })
            if (existing.status !== "PENDING") return new NextResponse("Only PENDING leaves can be cancelled", { status: 400 })
        }

        if (!status || !["APPROVED", "REJECTED", "CANCELLED"].includes(status)) {
            return new NextResponse("Valid status required: APPROVED, REJECTED, or CANCELLED", { status: 400 })
        }

        if (status === "REJECTED" && !rejectionReason) {
            return new NextResponse("rejectionReason is required when rejecting", { status: 400 })
        }

        const updateData: Record<string, unknown> = { status }

        if (status === "APPROVED") {
            updateData.approvedBy = session.user.id
            updateData.approvedAt = new Date()
            updateData.rejectedAt = null
            updateData.rejectionReason = null
        } else if (status === "REJECTED") {
            updateData.rejectedAt = new Date()
            updateData.rejectionReason = rejectionReason
            updateData.approvedBy = session.user.id
        }

        const leave = await prisma.leave.update({
            where: { id: params.id },
            data: updateData,
            include: {
                employee: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        employeeId: true,
                        designation: true,
                        photo: true,
                        branch: { select: { name: true } },
                    },
                },
            },
        })

        // Recompute ACTIVE / ON_LEAVE from the approved leaves that actually
        // cover today. Approving a future-dated leave no longer marks the
        // employee ON_LEAVE straight away; the daily cron moves them on the day
        // it starts and back when it ends.
        await syncLeaveStatus(leave.employeeId)

        return NextResponse.json(leave)
    } catch (error) {
        console.error("[LEAVE_PUT]", error)
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

        const existing = await prisma.leave.findUnique({ where: { id: params.id } })
        if (!existing) return new NextResponse("Not found", { status: 404 })

        const isAdminOrManager = checkAccess(session, [], "leaves.manage")

        // Only admin/manager or the leave's own employee (PENDING only). The
        // ownership half of that rule was never enforced, so any signed-in user
        // could delete anyone's pending leave.
        if (!isAdminOrManager) {
            const linkedEmployee = await prisma.employee.findFirst({
                where: { userId: session.user.id },
                select: { id: true },
            })
            if (!linkedEmployee || existing.employeeId !== linkedEmployee.id) {
                return new NextResponse("Forbidden", { status: 403 })
            }
            if (existing.status !== "PENDING") {
                return new NextResponse("Only PENDING leaves can be deleted", { status: 400 })
            }
        }

        await prisma.leave.delete({ where: { id: params.id } })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[LEAVE_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
