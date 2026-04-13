import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { resolveUserId } from "@/lib/resolveUserId"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const siteId = searchParams.get("siteId")
        const employeeId = searchParams.get("employeeId")
        const isActive = searchParams.get("isActive")

        const where: Record<string, unknown> = {}
        if (siteId) where.siteId = siteId
        if (employeeId) where.employeeId = employeeId
        if (isActive !== null && isActive !== "") where.isActive = isActive === "true"

        const deployments = await prisma.deployment.findMany({
            where,
            include: {
                employee: {
                    select: {
                        id: true,
                        employeeId: true,
                        firstName: true,
                        lastName: true,
                        designation: true,
                        phone: true,
                        photo: true,
                    },
                },
                site: {
                    select: { id: true, name: true, code: true, city: true },
                },
            },
            orderBy: { startDate: "desc" },
        })

        return NextResponse.json(deployments)
    } catch (error) {
        console.error("[DEPLOYMENTS_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }
        // Resolve real DB user ID
        const actorId = await resolveUserId(session)
        if (!actorId) return NextResponse.json({ error: "User not found. Please log in again." }, { status: 403 })


        const body = await req.json()
        const { employeeId, siteId, startDate, shift, role, notes } = body

        if (!employeeId || !siteId || !startDate) {
            return new NextResponse("employeeId, siteId and startDate are required", { status: 400 })
        }

        // Check employee not already deployed elsewhere
        const existingDeployment = await prisma.deployment.findFirst({
            where: { employeeId, isActive: true },
            include: { site: { select: { name: true } } },
        })

        if (existingDeployment) {
            return new NextResponse(
                `Employee is already deployed at ${existingDeployment.site.name}. Relieve them first.`,
                { status: 400 }
            )
        }

        const deployment = await prisma.deployment.create({
            data: {
                employeeId,
                siteId,
                startDate: new Date(startDate),
                shift: shift || null,
                role: role || null,
                notes: notes || null,
                createdBy: actorId!,
                isActive: true,
            },
            include: {
                employee: {
                    select: {
                        id: true,
                        employeeId: true,
                        firstName: true,
                        lastName: true,
                        designation: true,
                        phone: true,
                        photo: true,
                    },
                },
                site: {
                    select: { id: true, name: true, code: true },
                },
            },
        })

        return NextResponse.json(deployment)
    } catch (error) {
        console.error("[DEPLOYMENTS_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
