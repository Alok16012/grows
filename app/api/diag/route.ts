import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

// Diagnostic endpoint — ADMIN only. Returns minimal info, no env/stack leakage.
export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== "ADMIN") {
        return new NextResponse("Forbidden", { status: 403 })
    }
    try {
        await prisma.$queryRaw`SELECT 1 as connected`
        return NextResponse.json({ status: "connected" })
    } catch {
        return NextResponse.json({ status: "error" }, { status: 500 })
    }
}
