import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { parseTargetHint, withDirection } from "@/lib/performance-score"

export async function PUT(
    req: Request,
    { params }: { params: { id: string; kpiId: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "performance.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { actual, rating, remarks, title, target, weightage, direction } = body

        const num = (v: unknown) => (v === "" || v === null ? null : Number.isFinite(Number(v)) ? Number(v) : undefined)
        const updateData: Record<string, unknown> = {}
        if (actual !== undefined) { const n = num(actual); if (n === undefined) return new NextResponse("Actual must be a number", { status: 400 }); updateData.actual = n }
        if (rating !== undefined) updateData.rating = rating ? Math.max(1, Math.min(5, Math.round(Number(rating)))) : null
        if (remarks !== undefined) updateData.remarks = remarks
        if (title !== undefined) updateData.title = title
        if (target !== undefined) updateData.target = parseTargetHint(String(target)).value
        if (weightage !== undefined) updateData.weightage = Math.max(0, Number(weightage) || 0)

        // The KPI must belong to the review in the URL.
        const existing = await prisma.kPI.findFirst({
            where: { id: params.kpiId, reviewId: params.id },
            select: { id: true, description: true },
        })
        if (!existing) return new NextResponse("KPI not found", { status: 404 })
        if (direction === "lower" || direction === "higher") updateData.description = withDirection(existing.description, direction)

        const kpi = await prisma.kPI.update({
            where: { id: params.kpiId },
            data: updateData,
        })

        return NextResponse.json(kpi)
    } catch (error) {
        console.error("[KPI_PUT]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string; kpiId: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "performance.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        // Scoped to the review in the URL, like the update above.
        const gone = await prisma.kPI.deleteMany({ where: { id: params.kpiId, reviewId: params.id } })
        if (!gone.count) return new NextResponse("KPI not found", { status: 404 })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[KPI_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
