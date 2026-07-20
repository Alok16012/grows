import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { startOfMonth, endOfMonth, subDays } from "date-fns"
import { unstable_cache } from "next/cache"
import { checkAccess } from "@/lib/permissions"

export const dynamic = "force-dynamic"

type RiskRow = {
    project_id: string
    project_name: string
    company_name: string
    total: bigint
    rejected: bigint
    avg_sent_back: number | null
}

// 30-second server cache — repeat dashboard loads served instantly.
const getStats = unstable_cache(
    async () => {
        const now = new Date()
        const monthStart = startOfMonth(now)
        const monthEnd = endOfMonth(now)
        const sevenDaysAgo = subDays(now, 7)

        const [
            pendingApprovals,
            activeAssignments,
            completedThisMonth,
            recentPending,
            recentAssignments,
            overdueInspections,
            riskRows,
        ] = await Promise.all([
            prisma.inspection.count({ where: { status: "pending" } }),
            prisma.assignment.count({ where: { status: "active" } }),
            prisma.inspection.count({ where: { status: "approved", approvedAt: { gte: monthStart, lte: monthEnd } } }),
            prisma.inspection.findMany({
                where: { status: "pending" },
                take: 5,
                orderBy: { submittedAt: "desc" },
                select: {
                    id: true,
                    submittedAt: true,
                    assignment: {
                        select: {
                            project: {
                                select: {
                                    name: true,
                                    site: { select: { name: true } },
                                },
                            },
                        },
                    },
                    submitter: { select: { name: true } },
                },
            }),
            prisma.assignment.findMany({
                take: 5,
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    status: true,
                    createdAt: true,
                    project: { select: { name: true } },
                    inspectionBoy: { select: { name: true } },
                },
            }),
            prisma.inspection.count({
                where: { status: "pending", submittedAt: { lte: sevenDaysAgo } },
            }),
            prisma.$queryRaw<RiskRow[]>`
                SELECT
                    p.id            as project_id,
                    p.name          as project_name,
                    COALESCE(s.name, 'No Site') as company_name,
                    COUNT(i.id)     as total,
                    COUNT(CASE WHEN i.status = 'rejected' THEN 1 END) as rejected,
                    AVG(COALESCE(i."sentBackCount", 0)) as avg_sent_back
                FROM "Project" p
                LEFT JOIN "Site" s ON s.id = p."siteId"
                LEFT JOIN "Assignment" a ON a."projectId" = p.id
                LEFT JOIN "Inspection" i ON i."assignmentId" = a.id
                GROUP BY p.id, p.name, s.name
                HAVING COUNT(i.id) > 0
                ORDER BY (CASE WHEN COUNT(i.id) > 0 THEN
                    COUNT(CASE WHEN i.status = 'rejected' THEN 1 END)::float / COUNT(i.id)
                ELSE 0 END) DESC
                LIMIT 10
            `,
        ])

        const riskAlerts = riskRows
            .map(r => {
                const total = Number(r.total)
                const rejected = Number(r.rejected)
                const avgSentBack = Number(r.avg_sent_back ?? 0)
                const rejectionRate = total > 0 ? (rejected / total) * 100 : 0
                return {
                    projectId: r.project_id,
                    projectName: r.project_name,
                    siteName: r.company_name,
                    total,
                    rejected,
                    rejectionRate: parseFloat(rejectionRate.toFixed(1)),
                    avgSentBack: parseFloat(avgSentBack.toFixed(1)),
                    isAtRisk: rejectionRate > 20 || avgSentBack > 1.5,
                }
            })
            .filter(p => p.isAtRisk)
            .slice(0, 5)

        return {
            pendingApprovals,
            activeAssignments,
            completedThisMonth,
            overdueInspections,
            riskAlerts,
            recentPending: recentPending.map(i => ({
                id: i.id,
                projectName: i.assignment.project.name,
                siteName: i.assignment.project.site?.name ?? "No Site",
                inspectorName: i.submitter.name,
                submittedAt: i.submittedAt,
            })),
            recentAssignments: recentAssignments.map(a => ({
                id: a.id,
                projectName: a.project.name,
                inspectorName: a.inspectionBoy.name,
                status: a.status,
                createdAt: a.createdAt,
            })),
        }
    },
    ["manager-stats"],
    { revalidate: 30, tags: ["manager-stats"] },
)

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER"], "reports.view")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    try {
        const stats = await getStats()
        return NextResponse.json(stats, {
            headers: {
                "Cache-Control": "private, max-age=15, stale-while-revalidate=60",
            },
        })
    } catch (error) {
        console.error("MANAGER_STATS_ERROR", error)
        return NextResponse.json({ error: "Failed to load stats" }, { status: 500 })
    }
}
