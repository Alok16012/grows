import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const { searchParams } = new URL(req.url)
        const month = parseInt(searchParams.get("month") ?? "0")
        const year  = parseInt(searchParams.get("year")  ?? "0")

        if (!month || !year) return NextResponse.json([])

        const records = await prisma.payroll.groupBy({
            by: ["siteId"],
            where: { month, year, siteId: { not: null } },
            _count: { id: true },
        })

        return NextResponse.json(
            records.map(r => ({ siteId: r.siteId, processedCount: r._count.id }))
        )
    } catch (error) {
        console.error("[PAYROLL_SITES_STATUS]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
