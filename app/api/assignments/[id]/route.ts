
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
                        },
                        projectInspectors: {
                            include: { inspector: { select: { id: true, name: true, email: true } } }
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
                managers: assignment.project.projectManagers.map(pm => pm.manager),
                // Same shape as the list route — team membership, not who holds
                // this assignment (that is inspectionBoy).
                inspectors: assignment.project.projectInspectors.map(pi => pi.inspector),
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
        const { status, recurrenceActive, isMultiPart, inspectionBoyId, startDate, notes, recurrenceType } = body

        const editing = inspectionBoyId !== undefined || startDate !== undefined || notes !== undefined || recurrenceType !== undefined
        if (!status && recurrenceActive === undefined && isMultiPart === undefined && !editing) {
            return NextResponse.json({ error: "Missing fields" }, { status: 400 })
        }

        const updateData: any = {}
        // `status: "completed"` is how a manager closes a multi-part assignment
        // once every visit is done — approving a part no longer does it.
        if (status) updateData.status = status
        if (recurrenceActive !== undefined) updateData.recurrenceActive = recurrenceActive
        if (isMultiPart !== undefined) updateData.isMultiPart = !!isMultiPart

        // ── Edit (row menu → Edit Assignment) ────────────────────────────────
        if (editing) {
            const current = await prisma.assignment.findUnique({
                where: { id: params.id },
                select: { projectId: true, inspectionBoyId: true, _count: { select: { inspections: true } } },
            })
            if (!current) return NextResponse.json({ error: "Assignment not found" }, { status: 404 })

            if (inspectionBoyId !== undefined && inspectionBoyId !== current.inspectionBoyId) {
                if (typeof inspectionBoyId !== "string" || !inspectionBoyId) {
                    return NextResponse.json({ error: "Pick an inspector" }, { status: 400 })
                }
                // Reports already filed belong to whoever filed them; moving the
                // assignment would hand that history to someone else.
                if (current._count.inspections > 0) {
                    return NextResponse.json({ error: "This assignment already has inspections, so its inspector can't change. Create a new assignment for the other inspector instead." }, { status: 409 })
                }
                const inspector = await prisma.user.findUnique({ where: { id: inspectionBoyId }, select: { id: true } })
                if (!inspector) return NextResponse.json({ error: "Inspector not found" }, { status: 400 })
                // Same rule as create: one active assignment per project + inspector.
                const clash = await prisma.assignment.findFirst({
                    where: { projectId: current.projectId, inspectionBoyId, status: "active", id: { not: params.id } },
                    select: { code: true },
                })
                if (clash) {
                    return NextResponse.json({ error: `That inspector already has an active assignment on this project${clash.code ? ` (${clash.code})` : ""}` }, { status: 409 })
                }
                updateData.inspectionBoyId = inspectionBoyId
            }

            if (startDate !== undefined) {
                if (startDate === null || startDate === "") {
                    updateData.startDate = null
                } else {
                    const d = typeof startDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(startDate) ? new Date(startDate.slice(0, 10) + "T00:00:00Z") : null
                    if (!d || isNaN(d.getTime())) return NextResponse.json({ error: "Start date must be YYYY-MM-DD" }, { status: 400 })
                    updateData.startDate = d
                }
            }

            if (notes !== undefined) {
                updateData.notes = typeof notes === "string" && notes.trim() ? notes.trim().slice(0, 250) : null
            }

            if (recurrenceType !== undefined) {
                // Same values as create: one-time, daily or weekly.
                const recur = ["daily", "weekly"].includes(recurrenceType) ? recurrenceType : "none"
                updateData.recurrenceType = recur
                updateData.recurrenceActive = recur !== "none"
            }
        }

        const assignment = await prisma.assignment.update({
            where: { id: params.id },
            data: updateData,
            include: { inspectionBoy: { select: { id: true, name: true, email: true } } },
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
