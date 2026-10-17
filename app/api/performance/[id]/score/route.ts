import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { reviewScore } from "@/lib/performance-server"

// GET — the calculated KRA / KPI score, band and what's still missing.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    if (!checkAccess(session, ["MANAGER"], "performance.view")) {
        const [review, me] = await Promise.all([
            prisma.performanceReview.findUnique({ where: { id: params.id }, select: { employeeId: true } }),
            prisma.employee.findUnique({ where: { userId: session.user.id }, select: { id: true } }),
        ])
        if (!review || !me || review.employeeId !== me.id) return new NextResponse("Forbidden", { status: 403 })
    }
    return NextResponse.json(await reviewScore(params.id))
}
