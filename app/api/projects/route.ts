
import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { resolveUserId } from "@/lib/resolveUserId"
import { ensureProjectSchema } from "@/lib/prisma"
import { checkAccess } from "@/lib/permissions"
import { accessFrom } from "@/lib/access"
import { unassignableUserWhere, UNASSIGNABLE_USER_SELECT, unassignableMessage } from "@/lib/employee-filter"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        // Every caller is a management screen (projects, assignments, reports,
        // bulk import). A self-service login must not list every client
        // project with its site and team.
        const PROJECT_READERS = ["projects.view", "projects.manage", "assignments.view", "assignments.manage", "approvals.view", "reports.view"]
        if (!PROJECT_READERS.some(p => checkAccess(session, [], p))) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const siteId = searchParams.get("siteId")
        // Drafts are half-filled projects (Name + Site only) — nothing may be
        // assigned to them. Every project picker (assignment wizard, bulk import,
        // reports) lists projects off this endpoint, so drafts are hidden unless
        // the caller asks for them; only the Projects list does.
        const includeDrafts = searchParams.get("includeDrafts") === "1"

        const where: Record<string, unknown> = {}
        if (siteId) where.siteId = siteId
        // An Assigned-sites role lists only projects on its sites.
        const access = accessFrom(session)
        if (access.scope === "ASSIGNED_SITES") where.AND = [{ siteId: { in: access.siteIds } }]
        if (!includeDrafts) where.status = { not: "DRAFT" }

        await ensureProjectSchema()

        const projects = await prisma.project.findMany({
            where,
            include: {
                site: { select: { id: true, name: true, code: true, city: true } },
                // Current project members, so callers (e.g. the assignment wizard,
                // the projects grid team avatars) can show/pre-fill them.
                projectManagers: { select: { managerId: true, manager: { select: { id: true, name: true } } } },
                // Membership, not work. Reading the team off Assignment rows tied
                // "who is on this project" to "what has been handed out", so the
                // team changed shape as work was issued and approved.
                projectInspectors: { select: { inspectorId: true, inspector: { select: { id: true, name: true } } } },
            },
            orderBy: {
                createdAt: "desc",
            },
        })

        // Flatten member ids + display names alongside the raw relations.
        const withMembers = projects.map((p) => {
            const inspectorNames = Array.from(
                new Map(p.projectInspectors.map((pi) => [pi.inspectorId, pi.inspector?.name ?? ""])).entries()
            )
            return {
                ...p,
                managerIds: p.projectManagers.map((m) => m.managerId),
                inspectorIds: inspectorNames.map(([id]) => id),
                team: [
                    ...p.projectManagers.map((m) => ({ id: m.managerId, name: m.manager?.name ?? "" })),
                    ...inspectorNames.map(([id, name]) => ({ id, name })),
                ],
            }
        })

        return NextResponse.json(withMembers)
    } catch (error) {
        console.error("[PROJECTS_GET]", error)
        return NextResponse.json({
            error: "Database Connection Error",
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        // Creating a project is a write — same gate as PUT / DELETE on
        // /api/projects/[id]. Without this any signed-in user could create one.
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "projects.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        // Resolve real DB user ID
        const actorId = await resolveUserId(session)
        if (!actorId) return NextResponse.json({ error: "User not found. Please log in again." }, { status: 403 })

        const body = await req.json()
        const { name, description, siteId, managerIds, inspectorIds, projectType, priority, status, startDate, endDate } = body
        if (!name || !siteId) {
            return new NextResponse("Name and Site ID are required", { status: 400 })
        }

        const mgrIds: string[] = Array.isArray(managerIds) ? managerIds : []
        const insIds: string[] = Array.isArray(inspectorIds) ? inspectorIds : []

        // DRAFT = "save what I have so far": only Name + Site are needed and the
        // project stays out of every assignment picker. Anything else is a real
        // project, so the fields the form marks mandatory are enforced here too —
        // the client check alone let a Name + Site POST through.
        const isDraft = status === "DRAFT"
        const start = startDate ? new Date(startDate) : null
        const end = endDate ? new Date(endDate) : null
        const validStart = !!start && !isNaN(start.getTime())
        const validEnd = !!end && !isNaN(end.getTime())
        if (!isDraft) {
            const problems: string[] = []
            const missing: string[] = []
            if (!projectType) missing.push("Project Type")
            if (!validStart) missing.push("Estimated Start Date")
            if (!validEnd) missing.push("Target End Date")
            if (!priority) missing.push("Priority")
            if (!status) missing.push("Status")
            if (missing.length) problems.push(`Missing required fields: ${missing.join(", ")}`)
            if (validStart && validEnd && end! < start!) problems.push("Target End Date must be on or after Estimated Start Date")
            if (mgrIds.length === 0) problems.push("At least one Manager is required")
            if (insIds.length === 0) problems.push("At least one Inspector is required")
            if (problems.length) return new NextResponse(problems.join(". "), { status: 400 })
        } else if (validStart && validEnd && end! < start!) {
            // A draft may leave dates blank, but not contradict itself.
            return new NextResponse("Target End Date must be on or after Estimated Start Date", { status: 400 })
        }

        // A resigned / terminated / inactive employee must not become a Manager
        // or Inspector. The picker already hides them; this catches a stale form.
        const pickedIds = [...new Set([...mgrIds, ...insIds])]
        if (pickedIds.length > 0) {
            const blocked = await prisma.user.findFirst({ where: unassignableUserWhere(pickedIds), select: UNASSIGNABLE_USER_SELECT })
            if (blocked) return new NextResponse(unassignableMessage(blocked), { status: 400 })
        }

        await ensureProjectSchema()

        // Projects hang off a real HR Site — the Company concept is retired.
        const site = await prisma.site.findUnique({
            where: { id: siteId },
            select: { id: true },
        })
        if (!site) {
            return new NextResponse("Site not found", { status: 400 })
        }

        // Auto-generate a sequential project code, e.g. PRJ-2026-00027.
        const year = new Date().getFullYear()
        const lastWithCode = await prisma.project.findFirst({
            where: { code: { startsWith: "PRJ-" } },
            orderBy: { createdAt: "desc" },
            select: { code: true },
        }).catch(() => null)
        let nextNum = (await prisma.project.count().catch(() => 0)) + 1
        const match = lastWithCode?.code?.match(/(\d+)$/)
        if (match) nextNum = parseInt(match[1]) + 1
        const code = `PRJ-${year}-${String(nextNum).padStart(5, "0")}`

        const VALID_STATUSES = ["DRAFT", "PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"]
        const project = await prisma.project.create({
            data: {
                name,
                description,
                siteId,
                code,
                status: VALID_STATUSES.includes(status) ? status : "PLANNING",
                projectType: projectType || null,
                priority: priority || "Medium",
                startDate: validStart ? start : null,
                endDate: validEnd ? end : null,
                createdBy: actorId!,
            },
        })

        // Managers & Inspectors are now added directly at the Project level
        // (the old "Groups" feature, folded into the project). Managers are
        // stored as ProjectManager rows; each selected Inspector becomes an
        // active Assignment on this project. Wrapped defensively so a project
        // is still created even if these follow-up writes fail.
        try {
            if (mgrIds.length > 0) {
                await prisma.projectManager.createMany({
                    data: mgrIds.map((managerId) => ({
                        projectId: project.id,
                        managerId,
                        assignedBy: actorId!,
                    })),
                    skipDuplicates: true,
                })
            }
        } catch {
            // Non-fatal: the project itself was already created.
        }

        try {
            // Record membership only. This used to create an active Assignment per
            // inspector, so creating a project silently issued work to everyone on
            // its team — the job appeared in their workspace before anyone had
            // decided what, or when, they were inspecting. Work is issued from the
            // Assignments screen.
            if (insIds.length > 0) {
                await prisma.projectInspector.createMany({
                    data: insIds.map((inspectorId) => ({
                        projectId: project.id,
                        inspectorId,
                        assignedBy: actorId!,
                    })),
                    skipDuplicates: true,
                })
            }
        } catch {
            // Non-fatal: the project itself was already created.
        }

        // Creating a project used to ALSO assign every inspector holding a
        // "Whole Site" grant for this site, on top of the ones picked in the Team
        // step. Nothing in the create form said so, so people appeared on projects
        // nobody had put them on. Removed deliberately: only the inspectors chosen
        // in the Team step are assigned.
        //
        // Existing SiteAssignment rows are left untouched — no longer read here.

        return NextResponse.json(project)
    } catch (error) {
        console.error("[PROJECTS_POST]", error)
        return NextResponse.json({
            error: "Database Connection Error",
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 })
    }
}
