
import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
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

        const project = await prisma.project.findUnique({
            where: {
                id: params.id,
            },
            include: {
                company: true,
                site: { select: { id: true, name: true, code: true, city: true } },
                projectManagers: { select: { managerId: true } },
                assignments: { where: { status: "active" }, select: { inspectionBoyId: true } },
            },
        })

        if (!project) return new NextResponse("Not Found", { status: 404 })

        // Flatten the current member selections so the edit form can prefill.
        const managerIds = project.projectManagers.map((m) => m.managerId)
        const inspectorIds = Array.from(new Set(project.assignments.map((a) => a.inspectionBoyId)))

        return NextResponse.json({ ...project, managerIds, inspectorIds })
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

        const body = await req.json()
        const { name, description, reportConfig, siteId, managerIds, inspectorIds } = body
        const projectId = params.id

        const updateData: any = {}
        if (name !== undefined) {
            if (!name) return new NextResponse("Name is required", { status: 400 })
            updateData.name = name
        }
        if (description !== undefined) updateData.description = description
        if (reportConfig !== undefined) updateData.reportConfig = reportConfig

        // Moving the project to a different Site also re-derives the (non-null)
        // companyId from that Site's branch, matching project creation.
        if (siteId !== undefined && siteId) {
            const site = await prisma.site.findUnique({
                where: { id: siteId },
                select: { branch: { select: { companyId: true } } },
            })
            if (!site) return new NextResponse("Site not found", { status: 400 })
            updateData.siteId = siteId
            updateData.companyId = site.branch.companyId
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

        // Reconcile Inspectors (active Assignment rows). Newly selected inspectors
        // get a fresh active assignment; deselected ones are removed — but if an
        // inspector already has inspection history we deactivate instead of delete
        // so their submitted data is never lost.
        if (Array.isArray(inspectorIds) && actorId) {
            try {
                const desired = new Set<string>(inspectorIds)
                const active = await prisma.assignment.findMany({
                    where: { projectId, status: "active" },
                    select: { id: true, inspectionBoyId: true },
                })
                const activeIds = new Set(active.map((a) => a.inspectionBoyId))
                const toAdd = inspectorIds.filter((id: string) => !activeIds.has(id))
                for (const inspectionBoyId of toAdd) {
                    await prisma.assignment.create({
                        data: { projectId, inspectionBoyId, assignedBy: actorId, status: "active" },
                    })
                }
                const toRemove = active.filter((a) => !desired.has(a.inspectionBoyId))
                for (const a of toRemove) {
                    const inspCount = await prisma.inspection.count({ where: { assignmentId: a.id } })
                    if (inspCount === 0) {
                        await prisma.assignment.delete({ where: { id: a.id } })
                    } else {
                        await prisma.assignment.update({ where: { id: a.id }, data: { status: "inactive" } })
                    }
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
