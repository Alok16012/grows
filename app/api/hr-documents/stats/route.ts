import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    try {
        const [total, draft, pendingApproval, issued] = await Promise.all([
            prisma.hrDocument.count(),
            prisma.hrDocument.count({ where: { status: "DRAFT" } }),
            prisma.hrDocument.count({ where: { status: "PENDING_APPROVAL" } }),
            prisma.hrDocument.count({ where: { status: "ISSUED" } }),
        ])
        return NextResponse.json({ total, draft, pendingApproval, issued, approved: total - draft - pendingApproval - issued })
    } catch (e) {
        console.error("[HR_DOC_STATS_GET]", e)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
