import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

// DELETE /api/payroll/reset?month=4&year=2026&siteId=xxx&action=delete|unlock
export async function DELETE(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const role = session.user.role
        if (role !== "ADMIN" && role !== "MANAGER" && role !== "HR_MANAGER") {
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

        if (action === "unlock") {
            // Just reset the run status to DRAFT — keep all payroll records
            await prisma.payrollRun.update({
                where: { id: run.id },
                data: { status: "DRAFT" },
            })
            return NextResponse.json({ success: true, action: "unlocked" })
        }

        // action === "delete" — remove payroll records for this site (or all if no siteId)
        const where = siteId
            ? { payrollRunId: run.id, siteId }
            : { payrollRunId: run.id }

        await prisma.payroll.deleteMany({ where })

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

        return NextResponse.json({ success: true, action: "deleted", remaining })
    } catch (error) {
        console.error("[PAYROLL_RESET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
