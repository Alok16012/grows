import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { resolveUserId } from "@/lib/resolveUserId"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const { searchParams } = new URL(req.url)
        const status = searchParams.get("status")
        const priority = searchParams.get("priority")
        const category = searchParams.get("category")
        const assignedTo = searchParams.get("assignedTo")
        const search = searchParams.get("search")
        const raisedBy = searchParams.get("raisedBy")

        const isPrivileged = session.user.role === "ADMIN" || session.user.role === "MANAGER"

        const where: Record<string, unknown> = {}

        // Non-privileged users can only see their own tickets
        if (!isPrivileged) {
            where.raisedBy = session.user.id
        } else {
            if (raisedBy) where.raisedBy = raisedBy
            if (assignedTo) where.assignedTo = assignedTo
        }

        if (status && status !== "ALL") where.status = status
        if (priority && priority !== "ALL") where.priority = priority
        if (category && category !== "ALL") where.category = category

        if (search) {
            where.OR = [
                { title: { contains: search, mode: "insensitive" } },
                { ticketNo: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
            ]
        }

        const tickets = await prisma.ticket.findMany({
            where,
            orderBy: { createdAt: "desc" },
            include: {
                _count: { select: { comments: true } },
            },
        })

        // Fetch raisedBy and assignedTo user names
        const userIds = new Set<string>()
        tickets.forEach(t => {
            userIds.add(t.raisedBy)
            if (t.assignedTo) userIds.add(t.assignedTo)
        })

        const users = await prisma.user.findMany({
            where: { id: { in: Array.from(userIds) } },
            select: { id: true, name: true, email: true },
        })
        const userMap = Object.fromEntries(users.map(u => [u.id, u]))

        const result = tickets.map(t => ({
            ...t,
            raisedByUser: userMap[t.raisedBy] || null,
            assignedToUser: t.assignedTo ? (userMap[t.assignedTo] || null) : null,
        }))

        return NextResponse.json(result)
    } catch (error) {
        console.error("[HELPDESK_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        // Resolve real DB user ID
        const actorId = await resolveUserId(session)
        if (!actorId) return NextResponse.json({ error: "User not found. Please log in again." }, { status: 403 })

        const body = await req.json()
        const { title, description, category, priority, employeeId, dueDate } = body

        if (!title || !description || !category) {
            return new NextResponse("title, description, and category are required", { status: 400 })
        }

        // Generate ticket number
        const count = await prisma.ticket.count()
        const ticketNo = `TKT-${String(count + 1).padStart(4, "0")}`

        const ticket = await prisma.ticket.create({
            data: {
                ticketNo,
                title,
                description,
                category,
                priority: priority || "MEDIUM",
                status: "OPEN",
                raisedBy: actorId!,
                employeeId: employeeId || null,
                dueDate: dueDate ? new Date(dueDate) : null,
            },
        })

        return NextResponse.json(ticket)
    } catch (error) {
        console.error("[HELPDESK_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
