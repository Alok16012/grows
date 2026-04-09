
import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { resolveUserId } from "@/lib/resolveUserId"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const { searchParams } = new URL(req.url)
        const companyId = searchParams.get("companyId")

        const projects = await prisma.project.findMany({
            where: companyId ? { companyId } : {},
            include: {
                company: true
            },
            orderBy: {
                createdAt: "desc",
            },
        })

        return NextResponse.json(projects)
    } catch (error) {
        console.error("[PROJECTS_GET]", error)
        return NextResponse.json({
            error: "Database Connection Error",
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        // Resolve real DB user ID
        const actorId = await resolveUserId(session)
        if (!actorId) return NextResponse.json({ error: "User not found. Please log in again." }, { status: 403 })

        // Role check
        if (session.user.role === "CLIENT") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { name, description, companyId } = body

        if (!name || !companyId) {
            return new NextResponse("Name and Company ID are required", { status: 400 })
        }

        const project = await prisma.project.create({
            data: {
                name,
                description,
                companyId,
                createdBy: actorId!,
            },
        })

        return NextResponse.json(project)
    } catch (error) {
        console.error("[PROJECTS_POST]", error)
        return NextResponse.json({
            error: "Database Connection Error",
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 })
    }
}
