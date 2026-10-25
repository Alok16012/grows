import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { auditLater, requestMeta } from "@/lib/access"

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        // Only ADMIN / MANAGER / HR_MANAGER can lock payroll — locking is destructive
        // (no edits possible after) so it shouldn't be available to any signed-in user.
        if (!checkAccess(session, [], "payroll.lock")) {
            return new NextResponse("Forbidden — missing payroll.lock", { status: 403 })
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
        const { updated, runLocked } = await prisma.$transaction(async tx => {
            const updated = await tx.payroll.updateMany({
                where,
                data: {
                    status: "PROCESSED",
                    processedAt: new Date(),
                    processedBy: session.user.id ?? "system"
                }
            })

            // The run is month-wide but locking is done site by site. Flip it
            // to PROCESSED only once every row for the month is locked —
            // otherwise a partial lock reported the whole month as closed.
            const draftLeft = await tx.payroll.count({ where: { month, year, status: "DRAFT" } })
            if (draftLeft > 0) return { updated, runLocked: false }

            await tx.payrollRun.updateMany({
                where: { month, year, status: "DRAFT" },
                data: {
                    status: "PROCESSED",
                    lockedAt: new Date()
                }
            })
            return { updated, runLocked: true }
        })

        if (updated.count > 0) {
            const sites = await prisma.payroll.findMany({ where: { month, year, status: "PROCESSED", processedBy: session.user.id }, distinct: ["siteId"], select: { siteId: true } })
            auditLater({
                actorId: session.user.id, actorName: session.user.name ?? null, action: "payroll.lock", targetType: "Payroll",
                targetId: `${year}-${String(month).padStart(2, "0")}`, targetName: monthName(month, year),
                summary: `${monthName(month, year)} locked · ${updated.count} rows${siteIds?.length ? ` · ${siteIds.length} sites` : ` · ${sites.length} sites`}${runLocked ? " · month closed" : ""}`,
                after: { month, year, rows: updated.count, sites: siteIds?.length ?? sites.length, runLocked }, ...requestMeta(req),
            })
        }
        return NextResponse.json({
            success: true,
            message: `Locked ${updated.count} payroll records.`,
            count: updated.count,
            runLocked,
        })
    } catch (error) {
        console.error("[PAYROLL_FINAL_LOCK]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

function monthName(month: number, year: number) {
    return `${new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-IN", { month: "long", timeZone: "UTC" })} ${year}`
}
