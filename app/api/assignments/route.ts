
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { ASSIGNMENT_OVERSIGHT_PERMISSIONS, checkAccess, isSelfScopedInspector } from "@/lib/permissions"
import { ensureProjectSchema } from "@/lib/prisma"
import { unassignableUserWhere, UNASSIGNABLE_USER_SELECT, unassignableMessage } from "@/lib/employee-filter"

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
    // Decided purely by the inspection permissions: every route that assigns a
    // custom role sets the system role to MANAGER, so a "Quality Inspector" does
    // not carry INSPECTION_BOY. Keying the scoping on the base role let such a
    // user through to the unfiltered manager list, and the Inspector Workspace
    // showed — and let them fill in — assignments belonging to other inspectors.
    //
    // `?mine=1` lets a caller demand its own rows regardless; the workspace uses
    // it so that screen can never render someone else's assignment.
    //
    // Holding assignments.view / assignments.manage cancels the self-scoping: a
    // coordinator granted every permission also picks up the inspection ones,
    // which used to make them look like an inspector and narrow this list to
    // assignments where they personally were the inspector — i.e. an empty
    // screen, precisely because they had been given MORE rights.
    const wantsOwnOnly = searchParams.get("mine") === "1"
    const scopeToSelf = wantsOwnOnly || isSelfScopedInspector(session, ASSIGNMENT_OVERSIGHT_PERMISSIONS)

    if (scopeToSelf) {
        where.inspectionBoyId = user.id
        // Only default to active if no status is specified
        if (!status) {
            where.status = "active"
        }
    } else if (!checkAccess(session, ["MANAGER"], "assignments.view")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // "not_assigned" is not a stored status: it names the virtual row GET
    // invents for a project that has a team but no assignment yet. The filter
    // used to be called "manager_only" — old links still send that.
    const wantsNotAssigned = status === "not_assigned" || status === "manager_only"
    const realStatus = status && status !== "all" && !wantsNotAssigned ? status : null

    if (realStatus) {
        where.status = realStatus
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
                    },
                    // How many parts have been filed so far — a multi-part
                    // assignment can hold several inspections.
                    _count: { select: { inspections: true } }
                },
                orderBy: { createdAt: "desc" }
            });

            const result = assignments.map(({ inspections, project, _count, ...a }) => ({
                ...a,
                inspection: inspections?.[0] || null,
                partCount: _count?.inspections ?? 0,
                project: {
                    id: project.id,
                    name: project.name,
                    site: project.site,
                    managers: project.projectManagers.map(pm => pm.manager)
                }
            }));

            return NextResponse.json(result);
        }

        // 1. Get all projects that have an assignment, OR a team (managers /
        //    inspectors) but no assignment yet. The latter get a virtual
        //    "not_assigned" row so admins can see work still to be issued.
        //    Draft and archived projects are not candidates for new work, so
        //    they get no virtual row (real assignments on them still show).
        const assignmentWhere = realStatus ? { some: { status: realStatus } } : { some: {} }
        const hasTeamNoWork = {
            status: { notIn: ["DRAFT", "ARCHIVED"] },
            assignments: { none: {} },
            OR: [
                { projectManagers: { some: {} } },
                { projectInspectors: { some: {} } },
            ],
        }

        const projects = await prisma.project.findMany({
            where: realStatus
                ? { assignments: assignmentWhere }
                : wantsNotAssigned
                    ? hasTeamNoWork
                    : { OR: [{ assignments: assignmentWhere }, hasTeamNoWork] },
            select: {
                id: true,
                name: true,
                status: true,
                createdAt: true,
                site: { select: { id: true, name: true } },
                assignments: {
                    where: realStatus ? { status: realStatus } : undefined,
                    select: {
                        id: true,
                        projectId: true,
                        inspectionBoyId: true,
                        assignedBy: true,
                        status: true,
                        code: true,
                        recurrenceType: true,
                        recurrenceActive: true,
                        isMultiPart: true,
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
                },
                // Team inspectors — membership only; the virtual row lists them so
                // the admin can see who is waiting to be issued the work.
                projectInspectors: {
                    select: {
                        inspector: { select: { id: true, name: true, email: true } }
                    }
                }
            },
            orderBy: { createdAt: "desc" }
        })

        // 2. Flatten into a list of "Display Assignments"
        const result: any[] = []

        projects.forEach(project => {
            const managers = project.projectManagers.map(pm => pm.manager)
            const inspectors = project.projectInspectors.map(pi => pi.inspector)
            const projectRow = {
                id: project.id,
                name: project.name,
                status: project.status,
                site: project.site,
                managers,
                inspectors,
            }

            if (project.assignments.length > 0) {
                if (wantsNotAssigned) return
                project.assignments.forEach(a => {
                    result.push({ ...a, project: projectRow })
                })
            } else if (!realStatus && !["DRAFT", "ARCHIVED"].includes(project.status)) {
                // Virtual row: the project has a team but nobody has issued an
                // assignment yet. It used to be called "manager_only" with a fake
                // "Pending Inspector" person, which read as a broken assignment.
                result.push({
                    id: `virtual-${project.id}`,
                    projectId: project.id,
                    inspectionBoyId: null,
                    assignedBy: null,
                    status: "not_assigned",
                    createdAt: project.createdAt,
                    project: projectRow,
                    inspectionBoy: null,
                    assigner: null,
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
            isMultiPart,
        } = body
        const recurType: string = ["daily", "weekly"].includes(recurrenceType) ? recurrenceType : "none"
        // Multi-part: inspected over several visits. The inspector can start the
        // next part once the previous one is filed, and approving a part does not
        // close the assignment.
        const multiPart = !!isMultiPart
        const start = startDate ? new Date(startDate) : null
        const noteText = typeof notes === "string" && notes.trim() ? notes.trim().slice(0, 250) : null

        // Resolve the list of target projects.
        // - wholeSite + siteId  → every current project under that real HR Site
        // - projectIds[]        → the specific projects selected via checkboxes
        // - projectId           → single project (backward-compatible)
        //
        // Draft and archived projects cannot take new work: "All Projects" skips
        // them silently, an explicit pick of one is rejected so the caller knows.
        const CLOSED_PROJECT_STATUSES = ["DRAFT", "ARCHIVED"]
        let targetProjectIds: string[] = []
        if (wholeSite && siteId) {
            const siteProjects = await prisma.project.findMany({
                where: { siteId, status: { notIn: CLOSED_PROJECT_STATUSES } },
                select: { id: true },
            })
            targetProjectIds = siteProjects.map(p => p.id)
        } else {
            if (Array.isArray(projectIds) && projectIds.length > 0) {
                targetProjectIds = [...new Set(projectIds.filter(Boolean))] as string[]
            } else if (projectId) {
                targetProjectIds = [projectId]
            }
            if (targetProjectIds.length > 0) {
                const closed = await prisma.project.findFirst({
                    where: { id: { in: targetProjectIds }, status: { in: CLOSED_PROJECT_STATUSES } },
                    select: { name: true, status: true },
                })
                if (closed) {
                    const what = closed.status === "DRAFT" ? "a draft" : "archived"
                    return NextResponse.json(
                        { error: `Project ${closed.name} is ${what} — complete or restore it first` },
                        { status: 400 },
                    )
                }
            }
        }

        const hasInspectors = inspectorIds && Array.isArray(inspectorIds) && inspectorIds.length > 0
        const mgrIds: string[] = managerIds && Array.isArray(managerIds) ? managerIds : (managerId ? [managerId] : [])

        if (targetProjectIds.length === 0) {
            return NextResponse.json({ error: "Missing fields" }, { status: 400 })
        }
        // An assignment is inspector work. Letting a manager-only request through
        // used to attach managers to the project and create nothing, so the
        // "assignment" could never be found again. Managers stay optional.
        if (!hasInspectors) {
            return NextResponse.json({ error: "Select at least one inspector" }, { status: 400 })
        }
        // A resigned / terminated / inactive employee cannot be handed new work
        // or attached as a manager. The picker hides them; this catches a stale form.
        const pickedIds = [...new Set<string>([...inspectorIds, ...mgrIds])]
        const blocked = await prisma.user.findFirst({ where: unassignableUserWhere(pickedIds), select: UNASSIGNABLE_USER_SELECT })
        if (blocked) return NextResponse.json({ error: unassignableMessage(blocked) }, { status: 400 })

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
                                isMultiPart: multiPart,
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
            } catch {
                // Non-fatal: the assignment itself was already created.
            }
        }

        return NextResponse.json({ created, failed })
    } catch (error: any) {
        console.error("ERROR:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
