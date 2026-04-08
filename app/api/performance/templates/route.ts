import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

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
