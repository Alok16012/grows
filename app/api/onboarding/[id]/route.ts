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
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const record = await prisma.onboardingRecord.findUnique({
            where: { id: params.id },
            include: {
                tasks: { orderBy: { order: "asc" } },
                employee: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        employeeId: true,
                        designation: true,
                        dateOfJoining: true,
                        photo: true,
                        branch: { select: { name: true } },
                    },
                },
            },
        })

        if (!record) return new NextResponse("Not found", { status: 404 })

        return NextResponse.json(record)
    } catch (error) {
        console.error("[ONBOARDING_ID_GET]", error)
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
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { status, notes, assignedTo } = body

        const record = await prisma.onboardingRecord.update({
            where: { id: params.id },
            data: {
                ...(status && { status }),
                ...(notes !== undefined && { notes }),
                ...(assignedTo !== undefined && { assignedTo }),
                ...(status === "COMPLETED" && { completedAt: new Date() }),
            },
            include: {
                tasks: { orderBy: { order: "asc" } },
                employee: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        employeeId: true,
                        designation: true,
                        dateOfJoining: true,
                        photo: true,
                        branch: { select: { name: true } },
                    },
                },
            },
        })

        return NextResponse.json(record)
    } catch (error) {
        console.error("[ONBOARDING_ID_PUT]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
