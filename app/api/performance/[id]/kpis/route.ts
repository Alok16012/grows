import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { parseTargetHint, withDirection, kpiDirection } from "@/lib/performance-score"

export async function POST(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "performance.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const review = await prisma.performanceReview.findUnique({
            where: { id: params.id },
            select: { id: true },
        })
        if (!review) return new NextResponse("Review not found", { status: 404 })

        const body = await req.json()
        const { title, description, target, weightage, kraId, direction } = body

        if (!title || target === undefined || target === "") {
            return new NextResponse("title and target are required", { status: 400 })
        }
        // A KPI added under a KRA has to land in that KRA — kraId used to be
        // dropped, so every KPI added from a KRA showed up as "ungrouped".
        if (kraId) {
            const kra = await prisma.kRA.findFirst({ where: { id: kraId, reviewId: params.id }, select: { id: true } })
            if (!kra) return new NextResponse("KRA not found on this review", { status: 400 })
        }
        // Target is a number column; "≥ 10/day" style input is parsed, and a
        // "<" / ">" in it sets the direction when none is given.
        const hint = parseTargetHint(String(target))

        const kpi = await prisma.kPI.create({
            data: {
                reviewId: params.id,
                kraId: kraId || null,
                title,
                description: withDirection(description, direction === "lower" || direction === "higher" ? direction : hint.dir ?? kpiDirection({ title })),
                target: hint.value,
                weightage: Number(weightage) || 10,
            },
        })

        return NextResponse.json(kpi)
    } catch (error) {
        console.error("[KPI_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
