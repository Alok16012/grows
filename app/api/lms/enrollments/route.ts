import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "lms.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const courseId = searchParams.get("courseId")
        const employeeId = searchParams.get("employeeId")
        const status = searchParams.get("status")
        const search = searchParams.get("search")

        const where: Record<string, unknown> = {}
        if (courseId) where.courseId = courseId
        if (employeeId) where.employeeId = employeeId
        if (status) where.status = status
        if (search) {
            where.employee = {
                OR: [
                    { firstName: { contains: search, mode: "insensitive" } },
                    { lastName: { contains: search, mode: "insensitive" } },
                    { employeeId: { contains: search, mode: "insensitive" } },
                ],
            }
        }

        const enrollments = await prisma.courseEnrollment.findMany({
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
                course: {
                    select: {
                        id: true,
                        courseCode: true,
                        title: true,
                        passingScore: true,
                        category: true,
                    },
                },
            },
            orderBy: { enrolledAt: "desc" },
        })

        return NextResponse.json(enrollments)
    } catch (error) {
        console.error("[LMS_ENROLLMENTS_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "lms.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { courseId, employeeId, employeeIds, enrollAll, dueDate } = body

        if (!courseId) return new NextResponse("courseId is required", { status: 400 })

        let targetEmployeeIds: string[] = []

        if (enrollAll) {
            const activeEmployees = await prisma.employee.findMany({
                where: { status: "ACTIVE" },
                select: { id: true },
            })
            targetEmployeeIds = activeEmployees.map(e => e.id)
        } else if (employeeIds && Array.isArray(employeeIds)) {
            targetEmployeeIds = employeeIds
        } else if (employeeId) {
            targetEmployeeIds = [employeeId]
        }

        if (targetEmployeeIds.length === 0) {
            return new NextResponse("No employees specified", { status: 400 })
        }

        // Filter out already enrolled
        const existing = await prisma.courseEnrollment.findMany({
            where: { courseId, employeeId: { in: targetEmployeeIds } },
            select: { employeeId: true },
        })
        const existingIds = new Set(existing.map(e => e.employeeId))
        const newIds = targetEmployeeIds.filter(id => !existingIds.has(id))

        if (newIds.length === 0) {
            return new NextResponse("All selected employees are already enrolled", { status: 400 })
        }

        const created = await prisma.courseEnrollment.createMany({
            data: newIds.map(eid => ({
                courseId,
                employeeId: eid,
                enrolledBy: session.user.id,
                dueDate: dueDate ? new Date(dueDate) : null,
            })),
        })

        return NextResponse.json({ enrolled: created.count, skipped: existingIds.size })
    } catch (error) {
        console.error("[LMS_ENROLLMENTS_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
