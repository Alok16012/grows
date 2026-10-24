
import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma, { ensureProjectSchema } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { resolveUserId } from "@/lib/resolveUserId"
import { unassignableUserWhere, UNASSIGNABLE_USER_SELECT, unassignableMessage } from "@/lib/employee-filter"

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

        // PUT is a partial update (report-config sends only reportConfig), so the
        // checks below run on the merged result, not the bare body.
        const existing = await prisma.project.findUnique({
            where: { id: projectId },
            select: {
                status: true, projectType: true, priority: true, startDate: true, endDate: true,
                _count: { select: { projectManagers: true, projectInspectors: true } },
            },
        })
        if (!existing) return new NextResponse("Not Found", { status: 404 })

        const updateData: any = {}
        if (name !== undefined) {
            if (!name) return new NextResponse("Name is required", { status: 400 })
            updateData.name = name
        }
        if (description !== undefined) updateData.description = description
        if (reportConfig !== undefined) updateData.reportConfig = reportConfig
        if (projectType !== undefined) updateData.projectType = projectType || null
        if (priority !== undefined) updateData.priority = priority || null
        const VALID_STATUSES = ["DRAFT", "PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"]
        if (status !== undefined && VALID_STATUSES.includes(status)) updateData.status = status
        if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null
        if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null
        for (const k of ["startDate", "endDate"] as const) {
            if (updateData[k] instanceof Date && isNaN(updateData[k].getTime())) {
                return new NextResponse(`${k === "startDate" ? "Estimated Start Date" : "Target End Date"} is not a valid date`, { status: 400 })
            }
        }

        const nextStatus: string = updateData.status ?? existing.status
        const nextStart: Date | null = startDate !== undefined ? updateData.startDate : existing.startDate
        const nextEnd: Date | null = endDate !== undefined ? updateData.endDate : existing.endDate
        if (nextStart && nextEnd && nextEnd < nextStart) {
            return new NextResponse("Target End Date must be on or after Estimated Start Date", { status: 400 })
        }

        // Once a project is real it may have assignments; hiding it again as a
        // draft would orphan them in the wizard.
        if (existing.status !== "DRAFT" && nextStatus === "DRAFT") {
            return new NextResponse("A project cannot be moved back to Draft", { status: 400 })
        }

        // Promoting a draft is the real "Create Project" — same rules as POST.
        if (existing.status === "DRAFT" && nextStatus !== "DRAFT") {
            const nextType = projectType !== undefined ? updateData.projectType : existing.projectType
            const nextPriority = priority !== undefined ? updateData.priority : existing.priority
            const mgrCount = Array.isArray(managerIds) ? managerIds.length : existing._count.projectManagers
            const insCount = Array.isArray(inspectorIds) ? inspectorIds.length : existing._count.projectInspectors
            const problems: string[] = []
            const missing: string[] = []
            if (!nextType) missing.push("Project Type")
            if (!nextStart) missing.push("Estimated Start Date")
            if (!nextEnd) missing.push("Target End Date")
            if (!nextPriority) missing.push("Priority")
            if (missing.length) problems.push(`Missing required fields: ${missing.join(", ")}`)
            if (mgrCount === 0) problems.push("At least one Manager is required")
            if (insCount === 0) problems.push("At least one Inspector is required")
            if (problems.length) return new NextResponse(problems.join(". "), { status: 400 })
        }

        if (siteId !== undefined && siteId) {
            const site = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true } })
            if (!site) return new NextResponse("Site not found", { status: 400 })
            updateData.siteId = siteId
        }

        // A resigned / terminated / inactive employee must not be newly picked as
        // a Manager or Inspector. Only additions are checked — someone already on
        // the team who has since left stays until they are unticked.
        const newPicks = new Set<string>()
        if (Array.isArray(managerIds) && managerIds.length) {
            const current = await prisma.projectManager.findMany({ where: { projectId }, select: { managerId: true } })
            const have = new Set(current.map((m) => m.managerId))
            for (const id of managerIds as string[]) if (!have.has(id)) newPicks.add(id)
        }
        if (Array.isArray(inspectorIds) && inspectorIds.length) {
            const current = await prisma.projectInspector.findMany({ where: { projectId }, select: { inspectorId: true } })
            const have = new Set(current.map((pi) => pi.inspectorId))
            for (const id of inspectorIds as string[]) if (!have.has(id)) newPicks.add(id)
        }
        if (newPicks.size > 0) {
            const blocked = await prisma.user.findFirst({ where: unassignableUserWhere([...newPicks]), select: UNASSIGNABLE_USER_SELECT })
            if (blocked) return new NextResponse(unassignableMessage(blocked), { status: 400 })
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
            } catch {
                // Non-fatal: the project update itself already succeeded.
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
            } catch {
                // Non-fatal: the project update itself already succeeded.
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
