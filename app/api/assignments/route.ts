
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"

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

    if (user.role === Role.INSPECTION_BOY) {
        where.inspectionBoyId = user.id
    } else if (user.role !== Role.ADMIN && user.role !== Role.MANAGER) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (status && status !== "all") {
        where.status = status
    }

    try {
        // 1. Get all projects that have either an assignment OR a project manager
        const projects = await prisma.project.findMany({
            where: {
                OR: [
                    { assignments: { some: {} } },
                    { projectManagers: { some: {} } }
                ]
            },
            include: {
                company: true,
                assignments: {
                    include: {
                        inspectionBoy: { select: { id: true, name: true, email: true } },
                        assigner: { select: { name: true } }
                    }
                },
                projectManagers: {
                    include: {
                        manager: { select: { id: true, name: true, email: true } }
                    }
                }
            },
            orderBy: { createdAt: "desc" }
        })

        // 2. Flatten into a list of "Display Assignments"
        // Each inspector assignment is a row.
        // If a project has NO inspector assignments but HAS managers, add one row for it.
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
            } else if (managers.length > 0) {
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

    if (!session || (session.user.role !== Role.ADMIN && session.user.role !== Role.MANAGER)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await req.json()
        const { projectId, inspectorIds, managerId, managerIds } = body

        const hasInspectors = inspectorIds && Array.isArray(inspectorIds) && inspectorIds.length > 0
        const mgrIds: string[] = managerIds && Array.isArray(managerIds) ? managerIds : (managerId ? [managerId] : [])

        if (!projectId || (!hasInspectors && mgrIds.length === 0)) {
            return NextResponse.json({ error: "Missing fields" }, { status: 400 })
        }

        const created: any[] = []
        const failed: any[] = []

        // First create assignments for inspectors
        if (hasInspectors) {
            for (const inspectionBoyId of inspectorIds) {
                const existingAssignment = await prisma.assignment.findFirst({
                    where: { projectId, inspectionBoyId, status: "active" }
                })

                if (existingAssignment) {
                    failed.push({ inspectionBoyId, error: "Already assigned" })
                    continue
                }

                try {
                    const assignment = await prisma.assignment.create({
                        data: { projectId, inspectionBoyId, assignedBy: session.user.id, status: "active" }
                    })
                    created.push(assignment)
                } catch (err: any) {
                    failed.push({ inspectionBoyId, error: err.message })
                }
            }
        }

        // Support multiple managers
        if (mgrIds.length > 0) {
            try {
                for (const mId of mgrIds) {
                    await prisma.projectManager.upsert({
                        where: { projectId_managerId: { projectId, managerId: mId } },
                        create: { projectId, managerId: mId, assignedBy: session.user.id },
                        update: {}
                    })
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
