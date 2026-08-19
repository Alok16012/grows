
import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma, { ensureProjectSchema } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { resolveUserId } from "@/lib/resolveUserId"

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        await ensureProjectSchema()

        const project = await prisma.project.findUnique({
            where: {
                id: params.id,
            },
            include: {
                site: { select: { id: true, name: true, code: true, city: true } },
                projectManagers: { select: { managerId: true } },
                // Membership, not work — see ProjectInspector in the schema.
                projectInspectors: { select: { inspectorId: true } },
            },
        })

        if (!project) return new NextResponse("Not Found", { status: 404 })

        // Flatten the current member selections so the edit form can prefill.
        const managerIds = project.projectManagers.map((m) => m.managerId)
        const inspectorIds = Array.from(new Set(project.projectInspectors.map((pi) => pi.inspectorId)))

        // Summary sidebar data: inspection counts + creator display name.
        const [total, approved, pending, sentBack, creator] = await Promise.all([
            prisma.inspection.count({ where: { assignment: { projectId: project.id } } }).catch(() => 0),
            prisma.inspection.count({ where: { assignment: { projectId: project.id }, status: "approved" } }).catch(() => 0),
            prisma.inspection.count({ where: { assignment: { projectId: project.id }, status: "pending" } }).catch(() => 0),
            prisma.inspection.count({ where: { assignment: { projectId: project.id }, status: "sent_back" } }).catch(() => 0),
            prisma.user.findUnique({ where: { id: project.createdBy }, select: { name: true } }).catch(() => null),
        ])

        return NextResponse.json({
            ...project,
            managerIds,
            inspectorIds,
            createdByName: creator?.name ?? null,
            inspectionStats: { total, approved, pending, sentBack },
        })
    } catch (error) {
        console.error("[PROJECT_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function PUT(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "projects.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        await ensureProjectSchema()

        const body = await req.json()
        const { name, description, reportConfig, siteId, managerIds, inspectorIds, projectType, priority, status, startDate, endDate } = body
        const projectId = params.id

        const updateData: any = {}
        if (name !== undefined) {
            if (!name) return new NextResponse("Name is required", { status: 400 })
            updateData.name = name
        }
        if (description !== undefined) updateData.description = description
        if (reportConfig !== undefined) updateData.reportConfig = reportConfig
        if (projectType !== undefined) updateData.projectType = projectType || null
        if (priority !== undefined) updateData.priority = priority || null
        if (status !== undefined) {
            const VALID_STATUSES = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"]
            if (VALID_STATUSES.includes(status)) updateData.status = status
        }
        if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null
        if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null

        if (siteId !== undefined && siteId) {
            const site = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true } })
            if (!site) return new NextResponse("Site not found", { status: 400 })
            updateData.siteId = siteId
        }

        const project = await prisma.project.update({
            where: {
                id: projectId,
            },
            data: updateData,
        })

        const actorId = await resolveUserId(session!)

        // Reconcile Managers (ProjectManager rows) to match the selection.
        if (Array.isArray(managerIds) && actorId) {
            try {
                const desired = new Set<string>(managerIds)
                const existing = await prisma.projectManager.findMany({
                    where: { projectId },
                    select: { managerId: true },
                })
                const existingSet = new Set(existing.map((e) => e.managerId))
                const toAdd = managerIds.filter((id: string) => !existingSet.has(id))
                const toRemove = [...existingSet].filter((id) => !desired.has(id))
                if (toAdd.length > 0) {
                    await prisma.projectManager.createMany({
                        data: toAdd.map((managerId: string) => ({ projectId, managerId, assignedBy: actorId })),
                        skipDuplicates: true,
                    })
                }
                if (toRemove.length > 0) {
                    await prisma.projectManager.deleteMany({
                        where: { projectId, managerId: { in: toRemove } },
                    })
                }
            } catch (mgrErr) {
                console.log("Project manager sync skipped:", mgrErr)
            }
        }

        // Reconcile the project's inspector list. Membership only: ticking
        // someone here says they are on the project, it does not hand them work,
        // and unticking them does not cancel work already issued — assignments
        // are created and withdrawn on the Assignments screen. This block used to
        // create an active Assignment per newly-ticked inspector and
        // delete/deactivate the assignments of anyone unticked, which is why
        // editing a project's team quietly issued and revoked real jobs.
        if (Array.isArray(inspectorIds) && actorId) {
            try {
                const desired = new Set<string>(inspectorIds)
                const current = await prisma.projectInspector.findMany({
                    where: { projectId },
                    select: { id: true, inspectorId: true },
                })
                const currentIds = new Set(current.map((pi) => pi.inspectorId))

                const toAdd = inspectorIds.filter((id: string) => !currentIds.has(id))
                if (toAdd.length > 0) {
                    await prisma.projectInspector.createMany({
                        data: toAdd.map((inspectorId: string) => ({ projectId, inspectorId, assignedBy: actorId })),
                        skipDuplicates: true,
                    })
                }

                const toRemove = current.filter((pi) => !desired.has(pi.inspectorId)).map((pi) => pi.id)
                if (toRemove.length > 0) {
                    await prisma.projectInspector.deleteMany({ where: { id: { in: toRemove } } })
                }
            } catch (insErr) {
                console.log("Project inspector sync skipped:", insErr)
            }
        }

        return NextResponse.json(project)
    } catch (error) {
        console.error("[PROJECT_PUT]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "projects.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const projectId = params.id;

        // Manual cascaded deletion to handle cases where DB constraints haven't been applied
        // 1. Delete InspectionData and Inspections for all assignments
        const assignments = await prisma.assignment.findMany({
            where: { projectId }
        });

        for (const assignment of assignments) {
            const inspections = await prisma.inspection.findMany({
                where: { assignmentId: assignment.id }
            });

            for (const inspection of inspections) {
                await prisma.inspectionData.deleteMany({
                    where: { inspectionId: inspection.id }
                });
            }

            await prisma.inspection.deleteMany({
                where: { assignmentId: assignment.id }
            });
        }

        // 2. Delete Assignments
        await prisma.assignment.deleteMany({
            where: { projectId }
        });

        // 3. Delete FormTemplates
        await prisma.formTemplate.deleteMany({
            where: { projectId }
        });

        // 4. Delete ProjectManagers
        await prisma.projectManager.deleteMany({
            where: { projectId }
        });

        // 5. Finally delete the Project
        const project = await prisma.project.delete({
            where: {
                id: projectId,
            },
        })

        return NextResponse.json(project)
    } catch (error) {
        console.error("[PROJECT_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
