import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(req: Request, { params }: { params: { type: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const branchId = searchParams.get("branchId")
        const clientId = searchParams.get("clientId")
        const startDate = searchParams.get("startDate")
        const endDate = searchParams.get("endDate")

        const dateFilter: Record<string, unknown> = {}
        if (startDate) dateFilter.gte = new Date(startDate)
        if (endDate) dateFilter.lte = new Date(endDate)

        const employeeFilter: Record<string, unknown> = {}
        if (branchId) employeeFilter.branchId = branchId
        if (clientId) {
            employeeFilter.deployments = {
                some: { site: { clientId }, isActive: true }
            }
        }

        switch (params.type) {
            case "employee": {
                const enrollments = await prisma.courseEnrollment.findMany({
                    where: {
                        ...(Object.keys(dateFilter).length ? { enrolledAt: dateFilter } : {}),
                        employee: employeeFilter,
                    },
                    include: {
                        employee: {
                            select: { id: true, firstName: true, lastName: true, employeeId: true, designation: true, branch: { select: { name: true } } },
                        },
                        course: { select: { title: true, courseCode: true, category: true } },
                    },
                    orderBy: { enrolledAt: "desc" },
                })

                const employeeStats: Record<string, { employee: any; courses: any[]; completed: number; inProgress: number; failed: number; avgScore: number; totalScore: number; scoreCount: number }> = {}
                for (const e of enrollments) {
                    const empId = e.employeeId
                    if (!employeeStats[empId]) {
                        employeeStats[empId] = { employee: e.employee, courses: [], completed: 0, inProgress: 0, failed: 0, avgScore: 0, totalScore: 0, scoreCount: 0 }
                    }
                    employeeStats[empId].courses.push({
                        course: e.course.title,
                        status: e.status,
                        score: e.score,
                        enrolledAt: e.enrolledAt,
                        completedAt: e.completedAt,
                    })
                    if (e.status === "COMPLETED") employeeStats[empId].completed++
                    else if (e.status === "IN_PROGRESS") employeeStats[empId].inProgress++
                    else if (e.status === "FAILED") employeeStats[empId].failed++
                    if (e.score !== null) {
                        employeeStats[empId].totalScore += e.score
                        employeeStats[empId].scoreCount++
                    }
                }

                for (const emp of Object.values(employeeStats)) {
                    emp.avgScore = emp.scoreCount > 0 ? Math.round(emp.totalScore / emp.scoreCount) : 0
                }

                return NextResponse.json(Object.values(employeeStats))
            }

            case "course": {
                const courses = await prisma.course.findMany({
                    where: { status: "PUBLISHED" },
                    include: {
                        _count: { select: { enrollments: true } },
                        enrollments: {
                            where: Object.keys(dateFilter).length ? { enrolledAt: dateFilter } : {},
                            include: {
                                employee: {
                                    select: { branch: { select: { name: true } } },
                                },
                            },
                        },
                    },
                })

                const courseStats = courses.map(c => {
                    const byStatus = { COMPLETED: 0, IN_PROGRESS: 0, ENROLLED: 0, FAILED: 0, DROPPED: 0 }
                    const byBranch: Record<string, number> = {}
                    let totalScore = 0, scoreCount = 0

                    for (const e of c.enrollments) {
                        byStatus[e.status as keyof typeof byStatus]++
                        const branch = e.employee.branch?.name || "Unknown"
                        byBranch[branch] = (byBranch[branch] || 0) + 1
                        if (e.score !== null) {
                            totalScore += e.score
                            scoreCount++
                        }
                    }

                    return {
                        id: c.id,
                        courseCode: c.courseCode,
                        title: c.title,
                        category: c.category,
                        totalEnrolled: c._count.enrollments,
                        ...byStatus,
                        completionRate: c._count.enrollments > 0 ? Math.round((byStatus.COMPLETED / c._count.enrollments) * 100) : 0,
                        avgScore: scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0,
                        byBranch,
                    }
                })

                return NextResponse.json(courseStats)
            }

            case "site": {
                const sites = await prisma.site.findMany({
                    where: clientId ? { clientId } : {},
                    include: {
                        deployments: {
                            where: { isActive: true },
                            include: {
                                employee: {
                                    select: { id: true, branch: { select: { name: true } } },
                                    include: {
                                        enrollments: {
                                            where: Object.keys(dateFilter).length ? { enrolledAt: dateFilter } : {},
                                            include: { course: { select: { title: true } } },
                                        },
                                    },
                                },
                            },
                        },
                    },
                })

                const siteStats = sites.map(site => {
                    const employees = site.deployments.map(d => d.employee)
                    const uniqueEmployees = employees.filter((e, i, arr) => arr.findIndex(x => x.id === e.id) === i)

                    let totalEnrolled = 0, completed = 0, inProgress = 0, failed = 0
                    let totalScore = 0, scoreCount = 0
                    const courseCompletions: Record<string, number> = {}

                    for (const emp of uniqueEmployees) {
                        for (const e of emp.enrollments) {
                            totalEnrolled++
                            if (e.status === "COMPLETED") {
                                completed++
                                const courseName = e.course.title
                                courseCompletions[courseName] = (courseCompletions[courseName] || 0) + 1
                            }
                            else if (e.status === "IN_PROGRESS") inProgress++
                            else if (e.status === "FAILED") failed++
                            if (e.score !== null) {
                                totalScore += e.score
                                scoreCount++
                            }
                        }
                    }

                    return {
                        siteId: site.id,
                        siteName: site.name,
                        clientName: site.clientName,
                        employeeCount: uniqueEmployees.length,
                        totalEnrollments: totalEnrolled,
                        completed,
                        inProgress,
                        failed,
                        completionRate: totalEnrolled > 0 ? Math.round((completed / totalEnrolled) * 100) : 0,
                        avgScore: scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0,
                        topCourses: Object.entries(courseCompletions).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([title, count]) => ({ title, count })),
                    }
                })

                return NextResponse.json(siteStats)
            }

            default:
                return new NextResponse("Invalid report type", { status: 400 })
        }
    } catch (error) {
        console.error("[LMS_REPORTS_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
