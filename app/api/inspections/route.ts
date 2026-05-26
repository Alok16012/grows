
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { checkAccess } from "@/lib/permissions"

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const assignmentId = searchParams.get("assignmentId")

    if (!assignmentId) {
        // Support ?recent=N for inspectors to fetch their recent submissions
        const recent = searchParams.get("recent")
        if (recent && (session.user.role === Role.INSPECTION_BOY || session.user.role.toString() === "INSPECTION_BOY")) {
            const limit = Math.min(20, Math.max(1, parseInt(recent) || 5))
            const recentInspections = await prisma.inspection.findMany({
                where: { submittedBy: session.user.id },
                take: limit,
                orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
                select: {
                    id: true,
                    status: true,
                    submittedAt: true,
                    createdAt: true,
                    assignmentId: true,
                    assignment: {
                        select: {
                            project: { select: { name: true } }
                        }
                    }
                }
            })
            return NextResponse.json(recentInspections)
        }
        return NextResponse.json({ error: "Missing assignmentId" }, { status: 400 })
    }

    try {
        const assignment = await prisma.assignment.findUnique({
            where: { id: assignmentId },
            include: { project: true }
        })

        if (!assignment) {
            return NextResponse.json({ error: "Assignment not found" }, { status: 404 })
        }

        // Access check: Inspector assigned or ADMIN/MANAGER (or custom role with permission)
        if (
            !checkAccess(session, ["MANAGER"], "assignments.view") &&
            assignment.inspectionBoyId !== session.user.id
        ) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }

        const inspection = await prisma.inspection.findFirst({
            where: { assignmentId },
            include: {
                responses: true
            }
        })

        return NextResponse.json(inspection || null)
    } catch (error) {
        console.error("GET_INSPECTION_ERROR", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (session.user.role !== Role.INSPECTION_BOY) {
        return NextResponse.json({ error: "Only inspectors can create inspections" }, { status: 403 })
    }

    try {
        const { assignmentId } = await req.json()

        if (!assignmentId) {
            return NextResponse.json({ error: "Missing assignmentId" }, { status: 400 })
        }

        const assignment = await prisma.assignment.findUnique({
            where: { id: assignmentId }
        })

        if (!assignment || assignment.inspectionBoyId !== session.user.id) {
            return NextResponse.json({ error: "Invalid assignment" }, { status: 400 })
        }

        // Check if exists
        const existing = await prisma.inspection.findFirst({
            where: { assignmentId }
        })

        if (existing) {
            return NextResponse.json(existing)
        }

        const inspection = await prisma.inspection.create({
            data: {
                assignmentId,
                submittedBy: session.user.id,
                status: "draft"
            }
        })

        return NextResponse.json(inspection)
    } catch (error) {
        console.error("POST_INSPECTION_ERROR", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}
