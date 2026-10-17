import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { resolveUserId } from "@/lib/resolveUserId"
import { TicketPriority } from "@prisma/client"

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

        const isPrivileged = session.user.role === "ADMIN" || (session.user.permissions ?? []).includes("helpdesk.manage")

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
        if (priority !== undefined && priority !== null && !Object.values(TicketPriority).includes(priority)) {
            return new NextResponse(`Unknown priority: ${priority}`, { status: 400 })
        }

        // Generate the ticket number from the MAX existing number (+ bump), NOT a
        // row count — `ticketNo` is @unique, so a count collides with a live
        // number as soon as any earlier ticket has been deleted (500 on create).
        const nextTicketNo = async (bump = 0): Promise<string> => {
            try {
                const rows: any[] = await (prisma as any).$queryRaw`
                    SELECT COALESCE(MAX(CAST(SUBSTRING("ticketNo" FROM 5) AS INTEGER)), 0) AS max
                    FROM "Ticket" WHERE "ticketNo" ~ '^TKT-[0-9]+$'`
                const max = Number(rows?.[0]?.max ?? 0)
                return `TKT-${String(max + 1 + bump).padStart(4, "0")}`
            } catch {
                const count = await prisma.ticket.count()
                return `TKT-${String(count + 1 + bump).padStart(4, "0")}`
            }
        }
        const isDupTicketNo = (err: any) =>
            err?.code === "P2002" ||
            /23505|already exists|duplicate key|unique constraint/i.test(String(err?.message ?? ""))

        // Two tickets raised at the same instant can still race on the number;
        // retry with a bumped suffix rather than failing the whole request.
        let ticket: any = null
        for (let bump = 0; bump < 3 && !ticket; bump++) {
            const ticketNo = await nextTicketNo(bump)
            try {
                ticket = await prisma.ticket.create({
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
            } catch (err: any) {
                if (!isDupTicketNo(err) || bump === 2) throw err
            }
        }

        return NextResponse.json(ticket)
    } catch (error) {
        console.error("[HELPDESK_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
