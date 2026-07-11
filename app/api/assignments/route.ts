
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { checkAccess } from "@/lib/permissions"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)

    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { user } = session
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")
    const where: any = {}

    if (user.role === Role.INSPECTION_BOY || user.role.toString() === "INSPECTION_BOY") {
        where.inspectionBoyId = user.id
        // Only default to active if no status is specified
        if (!status) {
            where.status = "active"
        }
    } else if (!checkAccess(session, ["MANAGER"], "assignments.view")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (status && status !== "all" && status !== "manager_only") {
        where.status = status
    }

    try {
        if (user.role === Role.INSPECTION_BOY) {
            const assignments = await prisma.assignment.findMany({
                where,
                include: {
                    project: {
                        include: {
                            company: true,
                            projectManagers: {
                                include: { manager: { select: { id: true, name: true, email: true } } }
                            }
                        }
                    },
                    inspectionBoy: { select: { id: true, name: true, email: true } },
                    assigner: { select: { name: true } },
                    inspections: {
                        select: {
                            id: true,
                            status: true,
                            submittedAt: true,
                            assignmentId: true,
                        },
                        orderBy: { createdAt: "desc" },
                        take: 1
                    }
                },
                orderBy: { createdAt: "desc" }
            });

            const result = assignments.map(({ inspections, project, ...a }) => ({
                ...a,
                inspection: inspections?.[0] || null,
                project: {
                    id: project.id,
                    name: project.name,
                    company: project.company,
                    managers: project.projectManagers.map(pm => pm.manager)
                }
            }));

            return NextResponse.json(result);
        }

        // 1. Get all projects that have either an assignment OR a project manager
        const assignmentWhere = status && status !== "all" && status !== "manager_only"
            ? { some: { status } }
            : { some: {} }

        const projects = await prisma.project.findMany({
            where: {
                OR: [
                    { assignments: assignmentWhere },
                    { projectManagers: { some: {} } }
                ]
            },
            select: {
                id: true,
                name: true,
                createdAt: true,
                company: { select: { id: true, name: true } },
                assignments: {
                    where: status && status !== "all" && status !== "manager_only"
                        ? { status }
                        : undefined,
                    select: {
                        id: true,
                        projectId: true,
                        inspectionBoyId: true,
                        assignedBy: true,
                        status: true,
                        createdAt: true,
                        inspectionBoy: { select: { id: true, name: true, email: true } },
                        assigner: { select: { name: true } }
                    }
                },
                projectManagers: {
                    select: {
                        manager: { select: { id: true, name: true, email: true } }
                    }
                }
            },
            orderBy: { createdAt: "desc" }
        })

        // 2. Flatten into a list of "Display Assignments"
        const result: any[] = []

        projects.forEach(project => {
            const managers = project.projectManagers.map(pm => pm.manager)

            if (project.assignments.length > 0) {
                project.assignments.forEach(a => {
                    result.push({
                        ...a,
                        project: {
                            id: project.id,
                            name: project.name,
                            company: project.company,
                            managers
                        }
                    })
                })
            } else if (managers.length > 0 && (!status || status === "all" || status === "manager_only")) {
                // Virtual assignment for manager-only project
                result.push({
                    id: `virtual-${project.id}`,
                    projectId: project.id,
                    inspectionBoyId: null,
                    assignedBy: null,
                    status: "manager_only",
                    createdAt: project.createdAt,
                    project: {
                        id: project.id,
                        name: project.name,
                        company: project.company,
                        managers
                    },
                    inspectionBoy: { name: "Pending Inspector" },
                    assigner: { name: "System" }
                })
            }
        })

        return NextResponse.json(result)
    } catch (error: any) {
        console.error("GET_ASSIGNMENTS_ERROR", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)

    if (!checkAccess(session, ["MANAGER"], "assignments.manage")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await req.json()
        const {
            projectId,
            projectIds,
            companyId,
            wholeSite,
            inspectorIds,
            managerId,
            managerIds,
            recurrenceType,
        } = body
        const recurType: string = ["daily", "weekly"].includes(recurrenceType) ? recurrenceType : "none"

        // Resolve the list of target projects.
        // - wholeSite + companyId  → every current project under that Site (Company)
        // - projectIds[]           → the specific projects selected via checkboxes
        // - projectId              → single project (backward-compatible)
        let targetProjectIds: string[] = []
        if (wholeSite && companyId) {
            const siteProjects = await prisma.project.findMany({
                where: { companyId },
                select: { id: true },
            })
            targetProjectIds = siteProjects.map(p => p.id)
        } else if (Array.isArray(projectIds) && projectIds.length > 0) {
            targetProjectIds = [...new Set(projectIds.filter(Boolean))]
        } else if (projectId) {
            targetProjectIds = [projectId]
        }

        const hasInspectors = inspectorIds && Array.isArray(inspectorIds) && inspectorIds.length > 0
        const mgrIds: string[] = managerIds && Array.isArray(managerIds) ? managerIds : (managerId ? [managerId] : [])

        if (targetProjectIds.length === 0 || (!hasInspectors && mgrIds.length === 0)) {
            return NextResponse.json({ error: "Missing fields" }, { status: 400 })
        }

        const created: any[] = []
        const failed: any[] = []

        // Create assignments for every (project × inspector) pair
        if (hasInspectors) {
            const existingAssignments = await prisma.assignment.findMany({
                where: {
                    projectId: { in: targetProjectIds },
                    inspectionBoyId: { in: inspectorIds },
                    status: "active",
                },
                select: { projectId: true, inspectionBoyId: true },
            })
            const alreadyAssigned = new Set(
                existingAssignments.map(a => `${a.projectId}:${a.inspectionBoyId}`)
            )

            for (const pId of targetProjectIds) {
                for (const inspectionBoyId of inspectorIds) {
                    if (alreadyAssigned.has(`${pId}:${inspectionBoyId}`)) {
                        failed.push({ projectId: pId, inspectionBoyId, error: "Already assigned" })
                        continue
                    }
                    try {
                        const assignment = await prisma.assignment.create({
                            data: {
                                projectId: pId,
                                inspectionBoyId,
                                assignedBy: session!.user.id,
                                status: "active",
                                recurrenceType: recurType,
                                recurrenceActive: recurType !== "none",
                            },
                        })
                        created.push(assignment)
                    } catch (err: any) {
                        failed.push({ projectId: pId, inspectionBoyId, error: err.message })
                    }
                }
            }
        }

        // Persist the "Whole Site" intent so projects added later are
        // auto-assigned to these inspectors.
        if (wholeSite && companyId && hasInspectors) {
            try {
                for (const inspectionBoyId of inspectorIds) {
                    await prisma.siteAssignment.upsert({
                        where: { companyId_inspectionBoyId: { companyId, inspectionBoyId } },
                        create: {
                            companyId,
                            inspectionBoyId,
                            assignedBy: session!.user.id,
                            recurrenceType: recurType,
                            status: "active",
                        },
                        update: { recurrenceType: recurType, status: "active" },
                    })
                }
            } catch (siteErr) {
                console.log("Site assignment persistence skipped:", siteErr)
            }
        }

        // Attach managers to every target project
        if (mgrIds.length > 0) {
            try {
                for (const pId of targetProjectIds) {
                    for (const mId of mgrIds) {
                        await prisma.projectManager.upsert({
                            where: { projectId_managerId: { projectId: pId, managerId: mId } },
                            create: { projectId: pId, managerId: mId, assignedBy: session!.user.id },
                            update: {},
                        })
                    }
                }
            } catch (mgrErr) {
                console.log("Manager assignment skipped:", mgrErr)
            }
        }

        return NextResponse.json({ created, failed })
    } catch (error: any) {
        console.error("ERROR:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
