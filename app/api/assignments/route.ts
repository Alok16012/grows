
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { checkAccess } from "@/lib/permissions"
import { ensureProjectSchema } from "@/lib/prisma"

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

    // Who is asking as an INSPECTOR — i.e. should only ever see their own work?
    //
    // The base role alone can't answer this: every route that assigns a custom
    // role sets the system role to MANAGER, so a "Quality Inspector" does not
    // carry INSPECTION_BOY. Keying the scoping on the base role therefore let
    // such a user through to the unfiltered manager list, and the Inspector
    // Workspace showed — and let them fill in — assignments belonging to other
    // inspectors.
    //
    // `?mine=1` lets a caller demand its own rows regardless; the workspace uses
    // it so that screen can never render someone else's assignment.
    const perms = (user as any).permissions ?? []
    const holdsInspectionPermission =
        perms.includes("inspection.view") ||
        perms.includes("inspection.submit") ||
        perms.includes("inspection.history")
    const isBaseInspector =
        user.role === Role.INSPECTION_BOY || user.role.toString() === "INSPECTION_BOY"
    const wantsOwnOnly = searchParams.get("mine") === "1"
    const scopeToSelf =
        wantsOwnOnly || isBaseInspector || (holdsInspectionPermission && user.role !== Role.ADMIN)

    if (scopeToSelf) {
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
        await ensureProjectSchema()

        // Same reasoning as the scoping above — a custom-role inspector carries
        // the MANAGER base role, so this has to follow scopeToSelf rather than the
        // base role, or they'd get the manager-shaped project list instead of
        // their own assignments.
        if (scopeToSelf) {
            const assignments = await prisma.assignment.findMany({
                where,
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
                    site: project.site,
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
                site: { select: { id: true, name: true } },
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
                        code: true,
                        recurrenceType: true,
                        recurrenceActive: true,
                        startDate: true,
                        notes: true,
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
                            site: project.site,
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
                        site: project.site,
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
        await ensureProjectSchema()

        const body = await req.json()
        const {
            projectId,
            projectIds,
            siteId,
            wholeSite,
            inspectorIds,
            managerId,
            managerIds,
            recurrenceType,
            startDate,
            notes,
        } = body
        const recurType: string = ["daily", "weekly"].includes(recurrenceType) ? recurrenceType : "none"
        const start = startDate ? new Date(startDate) : null
        const noteText = typeof notes === "string" && notes.trim() ? notes.trim().slice(0, 250) : null

        // Resolve the list of target projects.
        // - wholeSite + siteId  → every current project under that real HR Site
        // - projectIds[]        → the specific projects selected via checkboxes
        // - projectId           → single project (backward-compatible)
        let targetProjectIds: string[] = []
        if (wholeSite && siteId) {
            const siteProjects = await prisma.project.findMany({
                where: { siteId },
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

        // Sequential human-readable assignment numbers: ASG-YYYY-NNNNN.
        const year = new Date().getFullYear()
        const lastWithCode = await prisma.assignment.findFirst({
            where: { code: { startsWith: "ASG-" } },
            orderBy: { createdAt: "desc" },
            select: { code: true },
        }).catch(() => null)
        let seq = (await prisma.assignment.count().catch(() => 0)) + 1
        const seqMatch = lastWithCode?.code?.match(/(\d+)$/)
        if (seqMatch) seq = parseInt(seqMatch[1]) + 1
        const nextCode = () => `ASG-${year}-${String(seq++).padStart(5, "0")}`

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
                                code: nextCode(),
                                startDate: start,
                                notes: noteText,
                            },
                        })
                        created.push(assignment)
                    } catch (err: any) {
                        failed.push({ projectId: pId, inspectionBoyId, error: err.message })
                    }
                }
            }
        }

        // "Whole Site" now means exactly what it says on the wizard: assign these
        // inspectors to every project currently under the site, which the loop
        // above has already done.
        //
        // It used to also write a SiteAssignment row so that projects created
        // later were auto-assigned too. That happened silently — the project form
        // never mentioned it — so people turned up on projects nobody had put them
        // on. The auto-assign was removed from POST /api/projects, so persisting
        // the intent here would only write a record nothing reads.

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
