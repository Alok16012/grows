import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const { searchParams } = new URL(req.url)
        const status = searchParams.get("status")
        const priority = searchParams.get("priority")
        const employeeId = searchParams.get("employeeId")
        const siteId = searchParams.get("siteId")
        const date = searchParams.get("date")
        const search = searchParams.get("search")

        const isAdminOrManager = session.user.role === "ADMIN" || session.user.role === "MANAGER"

        const where: Record<string, unknown> = {}

        // Employees see only their own tasks
        if (!isAdminOrManager) {
            // Find employee record linked to this user - match by email
            const employee = await prisma.employee.findFirst({
                where: { email: session.user.email },
            })
            if (!employee) return NextResponse.json([])
            where.employeeId = employee.id
        } else {
            if (employeeId) where.employeeId = employeeId
            if (siteId) where.siteId = siteId
        }

        if (status) where.status = status
        if (priority) where.priority = priority

        if (date) {
            const start = new Date(date)
            start.setHours(0, 0, 0, 0)
            const end = new Date(date)
            end.setHours(23, 59, 59, 999)
            where.dueDate = { gte: start, lte: end }
        }

        if (search) {
            where.OR = [
                { title: { contains: search, mode: "insensitive" } },
                { taskNo: { contains: search, mode: "insensitive" } },
            ]
        }

        const tasks = await prisma.fieldTask.findMany({
            where,
            include: {
                employee: {
                    select: {
                        id: true,
                        employeeId: true,
                        firstName: true,
                        lastName: true,
                        photo: true,
                        designation: true,
                    },
                },
            },
            orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        })

        // Fetch site names separately if siteIds exist
        const siteIds = [...new Set(tasks.map((t) => t.siteId).filter(Boolean))] as string[]
        let siteMap: Record<string, string> = {}
        if (siteIds.length > 0) {
            const sites = await prisma.site.findMany({
                where: { id: { in: siteIds } },
                select: { id: true, name: true },
            })
            siteMap = Object.fromEntries(sites.map((s) => [s.id, s.name]))
        }

        const result = tasks.map((t) => ({
            ...t,
            siteName: t.siteId ? siteMap[t.siteId] || null : null,
        }))

        return NextResponse.json(result)
    } catch (error) {
        console.error("[FIELD_TASKS_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { title, description, employeeId, siteId, priority, dueDate, dueTime } = body

        if (!title || !employeeId || !dueDate) {
            return new NextResponse("title, employeeId and dueDate are required", { status: 400 })
        }

        // Auto-generate taskNo FT-NNNN
        const lastTask = await prisma.fieldTask.findFirst({
            where: { taskNo: { startsWith: "FT-" } },
            orderBy: { createdAt: "desc" },
            select: { taskNo: true },
        })
        let nextNum = 1
        if (lastTask?.taskNo) {
            const match = lastTask.taskNo.match(/\d+$/)
            if (match) nextNum = parseInt(match[0]) + 1
        }
        const taskNo = `FT-${String(nextNum).padStart(4, "0")}`

        const task = await prisma.fieldTask.create({
            data: {
                taskNo,
                title,
                description: description || null,
                employeeId,
                siteId: siteId || null,
                priority: priority || "MEDIUM",
                dueDate: new Date(dueDate),
                dueTime: dueTime || null,
                assignedBy: session.user.id,
            },
            include: {
                employee: {
                    select: {
                        id: true,
                        employeeId: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
        })

        return NextResponse.json(task)
    } catch (error) {
        console.error("[FIELD_TASKS_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
