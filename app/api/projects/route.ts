
import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { resolveUserId } from "@/lib/resolveUserId"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const { searchParams } = new URL(req.url)
        const companyId = searchParams.get("companyId")
        const siteId = searchParams.get("siteId")

        const where: Record<string, unknown> = {}
        if (siteId) where.siteId = siteId
        else if (companyId) where.companyId = companyId

        const projects = await prisma.project.findMany({
            where,
            include: {
                company: true,
                site: { select: { id: true, name: true, code: true, city: true } },
                // Current project members, so callers (e.g. the assignment wizard)
                // can pre-fill a project's existing inspectors & managers.
                projectManagers: { select: { managerId: true } },
                assignments: { where: { status: "active" }, select: { inspectionBoyId: true } },
            },
            orderBy: {
                createdAt: "desc",
            },
        })

        // Flatten member ids alongside the raw relations for convenience.
        const withMembers = projects.map((p) => ({
            ...p,
            managerIds: p.projectManagers.map((m) => m.managerId),
            inspectorIds: Array.from(new Set(p.assignments.map((a) => a.inspectionBoyId))),
        }))

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

        // Resolve real DB user ID
        const actorId = await resolveUserId(session)
        if (!actorId) return NextResponse.json({ error: "User not found. Please log in again." }, { status: 403 })

        // Role check
        if (session.user.role === "CLIENT") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { name, description, siteId, managerIds, inspectorIds } = body
        let { companyId } = body

        if (!name || !siteId) {
            return new NextResponse("Name and Site ID are required", { status: 400 })
        }

        // Inspection projects now hang off a real HR Site. We still keep the
        // (non-null) companyId column populated for backwards compatibility, so
        // derive it from the chosen Site's branch → company.
        const site = await prisma.site.findUnique({
            where: { id: siteId },
            select: { branch: { select: { companyId: true } } },
        })
        if (!site) {
            return new NextResponse("Site not found", { status: 400 })
        }
        companyId = site.branch.companyId

        const project = await prisma.project.create({
            data: {
                name,
                description,
                companyId,
                siteId,
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

        // Auto-include this new project in any "Whole Site" assignment: create
        // an Assignment for every inspector who was granted access to the Site.
        try {
            const siteAssignments = await prisma.siteAssignment.findMany({
                where: { siteId, status: "active" },
                select: { inspectionBoyId: true, assignedBy: true, recurrenceType: true },
            })
            for (const sa of siteAssignments) {
                await prisma.assignment.create({
                    data: {
                        projectId: project.id,
                        inspectionBoyId: sa.inspectionBoyId,
                        assignedBy: sa.assignedBy,
                        status: "active",
                        recurrenceType: sa.recurrenceType,
                        recurrenceActive: sa.recurrenceType !== "none",
                    },
                })
            }
        } catch (autoErr) {
            console.log("Whole-site auto-assign skipped:", autoErr)
        }

        return NextResponse.json(project)
    } catch (error) {
        console.error("[PROJECTS_POST]", error)
        return NextResponse.json({
            error: "Database Connection Error",
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 })
    }
}
