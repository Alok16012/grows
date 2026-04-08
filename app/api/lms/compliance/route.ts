import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const clientId = searchParams.get("clientId")
        const siteId = searchParams.get("siteId")
        const branchId = searchParams.get("branchId")
        const includeExpired = searchParams.get("includeExpired") === "true"

        const now = new Date()

        const mandatoryCourses = await prisma.course.findMany({
            where: { isMandatory: true, status: "PUBLISHED" },
            select: { id: true, title: true, courseCode: true, validityDays: true },
        })

        if (mandatoryCourses.length === 0) {
            return NextResponse.json({ compliance: [], summary: { compliant: 0, nonCompliant: 0, expired: 0, total: 0 } })
        }

        const employeeWhere: Record<string, unknown> = { status: "ACTIVE" }
        if (branchId) employeeWhere.branchId = branchId
        if (siteId) {
            employeeWhere.deployments = {
                some: { siteId, isActive: true }
            }
        }
        if (clientId) {
            employeeWhere.deployments = {
                some: { site: { clientId }, isActive: true }
            }
        }

        const employees = await prisma.employee.findMany({
            where: employeeWhere,
            select: {
                id: true,
                firstName: true,
                lastName: true,
                employeeId: true,
                designation: true,
                branch: { select: { name: true } },
                deployments: {
                    where: { isActive: true },
                    include: {
                        site: { select: { id: true, name: true, clientName: true } },
                    },
                },
                enrollments: {
                    where: {
                        courseId: { in: mandatoryCourses.map(c => c.id) },
                    },
                    include: {
                        course: { select: { title: true, validityDays: true } },
                    },
                },
            },
        })

        const compliance = employees.map(emp => {
            const complianceStatus: { courseId: string; courseTitle: string; status: string; completedAt?: string; expiresAt?: string; daysLeft?: number }[] = []

            for (const course of mandatoryCourses) {
                const enrollment = emp.enrollments.find(e => e.courseId === course.id)

                if (!enrollment) {
                    complianceStatus.push({
                        courseId: course.id,
                        courseTitle: course.title,
                        status: "NOT_ENROLLED",
                    })
                } else if (enrollment.status !== "COMPLETED") {
                    complianceStatus.push({
                        courseId: course.id,
                        courseTitle: course.title,
                        status: enrollment.status,
                    })
                } else if (course.validityDays && enrollment.completedAt) {
                    const expiryDate = new Date(enrollment.completedAt.getTime() + course.validityDays * 24 * 60 * 60 * 1000)
                    const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))

                    if (daysLeft < 0 && !includeExpired) {
                        continue
                    }

                    complianceStatus.push({
                        courseId: course.id,
                        courseTitle: course.title,
                        status: daysLeft < 0 ? "EXPIRED" : daysLeft <= 30 ? "EXPIRING_SOON" : "VALID",
                        completedAt: enrollment.completedAt.toISOString(),
                        expiresAt: expiryDate.toISOString(),
                        daysLeft,
                    })
                } else {
                    complianceStatus.push({
                        courseId: course.id,
                        courseTitle: course.title,
                        status: "VALID",
                        completedAt: enrollment.completedAt?.toISOString(),
                    })
                }
            }

            const isCompliant = complianceStatus.every(c => c.status === "VALID" || c.status === "EXPIRING_SOON")
            const hasExpired = complianceStatus.some(c => c.status === "EXPIRED")

            return {
                employeeId: emp.id,
                employeeName: `${emp.firstName} ${emp.lastName}`,
                employeeCode: emp.employeeId,
                designation: emp.designation || "N/A",
                branch: emp.branch?.name || "N/A",
                sites: emp.deployments.map(d => ({ id: d.site.id, name: d.site.name, client: d.site.clientName })),
                mandatoryCourses: complianceStatus.length,
                compliantCourses: complianceStatus.filter(c => c.status === "VALID" || c.status === "EXPIRING_SOON" || c.status === "COMPLETED").length,
                complianceDetails: complianceStatus,
                status: hasExpired ? "NON_COMPLIANT" : isCompliant ? "COMPLIANT" : "PARTIAL",
            }
        })

        const summary = {
            total: compliance.length,
            compliant: compliance.filter(c => c.status === "COMPLIANT").length,
            nonCompliant: compliance.filter(c => c.status === "NON_COMPLIANT").length,
            partial: compliance.filter(c => c.status === "PARTIAL").length,
            complianceRate: compliance.length > 0 ? Math.round((compliance.filter(c => c.status === "COMPLIANT").length / compliance.length) * 100) : 0,
        }

        return NextResponse.json({ compliance, summary, mandatoryCourses })
    } catch (error) {
        console.error("[LMS_COMPLIANCE_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
