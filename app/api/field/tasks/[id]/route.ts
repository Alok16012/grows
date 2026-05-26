import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

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

        if (!isAdminOrManager) {
            // Employees can only update status + completedNote on their own tasks
            const employee = await prisma.employee.findFirst({
                where: { email: session.user.email },
            })
            if (!employee || task.employeeId !== employee.id) {
                return new NextResponse("Forbidden", { status: 403 })
            }

            const { status, completedNote } = body
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

        // Admin/Manager can update all fields
        const { title, description, employeeId, siteId, priority, status, dueDate, dueTime, completedNote } = body
        const updateData: Record<string, unknown> = {}
        if (title !== undefined) updateData.title = title
        if (description !== undefined) updateData.description = description
        if (employeeId !== undefined) updateData.employeeId = employeeId
        if (siteId !== undefined) updateData.siteId = siteId || null
        if (priority !== undefined) updateData.priority = priority
        if (status !== undefined) updateData.status = status
        if (dueDate !== undefined) updateData.dueDate = new Date(dueDate)
        if (dueTime !== undefined) updateData.dueTime = dueTime || null
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
