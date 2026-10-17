import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "payroll.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const month = parseInt(searchParams.get("month") ?? "0")
        const year  = parseInt(searchParams.get("year")  ?? "0")

        if (!month || !year) return NextResponse.json([])

        const [records, byStatus] = await Promise.all([
            prisma.payroll.groupBy({
                by: ["siteId"],
                where: { month, year, siteId: { not: null } },
                _count: { id: true },
                _sum: { grossSalary: true, netSalary: true },
            }),
            // Per-site status split so the UI can tell a locked site from a draft one.
            prisma.payroll.groupBy({
                by: ["siteId", "status"],
                where: { month, year, siteId: { not: null } },
                _count: { id: true },
            }),
        ])
        const statusCount = (siteId: string, status: "DRAFT" | "PROCESSED" | "PAID") =>
            byStatus.find(r => r.siteId === siteId && r.status === status)?._count.id ?? 0

        // Get site names
        const siteIds = records.map(r => r.siteId).filter(Boolean) as string[]
        const sites = await prisma.site.findMany({
            where: { id: { in: siteIds } },
            select: { id: true, name: true, code: true, city: true },
        })
        const siteMap = new Map(sites.map(s => [s.id, s]))

        return NextResponse.json(
            records.map(r => ({
                siteId:         r.siteId,
                siteName:       siteMap.get(r.siteId!)?.name ?? "Unknown",
                siteCode:       siteMap.get(r.siteId!)?.code ?? "",
                siteCity:       siteMap.get(r.siteId!)?.city ?? "",
                processedCount: r._count.id,
                draft:          statusCount(r.siteId!, "DRAFT"),
                locked:         statusCount(r.siteId!, "PROCESSED"),
                paid:           statusCount(r.siteId!, "PAID"),
                totalGross:     r._sum.grossSalary ?? 0,
                totalNet:       r._sum.netSalary   ?? 0,
            }))
        )
    } catch (error) {
        console.error("[PAYROLL_SITES_STATUS]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
