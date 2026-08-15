
import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { resolveUserId } from "@/lib/resolveUserId"
import { ensureProjectSchema } from "@/lib/prisma"
import { checkAccess } from "@/lib/permissions"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const { searchParams } = new URL(req.url)
        const siteId = searchParams.get("siteId")

        const where: Record<string, unknown> = {}
        if (siteId) where.siteId = siteId

        await ensureProjectSchema()

        const projects = await prisma.project.findMany({
            where,
            include: {
                site: { select: { id: true, name: true, code: true, city: true } },
                // Current project members, so callers (e.g. the assignment wizard,
                // the projects grid team avatars) can show/pre-fill them.
                projectManagers: { select: { managerId: true, manager: { select: { id: true, name: true } } } },
                assignments: {
                    // Team membership survives the work being finished: an
                    // approved inspection marks the assignment "completed", and
                    // filtering on "active" here made the inspector vanish from
                    // the project card the moment their report was approved.
                    // Only "inactive" — a deliberate removal from the project —
                    // takes someone off the team.
                    where: { status: { not: "inactive" } },
                    select: { inspectionBoyId: true, inspectionBoy: { select: { id: true, name: true } } },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        })

        // Flatten member ids + display names alongside the raw relations.
        const withMembers = projects.map((p) => {
            const inspectorNames = Array.from(
                new Map(p.assignments.map((a) => [a.inspectionBoyId, a.inspectionBoy?.name ?? ""])).entries()
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

        const VALID_STATUSES = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"]
        const project = await prisma.project.create({
            data: {
                name,
                description,
                siteId,
                code,
                status: VALID_STATUSES.includes(status) ? status : "PLANNING",
                projectType: projectType || null,
                priority: priority || "Medium",
                startDate: startDate ? new Date(startDate) : null,
                endDate: endDate ? new Date(endDate) : null,
                createdBy: actorId!,
            },
        })

        // Managers & Inspectors are now added directly at the Project level
        // (the old "Groups" feature, folded into the project). Managers are
        // stored as ProjectManager rows; each selected Inspector becomes an
        // active Assignment on this project. Wrapped defensively so a project
        // is still created even if these follow-up writes fail.
        try {
            const mgrIds: string[] = Array.isArray(managerIds) ? managerIds : []
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
        } catch (mgrErr) {
            console.log("Project manager attach skipped:", mgrErr)
        }

        try {
            const insIds: string[] = Array.isArray(inspectorIds) ? inspectorIds : []
            for (const inspectionBoyId of insIds) {
                await prisma.assignment.create({
                    data: {
                        projectId: project.id,
                        inspectionBoyId,
                        assignedBy: actorId!,
                        status: "active",
                    },
                })
            }
        } catch (insErr) {
            console.log("Project inspector attach skipped:", insErr)
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
