import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        // Only ADMIN / MANAGER / HR_MANAGER can lock payroll — locking is destructive
        // (no edits possible after) so it shouldn't be available to any signed-in user.
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "payroll.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { month, year, siteIds, payrollIds } = body

        if (!month || !year) return new NextResponse("Month and Year required", { status: 400 })

        // Lock specific payroll records by ID (from wage sheet selection)
        const where = payrollIds?.length
            ? { id: { in: payrollIds as string[] }, status: "DRAFT" as const }
            : {
                month,
                year,
                status: "DRAFT" as const,
                ...(siteIds?.length ? { siteId: { in: siteIds } } : {})
            }

        // Wrap both updates in a transaction so we never end up with payrolls
        // locked but the run still DRAFT (or vice-versa) on a partial failure.
        const [updated] = await prisma.$transaction([
            prisma.payroll.updateMany({
                where,
                data: {
                    status: "PROCESSED",
                    processedAt: new Date(),
                    processedBy: session.user.id ?? "system"
                }
            }),
            prisma.payrollRun.updateMany({
                where: { month, year, status: "DRAFT" },
                data: {
                    status: "PROCESSED",
                    lockedAt: new Date()
                }
            }),
        ])

        return NextResponse.json({
            success: true,
            message: `Locked ${updated.count} payroll records.`,
            count: updated.count
        })
    } catch (error) {
        console.error("[PAYROLL_FINAL_LOCK]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
