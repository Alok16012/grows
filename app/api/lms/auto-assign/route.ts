import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { employeeId, departmentId, branchId, designation } = body

        if (!employeeId) return new NextResponse("employeeId is required", { status: 400 })

        const employee = await prisma.employee.findUnique({
            where: { id: employeeId },
            include: {
                department: true,
                branch: { include: { company: true } },
                deployments: { where: { isActive: true }, include: { site: true } },
            },
        })

        if (!employee) return new NextResponse("Employee not found", { status: 404 })

        const allRules = await prisma.courseAssignmentRule.findMany({
            where: { isActive: true },
            include: { course: true },
        })

        const existingEnrollments = await prisma.courseEnrollment.findMany({
            where: { employeeId },
            select: { courseId: true },
        })
        const enrolledCourseIds = new Set(existingEnrollments.map(e => e.courseId))

        const toEnroll: { courseId: string; dueDate: Date | null }[] = []

        for (const rule of allRules) {
            if (enrolledCourseIds.has(rule.courseId)) continue
            if (rule.course.status !== "PUBLISHED") continue

            let matches = false

            switch (rule.assignTo) {
                case "ALL":
                    matches = true
                    break
                case "ROLE":
                    matches = employee.department?.name?.toUpperCase().includes(rule.value.toUpperCase()) || false
                    break
                case "DESIGNATION":
                    matches = employee.designation?.toLowerCase().includes(rule.value.toLowerCase()) || false
                    break
                case "SITE":
                    matches = employee.deployments.some(d => d.siteId === rule.value)
                    break
                case "CLIENT":
                    matches = employee.deployments.some(d => d.site?.clientName?.toLowerCase().includes(rule.value.toLowerCase()))
                    break
                case "BRANCH":
                    matches = employee.branchId === rule.value
                    break
            }

            if (matches) {
                const dueDate = rule.dueDays
                    ? new Date(Date.now() + rule.dueDays * 24 * 60 * 60 * 1000)
                    : null
                toEnroll.push({ courseId: rule.courseId, dueDate })
            }
        }

        if (toEnroll.length === 0) {
            return NextResponse.json({ enrolled: 0, courses: [] })
        }

        const created = await prisma.courseEnrollment.createMany({
            data: toEnroll.map(item => ({
                courseId: item.courseId,
                employeeId,
                enrolledBy: session.user.id,
                dueDate: item.dueDate,
            })),
            skipDuplicates: true,
        })

        const courseNames = toEnroll.map(item => {
            const course = allRules.find(r => r.courseId === item.courseId)?.course
            return course?.title || item.courseId
        })

        return NextResponse.json({
            enrolled: created.count,
            courses: courseNames,
        })
    } catch (error) {
        console.error("[LMS_AUTO_ASSIGN]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
