import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const body = await req.json()
        const { month, year, siteIds } = body

        if (!month || !year) return new NextResponse("Month and Year required", { status: 400 })

        // Update Payroll status for matching sites/month/year
        const updated = await prisma.payroll.updateMany({
            where: {
                month,
                year,
                status: "DRAFT",
                // If siteIds provided, filter by them
                ...(siteIds?.length ? { siteId: { in: siteIds } } : {})
            },
            data: {
                status: "PROCESSED",
                processedAt: new Date(),
                processedBy: session.user.id ?? "system"
            }
        })

        // Also update PayrollRun if it exists
        await prisma.payrollRun.updateMany({
            where: { month, year, status: "DRAFT" },
            data: { 
                status: "PROCESSED",
                lockedAt: new Date()
            }
        })

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
