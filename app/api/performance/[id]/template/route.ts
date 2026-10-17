import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { applyTemplate } from "@/lib/performance-server"

// POST { role } — load a role's KRA/KPI template onto a draft review.
export async function POST(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "performance.manage")) return new NextResponse("Forbidden", { status: 403 })
    const { role } = await req.json()
    const review = await prisma.performanceReview.findUnique({ where: { id: params.id }, select: { status: true } })
    if (!review) return new NextResponse("Review not found", { status: 404 })
    if (review.status !== "DRAFT") return new NextResponse("Goals can only be changed while the review is a draft", { status: 400 })
    const added = await applyTemplate(params.id, String(role || ""))
    if (!added) return new NextResponse("Nothing to add — the template is empty or its KRAs are already on this review", { status: 400 })
    return NextResponse.json({ added })
}
