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

        const now = new Date()
        const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

        // Overdue enrollments with details
        const overdueEnrollments = await prisma.courseEnrollment.findMany({
            where: { dueDate: { lt: now }, status: { in: ["ENROLLED", "IN_PROGRESS"] } },
            include: {
                employee: { select: { firstName: true, lastName: true, employeeId: true } },
                course: { select: { title: true } },
            },
            orderBy: { dueDate: "asc" },
            take: 30,
        })

        // Due within 7 days
        const dueSoonEnrollments = await prisma.courseEnrollment.findMany({
            where: { dueDate: { gte: now, lte: in7Days }, status: { in: ["ENROLLED", "IN_PROGRESS"] } },
            include: {
                employee: { select: { firstName: true, lastName: true, employeeId: true } },
                course: { select: { title: true } },
            },
            orderBy: { dueDate: "asc" },
            take: 30,
        })

        // Expiring certificates
        const completedWithValidity = await prisma.courseEnrollment.findMany({
            where: { status: "COMPLETED", completedAt: { not: null }, course: { validityDays: { not: null } } },
            include: {
                employee: { select: { firstName: true, lastName: true, employeeId: true } },
                course: { select: { title: true, validityDays: true } },
            },
        })

        const expiringCerts = completedWithValidity
            .map(e => {
                const expiryDate = new Date(e.completedAt!.getTime() + (e.course.validityDays ?? 0) * 24 * 60 * 60 * 1000)
                const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
                return { ...e, expiryDate, daysLeft }
            })
            .filter(e => e.daysLeft >= 0 && e.daysLeft <= 30)
            .sort((a, b) => a.daysLeft - b.daysLeft)
            .slice(0, 30)

        // Policy acknowledgment status
        const totalEmployees = await prisma.employee.count({ where: { status: "ACTIVE" } })
        const policies = await prisma.policy.findMany({
            where: { isActive: true, isRequired: true },
            include: { _count: { select: { acknowledgments: true } } },
        })

        return NextResponse.json({
            summary: {
                overdue: overdueEnrollments.length,
                dueSoon: dueSoonEnrollments.length,
                expiringCerts: expiringCerts.length,
                unacknowledgedPolicies: policies.filter(p => p._count.acknowledgments < totalEmployees).length,
            },
            overdueEnrollments: overdueEnrollments.map(e => ({
                employeeName: `${e.employee?.firstName ?? ""} ${e.employee?.lastName ?? ""}`.trim(),
                employeeCode: e.employee?.employeeId ?? "",
                courseTitle: e.course.title,
                dueDate: e.dueDate?.toISOString() ?? null,
            })),
            dueSoonEnrollments: dueSoonEnrollments.map(e => ({
                employeeName: `${e.employee?.firstName ?? ""} ${e.employee?.lastName ?? ""}`.trim(),
                employeeCode: e.employee?.employeeId ?? "",
                courseTitle: e.course.title,
                dueDate: e.dueDate?.toISOString() ?? null,
            })),
            expiringCerts: expiringCerts.map(e => ({
                employeeName: `${e.employee?.firstName ?? ""} ${e.employee?.lastName ?? ""}`.trim(),
                employeeCode: e.employee?.employeeId ?? "",
                courseTitle: e.course.title,
                daysLeft: e.daysLeft,
                expiryDate: e.expiryDate.toISOString(),
            })),
            policies: policies.map(p => ({
                id: p.id,
                title: p.title,
                category: p.category,
                acknowledged: p._count.acknowledgments,
                total: totalEmployees,
                rate: totalEmployees > 0 ? Math.round((p._count.acknowledgments / totalEmployees) * 100) : 0,
            })),
        })
    } catch (error) {
        console.error("[LMS_NOTIFICATIONS_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const now = new Date()
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

        const notifications: { userId: string; title: string; message: string; type: string; link: string }[] = []

        const overdueEnrollments = await prisma.courseEnrollment.findMany({
            where: {
                dueDate: { lt: now },
                status: { in: ["ENROLLED", "IN_PROGRESS"] },
            },
            include: {
                employee: {
                    select: { email: true, firstName: true },
                },
                course: { select: { title: true } },
            },
        })

        for (const enrollment of overdueEnrollments) {
            if (enrollment.employee?.email) {
                const user = await prisma.user.findFirst({
                    where: { email: enrollment.employee.email },
                })
                if (user) {
                    notifications.push({
                        userId: user.id,
                        title: "Training Overdue",
                        message: `Your training "${enrollment.course.title}" is overdue. Please complete it immediately.`,
                        type: "LMS_OVERDUE",
                        link: "/lms/learn",
                    })
                }
            }
        }

        const upcomingDueEnrollments = await prisma.courseEnrollment.findMany({
            where: {
                dueDate: { gte: now, lte: tomorrow },
                status: { in: ["ENROLLED", "IN_PROGRESS"] },
            },
            include: {
                employee: {
                    select: { email: true, firstName: true },
                },
                course: { select: { title: true } },
            },
        })

        for (const enrollment of upcomingDueEnrollments) {
            if (enrollment.employee?.email) {
                const user = await prisma.user.findFirst({
                    where: { email: enrollment.employee.email },
                })
                if (user) {
                    notifications.push({
                        userId: user.id,
                        title: "Training Deadline Tomorrow",
                        message: `"${enrollment.course.title}" is due tomorrow. Complete it before the deadline.`,
                        type: "LMS_DUE_SOON",
                        link: "/lms/learn",
                    })
                }
            }
        }

        const expiringCertificates = await prisma.courseEnrollment.findMany({
            where: {
                status: "COMPLETED",
                completedAt: { not: null },
                course: { validityDays: { not: null } },
            },
            include: {
                employee: {
                    select: { email: true, firstName: true },
                },
                course: { select: { title: true, validityDays: true } },
            },
        })

        for (const enrollment of expiringCertificates) {
            if (!enrollment.employee?.email || !enrollment.completedAt || !enrollment.course.validityDays) continue

            const user = await prisma.user.findFirst({
                where: { email: enrollment.employee.email },
            })
            if (!user) continue

            const expiryDate = new Date(enrollment.completedAt.getTime() + enrollment.course.validityDays * 24 * 60 * 60 * 1000)
            const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))

            if (daysLeft <= 30 && daysLeft > 0) {
                notifications.push({
                    userId: user.id,
                    title: daysLeft <= 7 ? "Certificate Expiring Soon" : "Certificate Renewal Required",
                    message: daysLeft <= 7
                        ? `Your certificate for "${enrollment.course.title}" expires in ${daysLeft} days.`
                        : `Your certificate for "${enrollment.course.title}" expires on ${expiryDate.toLocaleDateString()}. Please renew.`,
                    type: "LMS_CERT_EXPIRY",
                    link: "/lms/learn",
                })
            }
        }

        if (notifications.length === 0) {
            return NextResponse.json({ sent: 0, message: "No notifications to send" })
        }

        await prisma.notification.createMany({
            data: notifications.map(n => ({
                userId: n.userId,
                title: n.title,
                message: n.message,
                type: n.type,
                link: n.link,
            })),
        })

        return NextResponse.json({ sent: notifications.length })
    } catch (error) {
        console.error("[LMS_NOTIFICATIONS_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
