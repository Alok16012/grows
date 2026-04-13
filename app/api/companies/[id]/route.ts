
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

        if (!session) {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        const company = await prisma.company.findUnique({
            where: {
                id: params.id,
            },
            include: {
                projects: {
                    orderBy: { createdAt: 'desc' }
                },
            },
        })

        if (!company) {
            return new NextResponse("Not Found", { status: 404 })
        }

        return NextResponse.json(company)
    } catch (error) {
        console.error("[COMPANY_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function PUT(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)

        if (!session) {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { name, address, contactPerson, contactPhone, logoUrl } = body

        if (!name) {
            return new NextResponse("Name is required", { status: 400 })
        }

        const company = await prisma.company.update({
            where: {
                id: params.id,
            },
            data: {
                name,
                address,
                contactPerson,
                contactPhone,
                logoUrl,
            },
        })

        return NextResponse.json(company)
    } catch (error) {
        console.error("[COMPANY_PUT]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)

        if (!session) {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const companyId = params.id;

        // Manual cascaded deletion
        // 1. Get all projects for this company
        const projects = await prisma.project.findMany({
            where: { companyId }
        });

        for (const project of projects) {
            const projectId = project.id;

            // 1a. Delete Inspections and InspectionData for all assignments in this project
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

            // 1b. Delete Assignments, FormTemplates, ProjectManagers for this project
            await prisma.assignment.deleteMany({ where: { projectId } });
            await prisma.formTemplate.deleteMany({ where: { projectId } });
            await prisma.projectManager.deleteMany({ where: { projectId } });

            // 1c. Delete the project itself
            await prisma.project.delete({ where: { id: projectId } });
        }

        // 2. Set companyId to null for all users belonging to this company
        await prisma.user.updateMany({
            where: { companyId },
            data: { companyId: null }
        });

        // 3. Finally delete the company
        const company = await prisma.company.delete({
            where: {
                id: companyId,
            },
        })

        return NextResponse.json(company)
    } catch (error) {
        console.error("[COMPANY_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
