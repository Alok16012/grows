import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

// DELETE /api/payroll/reset?month=4&year=2026&siteId=xxx&action=delete|unlock
export async function DELETE(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "payroll.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const month  = parseInt(searchParams.get("month")  ?? "")
        const year   = parseInt(searchParams.get("year")   ?? "")
        const siteId = searchParams.get("siteId") ?? null
        const action = searchParams.get("action") ?? "delete" // "delete" | "unlock"

        if (!month || !year) return new NextResponse("month and year required", { status: 400 })

        const run = await prisma.payrollRun.findUnique({ where: { month_year: { month, year } } })
        if (!run) return new NextResponse("Payroll run not found", { status: 404 })

        const scope = siteId
            ? { payrollRunId: run.id, siteId }
            : { payrollRunId: run.id }

        if (action === "unlock") {
            // Rows must go back to DRAFT too, not just the run — calculate
            // refuses locked rows, so a run-only unlock left the month stuck.
            // PAID rows stay PAID: money has left the account.
            const [unlocked] = await prisma.$transaction([
                prisma.payroll.updateMany({
                    where: { ...scope, status: "PROCESSED" },
                    data: { status: "DRAFT", processedAt: null, processedBy: null },
                }),
                prisma.payrollRun.update({
                    where: { id: run.id },
                    data: { status: "DRAFT", lockedAt: null },
                }),
            ])
            return NextResponse.json({ success: true, action: "unlocked", unlocked: unlocked.count })
        }

        // action === "delete" — remove DRAFT payroll records for this site (or all
        // if no siteId). Locked rows (PROCESSED/PAID) are what challans were filed
        // against, so they are never deleted here — unlock first.
        const skippedLocked = await prisma.payroll.count({
            where: { ...scope, status: { not: "DRAFT" } },
        })
        const deleted = await prisma.payroll.deleteMany({ where: { ...scope, status: "DRAFT" } })

        if (deleted.count === 0 && skippedLocked > 0) {
            return new NextResponse(
                `${skippedLocked} locked payroll(s) were left untouched — unlock them first`,
                { status: 409 }
            )
        }

        // If no payroll records remain, delete the run entirely
        const remaining = await prisma.payroll.count({ where: { payrollRunId: run.id } })
        if (remaining === 0) {
            await prisma.payrollRun.delete({ where: { id: run.id } })
        } else {
            // Reset run to DRAFT so it can be reprocessed
            await prisma.payrollRun.update({
                where: { id: run.id },
                data: { status: "DRAFT" },
            })
        }

        return NextResponse.json({
            success: true,
            action: "deleted",
            deleted: deleted.count,
            skippedLocked,
            remaining,
        })
    } catch (error) {
        console.error("[PAYROLL_RESET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
