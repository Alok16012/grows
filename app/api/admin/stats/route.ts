import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { startOfMonth, endOfMonth } from "date-fns"

export const dynamic = "force-dynamic"

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== Role.ADMIN) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const now = new Date()
        const monthStart = startOfMonth(now)
        const monthEnd = endOfMonth(now)
        const monthRange = { gte: monthStart, lte: monthEnd }

        // All queries run in parallel. We use `count()` instead of `findMany`
        // + JS filtering — DB does aggregation 10-100x faster.
        const [
            totalCompanies,
            totalProjects,
            pendingApprovals,
            totalUsers,
            recentInspections,
            approvedThisMonth,
            rejectedThisMonth,
            totalThisMonth,
        ] = await Promise.all([
            prisma.company.count(),
            prisma.project.count(),
            prisma.inspection.count({ where: { status: "pending" } }),
            prisma.user.count(),
            prisma.inspection.findMany({
                take: 5,
                orderBy: { submittedAt: "desc" },
                where: { status: { not: "draft" } },
                select: {
                    id: true,
                    status: true,
                    submittedAt: true,
                    assignment: { select: { project: { select: { name: true } } } },
                    submitter: { select: { name: true } },
                },
            }),
            prisma.inspection.count({ where: { status: "approved", submittedAt: monthRange } }),
            prisma.inspection.count({ where: { status: "rejected", submittedAt: monthRange } }),
            prisma.inspection.count({ where: { submittedAt: monthRange } }),
        ])

        const approvalRate = totalThisMonth > 0
            ? Math.round((approvedThisMonth / totalThisMonth) * 100)
            : 0

        return NextResponse.json({
            totalCompanies,
            totalProjects,
            pendingApprovals,
            totalUsers,
            recentInspections: recentInspections.map(i => ({
                id: i.id,
                projectName: i.assignment.project.name,
                inspectorName: i.submitter.name,
                submittedAt: i.submittedAt,
                status: i.status,
            })),
            thisMonth: {
                totalInspections: totalThisMonth,
                approved: approvedThisMonth,
                rejected: rejectedThisMonth,
                approvalRate,
            },
        }, {
            headers: {
                "Cache-Control": "private, s-maxage=30, stale-while-revalidate=60",
            },
        })
    } catch (error) {
        console.error("ADMIN_STATS_ERROR", error)
        return NextResponse.json({ error: "Failed to load stats" }, { status: 500 })
    }
}
