import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

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
