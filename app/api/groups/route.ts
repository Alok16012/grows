
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
    if (user.role !== Role.ADMIN && user.role !== Role.MANAGER) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        // Get all companies
        const companies = await prisma.company.findMany({
            include: {
                projects: {
                    include: {
                        assignments: {
                            where: { status: "active" },
                            include: {
                                inspectionBoy: {
                                    select: { id: true, name: true, email: true }
                                }
                            }
                        }
                    }
                }
            },
            orderBy: { name: "asc" }
        })

        // Try to fetch project managers
        let projectManagers: any[] = []
        let managerIds: string[] = []
        try {
            projectManagers = await prisma.projectManager.findMany({
                include: {
                    manager: {
                        select: { id: true, name: true, email: true }
                    }
                }
            })
            managerIds = projectManagers.map(pm => pm.managerId)
        } catch (e) {
            console.log("ProjectManager table not available yet")
        }

        // If manager logged in, only show their projects
        let allowedProjectIds: string[] | undefined
        if (user.role === Role.MANAGER) {
            allowedProjectIds = projectManagers
                .filter(pm => pm.managerId === user.id)
                .map(pm => pm.projectId)
        }

        const grouped = companies
            .map(company => ({
                id: company.id,
                name: company.name,
                projects: company.projects
                    .filter(p => !allowedProjectIds || allowedProjectIds.includes(p.id))
                    .map(project => {
                        const inspectors = project.assignments
                            .filter(a => a.inspectionBoy)
                            .map(a => ({
                                ...a.inspectionBoy,
                                assignmentId: a.id
                            }))

                        const managers = projectManagers
                            .filter(pm => pm.projectId === project.id)
                            .map(pm => pm.manager)

                        return {
                            id: project.id,
                            name: project.name,
                            managers,
                            inspectors
                        }
                    })
            })).filter(c => c.projects.length > 0)

        return NextResponse.json(grouped)
    } catch (error) {
        console.error("GET_GROUPS_ERROR", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}

// DELETE - Remove inspector from project OR remove manager from project
export async function DELETE(req: Request) {
    const session = await getServerSession(authOptions)

    if (!session || (session.user.role !== Role.ADMIN && session.user.role !== Role.MANAGER)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const { searchParams } = new URL(req.url)
        const assignmentId = searchParams.get("assignmentId")
        const managerId = searchParams.get("managerId")
        const projectId = searchParams.get("projectId")

        if (managerId && projectId) {
            // Remove manager from project
            await prisma.projectManager.deleteMany({
                where: { managerId, projectId }
            })
            return NextResponse.json({ success: true })
        }

        if (!assignmentId) {
            return NextResponse.json({ error: "Assignment ID or (managerId + projectId) required" }, { status: 400 })
        }

        await prisma.assignment.delete({
            where: { id: assignmentId }
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("DELETE_ASSIGNMENT_ERROR", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}
