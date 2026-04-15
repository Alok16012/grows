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
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const ticket = await prisma.ticket.findUnique({
            where: { id: params.id },
            include: {
                comments: {
                    orderBy: { createdAt: "asc" },
                },
            },
        })

        if (!ticket) return new NextResponse("Not Found", { status: 404 })

        const isPrivileged = checkAccess(session, ["MANAGER"], "helpdesk.view")
        if (!isPrivileged && ticket.raisedBy !== session.user.id) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        // Fetch user info for raisedBy, assignedTo, and comment authors
        const userIds = new Set<string>()
        userIds.add(ticket.raisedBy)
        if (ticket.assignedTo) userIds.add(ticket.assignedTo)
        ticket.comments.forEach(c => userIds.add(c.userId))

        const users = await prisma.user.findMany({
            where: { id: { in: Array.from(userIds) } },
            select: { id: true, name: true, email: true },
        })
        const userMap = Object.fromEntries(users.map(u => [u.id, u]))

        const commentsWithUser = ticket.comments.map(c => ({
            ...c,
            user: userMap[c.userId] || null,
        }))

        return NextResponse.json({
            ...ticket,
            comments: commentsWithUser,
            raisedByUser: userMap[ticket.raisedBy] || null,
            assignedToUser: ticket.assignedTo ? (userMap[ticket.assignedTo] || null) : null,
        })
    } catch (error) {
        console.error("[HELPDESK_GET_ONE]", error)
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

        const ticket = await prisma.ticket.findUnique({ where: { id: params.id } })
        if (!ticket) return new NextResponse("Not Found", { status: 404 })

        const isPrivileged = checkAccess(session, ["MANAGER"], "helpdesk.view")
        if (!isPrivileged && ticket.raisedBy !== session.user.id) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { status, priority, assignedTo, dueDate, title, description, category } = body

        const updateData: Record<string, unknown> = {}
        if (title !== undefined) updateData.title = title
        if (description !== undefined) updateData.description = description
        if (category !== undefined) updateData.category = category
        if (priority !== undefined) updateData.priority = priority
        if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null

        // Only privileged can change status/assignee
        if (isPrivileged) {
            if (status !== undefined) {
                updateData.status = status
                if (status === "RESOLVED" && ticket.status !== "RESOLVED") {
                    updateData.resolvedAt = new Date()
                }
                if (status === "CLOSED" && ticket.status !== "CLOSED") {
                    updateData.closedAt = new Date()
                }
            }
            if (assignedTo !== undefined) {
                updateData.assignedTo = assignedTo || null
            }
        }

        const updated = await prisma.ticket.update({
            where: { id: params.id },
            data: updateData,
        })

        return NextResponse.json(updated)
    } catch (error) {
        console.error("[HELPDESK_PUT]", error)
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
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "helpdesk.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const ticket = await prisma.ticket.findUnique({ where: { id: params.id } })
        if (!ticket) return new NextResponse("Not Found", { status: 404 })

        await prisma.ticket.delete({ where: { id: params.id } })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[HELPDESK_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
