
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { canAccessInspection } from "@/lib/permissions"

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const assignmentId = searchParams.get("assignmentId")

    if (!assignmentId) {
        // Support ?recent=N for inspectors to fetch their recent submissions
        const recent = searchParams.get("recent")
        // Self-scoped by `submittedBy` below, so the gate is simply "does this
        // user do inspection work" — a permission question, not a base-role one.
        if (recent && canAccessInspection(session)) {
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

        // Filling in an inspection is the assigned inspector's job, so ownership is
        // the gate — only they, or an ADMIN, may open one against an assignment.
        //
        // This used to also let anyone holding `assignments.view` through. That is
        // a READ permission, and inspector roles carry it so they can see the
        // module, so in practice any inspector could start and submit an
        // inspection against work assigned to a colleague.
        if (
            assignment.inspectionBoyId !== session.user.id &&
            session.user.role !== Role.ADMIN
        ) {
            return NextResponse.json({ error: "This assignment belongs to another inspector" }, { status: 403 })
        }

        // A multi-part assignment holds several inspections, so this has to be
        // the CURRENT one — without an order, Postgres was free to hand back an
        // older part and the inspector would reopen work they had already filed.
        const inspection = await prisma.inspection.findFirst({
            where: { assignmentId },
            orderBy: { createdAt: "desc" },
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

    if (!canAccessInspection(session)) {
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

        const latest = await prisma.inspection.findFirst({
            where: { assignmentId },
            orderBy: { createdAt: "desc" },
        })

        // A part still being worked on is always resumed, never duplicated —
        // including one a colleague started, which is why this doesn't filter on
        // submittedBy. A rejected part is also resumed: it was sent back for
        // correction, so it has to be fixed rather than replaced by a new one.
        const latestIsFinished = !!latest && latest.status !== "draft" && latest.status !== "rejected"

        // On a multi-part assignment, asking for an inspection once the previous
        // part is filed starts the NEXT part. Single-visit assignments keep
        // returning their one and only inspection, exactly as before.
        const startNewPart = latestIsFinished && assignment.isMultiPart

        if (latest && !startNewPart) {
            return NextResponse.json(latest)
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
