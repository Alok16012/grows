import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"

export async function POST(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const reviewId = params.id
        const review = await prisma.performanceReview.findUnique({
            where: { id: reviewId },
            include: { 
                employee: true,
                kpis: true 
            }
        })

        if (!review) return new NextResponse("Review Not Found", { status: 404 })

        const { periodStart, periodEnd, employee } = review
        const start = new Date(periodStart)
        const end = new Date(periodEnd)

        // Find the User associated with this Employee (matching email)
        const user = employee.email ? await prisma.user.findUnique({
            where: { email: employee.email }
        }) : null

        const syncResults = []

        for (const kpi of review.kpis) {
            let actualValue: number | null = null

            const title = kpi.title.toLowerCase()

            // RECRUITMENT AUTOMATION
            if (title.includes("joining") && user) {
                actualValue = await prisma.lead.count({
                    where: {
                        assignedTo: user.id,
                        status: "JOINED",
                        createdAt: { gte: start, lte: end }
                    }
                })
            }

            // INSPECTION AUTOMATION
            else if ((title.includes("inspections/day") || title.includes("no. of inspections")) && user) {
                const total = await prisma.inspection.count({
                    where: {
                        submittedBy: user.id,
                        status: "completed", // assuming "completed" as per schema logic
                        submittedAt: { gte: start, lte: end }
                    }
                })
                // If it's "per day", divide by working days (approx 26 or exact attendance)
                if (title.includes("/day")) {
                    const days = await prisma.attendance.count({
                        where: { employeeId: employee.id, status: "PRESENT", date: { gte: start, lte: end } }
                    })
                    actualValue = days > 0 ? total / days : total
                } else {
                    actualValue = total
                }
            }

            // ATTENDANCE / DISCIPLINE
            else if (title.includes("attendance") || title.includes("on-time")) {
                const present = await prisma.attendance.count({
                    where: { employeeId: employee.id, status: "PRESENT", date: { gte: start, lte: end } }
                })
                const totalDays = (end.getTime() - start.getTime()) / (1000 * 3600 * 24)
                actualValue = totalDays > 0 ? (present / totalDays) * 100 : 0
            }

            // ONBOARDING
            else if (title.includes("onboarding") && user) {
                actualValue = await prisma.onboardingRecord.count({
                    where: {
                        status: "COMPLETED",
                        completedAt: { gte: start, lte: end }
                        // Filter by HR/Recruiter if possible, e.g. via employee.createdBy or managerId
                    }
                })
            }

            if (actualValue !== null) {
                const updated = await prisma.kPI.update({
                    where: { id: kpi.id },
                    data: { actual: actualValue }
                })
                syncResults.push(updated)
            }
        }

        return NextResponse.json({ success: true, syncedCount: syncResults.length })

    } catch (error) {
        console.error("[PERFORMANCE_SYNC_ERROR]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
