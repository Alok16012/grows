
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { checkAccess } from "@/lib/permissions"

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    const session = await getServerSession(authOptions)

    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const assignment = await prisma.assignment.findUnique({
            where: { id: params.id },
            include: {
                project: {
                    include: {
                        site: { select: { id: true, name: true } },
                        projectManagers: {
                            include: { manager: { select: { id: true, name: true, email: true } } }
                        }
                    }
                },
                inspectionBoy: { select: { id: true, name: true, email: true } },
                assigner: { select: { name: true } }
            }
        })

        if (!assignment) {
            return NextResponse.json({ error: "Assignment not found" }, { status: 404 })
        }

        // Access control: the assigned inspector, or someone who manages
        // assignments, may see it.
        //
        // Keying this on the INSPECTION_BOY base role missed custom-role
        // inspectors entirely — assigning a custom role sets the system role to
        // MANAGER — so they could open any colleague's assignment by URL.
        const perms = (session.user as any).permissions ?? []
        const isOwner = assignment.inspectionBoyId === session.user.id
        const canSeeAnyAssignment =
            session.user.role === Role.ADMIN ||
            perms.includes("assignments.manage")
        if (!isOwner && !canSeeAnyAssignment) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }

        const result = {
            ...assignment,
            project: {
                id: assignment.project.id,
                name: assignment.project.name,
                site: (assignment.project as any).site ?? null,
                projectId: assignment.project.id, // For compatibility
                managers: assignment.project.projectManagers.map(pm => pm.manager)
            }
        }

        return NextResponse.json(result)
    } catch (error) {
        console.error("GET_ASSIGNMENT_ERROR", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } }
) {
    const session = await getServerSession(authOptions)

    if (!checkAccess(session, ["MANAGER"], "assignments.manage")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await req.json()
        const { status, recurrenceActive, isMultiPart } = body

        if (!status && recurrenceActive === undefined && isMultiPart === undefined) {
            return NextResponse.json({ error: "Missing fields" }, { status: 400 })
        }

        const updateData: any = {}
        // `status: "completed"` is how a manager closes a multi-part assignment
        // once every visit is done — approving a part no longer does it.
        if (status) updateData.status = status
        if (recurrenceActive !== undefined) updateData.recurrenceActive = recurrenceActive
        if (isMultiPart !== undefined) updateData.isMultiPart = !!isMultiPart

        const assignment = await prisma.assignment.update({
            where: { id: params.id },
            data: updateData
        })

        return NextResponse.json(assignment)
    } catch (error) {
        console.error("PATCH_ASSIGNMENT_ERROR", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } }
) {
    const session = await getServerSession(authOptions)

    if (!checkAccess(session, ["MANAGER"], "assignments.manage")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const assignmentId = params.id;

        // Manual cascaded deletion for inspections and their data
        const inspections = await prisma.inspection.findMany({
            where: { assignmentId }
        });

        for (const inspection of inspections) {
            await prisma.inspectionData.deleteMany({
                where: { inspectionId: inspection.id }
            });
        }

        await prisma.inspection.deleteMany({
            where: { assignmentId }
        });

        // Finally delete the assignment
        const assignment = await prisma.assignment.delete({
            where: {
                id: assignmentId
            }
        })

        return NextResponse.json(assignment)
    } catch (error) {
        console.error("DELETE_ASSIGNMENT_ERROR", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}
