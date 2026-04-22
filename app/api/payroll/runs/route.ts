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
        const year = searchParams.get("year")

        const where: Record<string, unknown> = {}
        if (year) where.year = parseInt(year)

        const runs = await prisma.payrollRun.findMany({
            where,
            orderBy: [{ year: "desc" }, { month: "desc" }],
            include: {
                _count: { select: { payrolls: true } },
            },
        })

        return NextResponse.json(runs)
    } catch (error) {
        console.error("[PAYROLL_RUNS_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
