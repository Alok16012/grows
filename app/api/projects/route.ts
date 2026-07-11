
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

        // Auto-include this new project in any "Whole Site" assignment: create
        // an Assignment for every inspector who was granted access to the Site.
        try {
            const siteAssignments = await prisma.siteAssignment.findMany({
                where: { companyId, status: "active" },
                select: { inspectionBoyId: true, assignedBy: true, recurrenceType: true },
            })
            for (const sa of siteAssignments) {
                await prisma.assignment.create({
                    data: {
                        projectId: project.id,
                        inspectionBoyId: sa.inspectionBoyId,
                        assignedBy: sa.assignedBy,
                        status: "active",
                        recurrenceType: sa.recurrenceType,
                        recurrenceActive: sa.recurrenceType !== "none",
                    },
                })
            }
        } catch (autoErr) {
            console.log("Whole-site auto-assign skipped:", autoErr)
        }

        return NextResponse.json(project)
    } catch (error) {
        console.error("[PROJECTS_POST]", error)
        return NextResponse.json({
            error: "Database Connection Error",
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 })
    }
}
