import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "performance.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const role = searchParams.get("role")

        const templates = await prisma.kPITemplate.findMany({
            where: role ? { role } : undefined,
            orderBy: [{ role: "asc" }, { kraTitle: "asc" }, { weightage: "desc" }],
        })

        return NextResponse.json(templates)
    } catch (error) {
        console.error("[TEMPLATES_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
