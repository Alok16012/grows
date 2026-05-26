import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER"], "employees.view")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const query = searchParams.get("q")

    if (!query || query.length < 2) {
        return NextResponse.json({ companies: [], projects: [], inspections: [] })
    }

    try {
        const [companies, projects, inspections] = await Promise.all([
            prisma.company.findMany({
                where: { name: { contains: query, mode: "insensitive" } },
                take: 5,
                select: { id: true, name: true }
            }),
            prisma.project.findMany({
                where: { name: { contains: query, mode: "insensitive" } },
                take: 5,
                include: { company: { select: { name: true } } }
            }),
            prisma.inspection.findMany({
                where: {
                    OR: [
                        { assignment: { project: { name: { contains: query, mode: "insensitive" } } } },
                        { submitter: { name: { contains: query, mode: "insensitive" } } }
                    ],
                    status: { not: "draft" }
                },
                take: 5,
                include: {
                    assignment: { include: { project: true } },
                    submitter: { select: { name: true } }
                }
            })
        ])

        return NextResponse.json({
            companies,
            projects: projects.map(p => ({
                id: p.id,
                name: p.name,
                companyName: p.company.name,
                companyId: p.companyId
            })),
            inspections: inspections.map(i => ({
                id: i.id,
                projectName: i.assignment.project.name,
                inspectorName: i.submitter.name,
                status: i.status
            }))
        })
    } catch (error) {
        console.error("SEARCH_ERROR", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}
