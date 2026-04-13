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
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
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

        const isAdminOrManager = session.user.role === "ADMIN" || session.user.role === "MANAGER"

        if (!isAdminOrManager) {
            // Owner can only cancel their own PENDING leave
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

        // Sync employee status
        if (status === "APPROVED") {
            await prisma.employee.update({
                where: { id: leave.employeeId },
                data: { status: "ON_LEAVE" },
            })
        } else if (status === "REJECTED" || status === "CANCELLED") {
            const activeLeaves = await prisma.leave.count({
                where: {
                    employeeId: leave.employeeId,
                    status: "APPROVED",
                    endDate: { gte: new Date() },
                    id: { not: params.id },
                },
            })
            if (activeLeaves === 0) {
                await prisma.employee.update({
                    where: { id: leave.employeeId },
                    data: { status: "ACTIVE" },
                })
            }
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

        const isAdminOrManager = session.user.role === "ADMIN" || session.user.role === "MANAGER"

        // Only admin/manager or leave creator (PENDING only)
        if (!isAdminOrManager) {
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
