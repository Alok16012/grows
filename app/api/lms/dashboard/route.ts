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
        const branchId = searchParams.get("branchId")
        const period = searchParams.get("period") || "all"

        const now = new Date()
        let dateFilter: { gte?: Date; lte?: Date } | undefined
        if (period === "30days") {
            dateFilter = { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) }
        } else if (period === "90days") {
            dateFilter = { gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) }
        } else if (period === "year") {
            dateFilter = { gte: new Date(now.getFullYear(), 0, 1) }
        }

        const enrollWhere: Record<string, unknown> = {}
        if (courseId) enrollWhere.courseId = courseId
        if (dateFilter) enrollWhere.enrolledAt = dateFilter

        const employeeWhere: Record<string, unknown> = {}
        if (branchId) employeeWhere.branchId = branchId

        const [
            totalEmployees,
            totalCourses,
            enrollmentStats,
            courseStats,
            branchStats,
            monthlyStats,
            expiringCerts,
            topCourses,
            pendingTraining,
        ] = await Promise.all([
            prisma.employee.count({ where: { status: "ACTIVE", ...employeeWhere } }),
            prisma.course.count({ where: { status: "PUBLISHED" } }),
            prisma.courseEnrollment.aggregate({
                where: enrollWhere,
                _count: true,
                _avg: { progress: true },
            }),
            prisma.courseEnrollment.groupBy({
                by: ["status"],
                where: enrollWhere,
                _count: true,
            }),
            prisma.courseEnrollment.findMany({
                where: enrollWhere,
                include: {
                    employee: { select: { branchId: true, branch: { select: { name: true } } } },
                },
            }),
            prisma.courseEnrollment.findMany({
                where: { ...enrollWhere, enrolledAt: dateFilter },
                select: { enrolledAt: true, completedAt: true },
            }),
            prisma.courseEnrollment.findMany({
                where: {
                    status: "COMPLETED",
                    course: { validityDays: { not: null } },
                },
                include: {
                    course: { select: { title: true, validityDays: true } },
                    employee: { select: { firstName: true, lastName: true } },
                },
            }),
            prisma.courseEnrollment.groupBy({
                by: ["courseId"],
                where: { ...enrollWhere, status: "COMPLETED" },
                _count: true,
                orderBy: { _count: { courseId: "desc" } },
                take: 5,
            }),
            prisma.courseEnrollment.count({
                where: {
                    status: { in: ["ENROLLED", "IN_PROGRESS"] },
                    dueDate: { lt: now },
                },
            }),
        ])

        const completedCount = courseStats.find(s => s.status === "COMPLETED")?._count || 0
        const inProgressCount = courseStats.find(s => s.status === "IN_PROGRESS")?._count || 0
        const failedCount = courseStats.find(s => s.status === "FAILED")?._count || 0
        const passRate = totalCourses > 0 ? Math.round((completedCount / Math.max(1, enrollmentStats._count)) * 100) : 0

        const branchCompletion: Record<string, { enrolled: number; completed: number }> = {}
        for (const e of branchStats) {
            const branchName = e.employee.branch?.name || "Unknown"
            if (!branchCompletion[branchName]) {
                branchCompletion[branchName] = { enrolled: 0, completed: 0 }
            }
            branchCompletion[branchName].enrolled++
            if (e.status === "COMPLETED") {
                branchCompletion[branchName].completed++
            }
        }

        const monthly: Record<string, { month: string; enrolled: number; completed: number }> = {}
        for (const e of monthlyStats) {
            const monthKey = e.enrolledAt.toISOString().substring(0, 7)
            if (!monthly[monthKey]) {
                monthly[monthKey] = { month: monthKey, enrolled: 0, completed: 0 }
            }
            monthly[monthKey].enrolled++
            if (e.completedAt) {
                const compMonth = e.completedAt.toISOString().substring(0, 7)
                if (!monthly[compMonth]) {
                    monthly[compMonth] = { month: compMonth, enrolled: 0, completed: 0 }
                }
                monthly[compMonth].completed++
            }
        }

        const expiringCertificates = expiringCerts
            .filter(e => {
                if (!e.course.validityDays || !e.completedAt) return false
                const expiryDate = new Date(e.completedAt.getTime() + e.course.validityDays * 24 * 60 * 60 * 1000)
                const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
                return daysUntilExpiry <= 30 && daysUntilExpiry > 0
            })
            .map(e => {
                const expiryDate = new Date(e.completedAt!.getTime() + e.course.validityDays! * 24 * 60 * 60 * 1000)
                return {
                    employeeName: `${e.employee.firstName} ${e.employee.lastName}`,
                    courseName: e.course.title,
                    expiresAt: expiryDate.toISOString(),
                    daysLeft: Math.ceil((expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
                }
            })
            .sort((a, b) => a.daysLeft - b.daysLeft)

        const topCourseIds = topCourses.map(t => t.courseId)
        const topCourseData = await prisma.course.findMany({
            where: { id: { in: topCourseIds } },
            select: { id: true, title: true, courseCode: true },
        })

        const topCoursesWithData = topCourses.map(t => {
            const course = topCourseData.find(c => c.id === t.courseId)
            return {
                id: t.courseId,
                title: course?.title || "Unknown",
                courseCode: course?.courseCode || "",
                completions: t._count,
            }
        })

        return NextResponse.json({
            overview: {
                totalEmployees,
                totalCourses,
                totalEnrollments: enrollmentStats._count,
                completed: completedCount,
                inProgress: inProgressCount,
                failed: failedCount,
                passRate,
                avgProgress: Math.round(enrollmentStats._avg.progress || 0),
                overdueTraining: pendingTraining,
                expiringCertificates: expiringCertificates.length,
            },
            branchStats: Object.entries(branchCompletion).map(([branch, stats]) => ({
                branch,
                enrolled: stats.enrolled,
                completed: stats.completed,
                completionRate: stats.enrolled > 0 ? Math.round((stats.completed / stats.enrolled) * 100) : 0,
            })),
            monthlyStats: Object.values(monthly).sort((a, b) => a.month.localeCompare(b.month)).slice(-6),
            topCourses: topCoursesWithData,
            expiringCertificates,
        })
    } catch (error) {
        console.error("[LMS_DASHBOARD_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
