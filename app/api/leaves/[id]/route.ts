import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { syncLeaveStatus } from "@/lib/leave-status"
import { checkLeaveRequest } from "@/lib/leave-policy-server"
import { notifyApprovers, notifyEmployee } from "@/lib/hr-notify"

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

        // Without leaves.view, only the leave's own employee may open it.
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "leaves.view")) {
            const me = await prisma.employee.findFirst({ where: { userId: session.user.id }, select: { id: true } })
            if (!me || me.id !== leave.employeeId) return new NextResponse("Forbidden", { status: 403 })
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
        const { status, rejectionReason, override } = body

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
            // A pending request can always be withdrawn; an approved one only
            // while it hasn't started — once it's under way, HR has to change it.
            const startsLater = existing.startDate.getTime() > Date.now()
            if (!(existing.status === "PENDING" || (existing.status === "APPROVED" && startsLater))) {
                return new NextResponse("Only pending leaves, or approved leaves that haven't started, can be cancelled", { status: 400 })
            }
        }

        if (!status || !["APPROVED", "REJECTED", "CANCELLED"].includes(status)) {
            return new NextResponse("Valid status required: APPROVED, REJECTED, or CANCELLED", { status: 400 })
        }

        // Nobody signs off their own leave — except ADMIN, who has no one above.
        // Mirrors the expense guard: an approver-role user is still an employee.
        if (isAdminOrManager && (status === "APPROVED" || status === "REJECTED") && session.user.role !== "ADMIN") {
            const me = await prisma.employee.findFirst({
                where: { userId: session.user.id },
                select: { id: true },
            })
            if (me && me.id === existing.employeeId) {
                return new NextResponse("You cannot approve your own leave", { status: 403 })
            }
        }

        if (status === "REJECTED" && !rejectionReason) {
            return new NextResponse("rejectionReason is required when rejecting", { status: 400 })
        }

        // Balance may have moved since the request was filed (another leave
        // approved in between), so approval re-runs the same checks. Overlap and
        // type errors block; balance and notice rules can be overridden by HR.
        if (status === "APPROVED" && existing.status !== "APPROVED") {
            const check = await checkLeaveRequest({
                employeeId: existing.employeeId,
                type: existing.type,
                startDate: existing.startDate.toISOString(),
                endDate: existing.endDate.toISOString(),
                halfDay: existing.days === 0.5,
                excludeLeaveId: existing.id,
                isManager: true,
            })
            if (!check.ok && check.status === 409) return new NextResponse(check.error, { status: 409 })
            if (check.ok && check.warnings.some(w => w.startsWith("Insufficient")) && !override) {
                return NextResponse.json({ needsConfirm: true, warnings: check.warnings.filter(w => w.startsWith("Insufficient")) }, { status: 409 })
            }
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

        if (!isAdminOrManager && existing.status === "APPROVED") {
            await notifyApprovers(["leaves.approve", "leaves.manage"], {
                title: "Approved leave withdrawn",
                message: `${leave.employee.firstName} ${leave.employee.lastName} cancelled their approved ${leave.type} leave from ${leave.startDate.toISOString().slice(0, 10)}`,
                type: "leave", link: "/leaves",
            }, session.user.id)
        }

        if (isAdminOrManager && status !== existing.status) {
            const f = (d: Date) => d.toISOString().slice(0, 10)
            const what = `${leave.type} leave (${f(leave.startDate)}${leave.days > 1 ? ` to ${f(leave.endDate)}` : ""})`
            const msg = status === "APPROVED" ? `Your ${what} has been approved`
                : status === "REJECTED" ? `Your ${what} was rejected: ${rejectionReason}`
                : `Your ${what} was cancelled by HR`
            await notifyEmployee(leave.employeeId, {
                title: status === "APPROVED" ? "Leave approved" : status === "REJECTED" ? "Leave rejected" : "Leave cancelled",
                message: msg, type: "leave", link: "/leaves",
            })
        }

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
        // Deleting an approved leave that covers today would otherwise leave the
        // employee badged ON_LEAVE with nothing backing it.
        await syncLeaveStatus(existing.employeeId)
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[LEAVE_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
