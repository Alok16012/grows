
import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

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
            },
        })

        if (!project) return new NextResponse("Not Found", { status: 404 })

        return NextResponse.json(project)
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
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { name, description, reportConfig } = body

        const updateData: any = {}
        if (name !== undefined) {
            if (!name) return new NextResponse("Name is required", { status: 400 })
            updateData.name = name
        }
        if (description !== undefined) updateData.description = description
        if (reportConfig !== undefined) updateData.reportConfig = reportConfig

        const project = await prisma.project.update({
            where: {
                id: params.id,
            },
            data: updateData,
        })

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
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
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
