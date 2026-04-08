import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const { searchParams } = new URL(req.url)
        const cycle = searchParams.get("cycle") || undefined

        const whereBase = cycle ? { cycle: cycle as never } : {}

        // Total, pending, completed counts
        const [total, pending, completed, allRated] = await Promise.all([
            prisma.performanceReview.count({ where: whereBase }),
            prisma.performanceReview.count({
                where: { ...whereBase, status: { in: ["DRAFT", "SUBMITTED"] } },
            }),
            prisma.performanceReview.count({
                where: { ...whereBase, status: "COMPLETED" },
            }),
            prisma.performanceReview.findMany({
                where: { ...whereBase, overallRating: { not: null } },
                select: { overallRating: true },
            }),
        ])

        const avgScore = allRated.length
            ? allRated.reduce((s, r) => s + (r.overallRating ?? 0), 0) / allRated.length
            : 0

        // Ranking distribution
        const rankDistribRaw = await prisma.performanceReview.groupBy({
            by: ["performanceRank"],
            where: { ...whereBase, performanceRank: { not: null } },
            _count: { performanceRank: true },
        })
        const rankDistrib: Record<string, number> = {
            TOP_PERFORMER: 0,
            HIGH_PERFORMER: 0,
            AVERAGE: 0,
            LOW_PERFORMER: 0,
        }
        for (const r of rankDistribRaw) {
            if (r.performanceRank && r.performanceRank in rankDistrib) {
                rankDistrib[r.performanceRank] = r._count.performanceRank
            }
        }

        // Top 5 performers
        const topPerformers = await prisma.performanceReview.findMany({
            where: { ...whereBase, overallRating: { not: null } },
            orderBy: { overallRating: "desc" },
            take: 5,
            select: {
                id: true,
                overallRating: true,
                performanceRank: true,
                employee: {
                    select: {
                        firstName: true,
                        lastName: true,
                        designation: true,
                        employeeId: true,
                    },
                },
            },
        })

        // Dept/role-wise avg scores
        const allReviews = await prisma.performanceReview.findMany({
            where: { ...whereBase, overallRating: { not: null } },
            select: {
                overallRating: true,
                employee: { select: { designation: true } },
            },
        })
        const roleMap: Record<string, number[]> = {}
        for (const r of allReviews) {
            const role = r.employee.designation || "Unknown"
            if (!roleMap[role]) roleMap[role] = []
            if (r.overallRating !== null) roleMap[role].push(r.overallRating)
        }
        const roleAvgScores = Object.entries(roleMap).map(([role, scores]) => ({
            role,
            avgScore: scores.reduce((a, b) => a + b, 0) / scores.length,
            count: scores.length,
        }))

        // Monthly trend: last 6 months
        const now = new Date()
        const monthlyTrend: { month: string; avgScore: number; count: number }[] = []
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
            const start = new Date(d.getFullYear(), d.getMonth(), 1)
            const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
            const monthReviews = await prisma.performanceReview.findMany({
                where: {
                    createdAt: { gte: start, lte: end },
                    overallRating: { not: null },
                },
                select: { overallRating: true },
            })
            const avg = monthReviews.length
                ? monthReviews.reduce((s, r) => s + (r.overallRating ?? 0), 0) / monthReviews.length
                : 0
            monthlyTrend.push({
                month: start.toLocaleString("default", { month: "short", year: "2-digit" }),
                avgScore: Math.round(avg * 100) / 100,
                count: monthReviews.length,
            })
        }

        return NextResponse.json({
            summary: { total, pending, completed, avgScore: Math.round(avgScore * 100) / 100 },
            rankDistrib,
            topPerformers,
            roleAvgScores,
            monthlyTrend,
        })
    } catch (error) {
        console.error("[DASHBOARD_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
