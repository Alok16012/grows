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

        const expense = await prisma.expense.findUnique({ where: { id: params.id } })
        if (!expense) return new NextResponse("Not Found", { status: 404 })

        const isPrivileged = session.user.role === "ADMIN" || session.user.role === "MANAGER"
        if (!isPrivileged && expense.submittedBy !== session.user.id) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const userIds = new Set<string>()
        userIds.add(expense.submittedBy)
        if (expense.approvedBy) userIds.add(expense.approvedBy)

        const users = await prisma.user.findMany({
            where: { id: { in: Array.from(userIds) } },
            select: { id: true, name: true, email: true },
        })
        const userMap = Object.fromEntries(users.map(u => [u.id, u]))

        return NextResponse.json({
            ...expense,
            submittedByUser: userMap[expense.submittedBy] || null,
            approvedByUser: expense.approvedBy ? (userMap[expense.approvedBy] || null) : null,
        })
    } catch (error) {
        console.error("[EXPENSE_GET_ONE]", error)
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

        const expense = await prisma.expense.findUnique({ where: { id: params.id } })
        if (!expense) return new NextResponse("Not Found", { status: 404 })

        const isPrivileged = session.user.role === "ADMIN" || session.user.role === "MANAGER"
        const isOwner = expense.submittedBy === session.user.id

        if (!isPrivileged && !isOwner) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { action, title, category, amount, date, description, rejectionReason, paymentMode } = body

        const updateData: Record<string, unknown> = {}

        if (isOwner && expense.status === "DRAFT") {
            // Owner can edit DRAFT fields
            if (title !== undefined) updateData.title = title
            if (category !== undefined) updateData.category = category
            if (amount !== undefined) updateData.amount = parseFloat(amount)
            if (date !== undefined) updateData.date = new Date(date)
            if (description !== undefined) updateData.description = description || null
        }

        // Action-based transitions
        if (action === "SUBMIT") {
            // Owner submits DRAFT → SUBMITTED
            if (!isOwner) return new NextResponse("Only the owner can submit", { status: 403 })
            if (expense.status !== "DRAFT") return new NextResponse("Only DRAFT can be submitted", { status: 400 })
            updateData.status = "SUBMITTED"
        } else if (action === "APPROVE") {
            // Admin/Manager approves SUBMITTED → APPROVED
            if (!isPrivileged) return new NextResponse("Forbidden", { status: 403 })
            if (expense.status !== "SUBMITTED") return new NextResponse("Only SUBMITTED can be approved", { status: 400 })
            updateData.status = "APPROVED"
            updateData.approvedBy = session.user.id
            updateData.approvedAt = new Date()
        } else if (action === "REJECT") {
            // Admin/Manager rejects SUBMITTED → REJECTED
            if (!isPrivileged) return new NextResponse("Forbidden", { status: 403 })
            if (expense.status !== "SUBMITTED") return new NextResponse("Only SUBMITTED can be rejected", { status: 400 })
            if (!rejectionReason) return new NextResponse("rejectionReason is required", { status: 400 })
            updateData.status = "REJECTED"
            updateData.rejectionReason = rejectionReason
            updateData.rejectedAt = new Date()
        } else if (action === "PAID") {
            // Admin/Manager marks APPROVED → PAID
            if (!isPrivileged) return new NextResponse("Forbidden", { status: 403 })
            if (expense.status !== "APPROVED") return new NextResponse("Only APPROVED can be marked paid", { status: 400 })
            if (!paymentMode) return new NextResponse("paymentMode is required", { status: 400 })
            updateData.status = "PAID"
            updateData.paidAt = new Date()
            updateData.paymentMode = paymentMode
        }

        if (Object.keys(updateData).length === 0) {
            return new NextResponse("No valid updates", { status: 400 })
        }

        const updated = await prisma.expense.update({
            where: { id: params.id },
            data: updateData,
        })

        return NextResponse.json(updated)
    } catch (error) {
        console.error("[EXPENSE_PUT]", error)
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

        const expense = await prisma.expense.findUnique({ where: { id: params.id } })
        if (!expense) return new NextResponse("Not Found", { status: 404 })

        // Only the owner can delete, and only DRAFT status
        if (expense.submittedBy !== session.user.id) {
            return new NextResponse("Forbidden", { status: 403 })
        }
        if (expense.status !== "DRAFT") {
            return new NextResponse("Only DRAFT expenses can be deleted", { status: 400 })
        }

        await prisma.expense.delete({ where: { id: params.id } })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[EXPENSE_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
