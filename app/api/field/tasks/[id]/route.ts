import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { FieldTaskStatus, TaskPriority } from "@prisma/client"
import { istDateOnly } from "@/lib/attendance-policy"

// "YYYY-MM-DD" → UTC midnight of that calendar day (the istDateOnly convention,
// which the list's `date=` filter relies on). Mirrors ../route.ts.
function parseDueDate(raw: unknown): Date | null {
    if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
    const d = new Date(raw + "T00:00:00.000Z")
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10) === raw ? d : null
}

const DUE_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const task = await prisma.fieldTask.findUnique({
            where: { id: params.id },
            include: {
                employee: {
                    select: {
                        id: true,
                        employeeId: true,
                        firstName: true,
                        lastName: true,
                        photo: true,
                        designation: true,
                        phone: true,
                    },
                },
            },
        })

        if (!task) return new NextResponse("Not Found", { status: 404 })

        // Non-admin users can only view their own tasks.
        const isManager = checkAccess(session, ["MANAGER"], "field.manage")
        const isAdmin = session.user.role === "ADMIN"
        if (!isManager && !isAdmin) {
            const employee = await prisma.employee.findFirst({
                where: { userId: session.user.id },
                select: { id: true },
            })
            if (!employee || task.employeeId !== employee.id) {
                return new NextResponse("Forbidden", { status: 403 })
            }
        }

        let siteName: string | null = null
        if (task.siteId) {
            const site = await prisma.site.findUnique({
                where: { id: task.siteId },
                select: { name: true },
            })
            siteName = site?.name || null
        }

        return NextResponse.json({ ...task, siteName })
    } catch (error) {
        console.error("[FIELD_TASK_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const task = await prisma.fieldTask.findUnique({ where: { id: params.id } })
        if (!task) return new NextResponse("Not Found", { status: 404 })

        const isAdminOrManager = checkAccess(session, ["MANAGER"], "field.manage")
        const body = await req.json()

        // `status` is an enum column: an unknown value used to surface as a 500.
        if (body.status !== undefined && body.status !== null
            && !Object.values(FieldTaskStatus).includes(body.status)) {
            return new NextResponse(`Invalid status: must be one of ${Object.values(FieldTaskStatus).join(", ")}`, { status: 400 })
        }

        if (!isAdminOrManager) {
            // Employees can only update status + completedNote on their own tasks
            const employee = await prisma.employee.findFirst({
                where: { userId: session.user.id },
            })
            if (!employee || task.employeeId !== employee.id) {
                return new NextResponse("Forbidden", { status: 403 })
            }

            const { status, completedNote } = body
            // Once a task is marked done it is the manager's record — the
            // employee can't quietly reopen (or cancel) it; only field.manage can.
            if (status && task.status === "COMPLETED" && status !== "COMPLETED") {
                return new NextResponse("A completed task can only be reopened by a manager", { status: 403 })
            }
            const updateData: Record<string, unknown> = {}
            if (status) updateData.status = status
            if (completedNote !== undefined) updateData.completedNote = completedNote
            if (status === "COMPLETED") updateData.completedAt = new Date()

            const updated = await prisma.fieldTask.update({
                where: { id: params.id },
                data: updateData,
            })
            return NextResponse.json(updated)
        }

        // Admin/Manager can update all fields. Same per-field 400s as POST so bad
        // input never surfaces as a 500.
        const { title, description, employeeId, siteId, priority, status, dueDate, dueTime, completedNote } = body
        const updateData: Record<string, unknown> = {}
        if (title !== undefined) {
            if (typeof title !== "string" || !title.trim()) return new NextResponse("Title cannot be empty", { status: 400 })
            updateData.title = title.trim()
        }
        if (description !== undefined) updateData.description = description || null
        if (employeeId !== undefined) {
            const employee = typeof employeeId === "string" && employeeId
                ? await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } })
                : null
            if (!employee) return new NextResponse("Employee not found", { status: 400 })
            updateData.employeeId = employeeId
        }
        if (siteId !== undefined) {
            if (siteId) {
                const site = typeof siteId === "string"
                    ? await prisma.site.findUnique({ where: { id: siteId }, select: { id: true } })
                    : null
                if (!site) return new NextResponse("Site not found", { status: 400 })
            }
            updateData.siteId = siteId || null
        }
        if (priority !== undefined) {
            if (!Object.values(TaskPriority).includes(priority)) {
                return new NextResponse(`Invalid priority: must be one of ${Object.values(TaskPriority).join(", ")}`, { status: 400 })
            }
            updateData.priority = priority
        }
        if (status !== undefined) updateData.status = status
        if (dueDate !== undefined) {
            const due = parseDueDate(dueDate)
            if (!due) return new NextResponse("Due date must be a valid YYYY-MM-DD date", { status: 400 })
            if (due < istDateOnly()) return new NextResponse("Due date cannot be in the past", { status: 400 })
            updateData.dueDate = due
        }
        if (dueTime !== undefined) {
            if (dueTime && (typeof dueTime !== "string" || !DUE_TIME_RE.test(dueTime))) {
                return new NextResponse("Due time must be HH:MM (24-hour)", { status: 400 })
            }
            updateData.dueTime = dueTime || null
        }
        if (completedNote !== undefined) updateData.completedNote = completedNote
        if (status === "COMPLETED" && !task.completedAt) updateData.completedAt = new Date()

        const updated = await prisma.fieldTask.update({
            where: { id: params.id },
            data: updateData,
        })
        return NextResponse.json(updated)
    } catch (error) {
        console.error("[FIELD_TASK_PUT]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER"], "field.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const task = await prisma.fieldTask.findUnique({ where: { id: params.id } })
        if (!task) return new NextResponse("Not Found", { status: 404 })
        if (task.status !== "ASSIGNED") {
            return new NextResponse("Only ASSIGNED tasks can be deleted", { status: 400 })
        }

        await prisma.fieldTask.delete({ where: { id: params.id } })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[FIELD_TASK_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
