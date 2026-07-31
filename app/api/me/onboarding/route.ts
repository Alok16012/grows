import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })

    const emp = await prisma.employee.findFirst({
        where: { userId: session.user.id },
        select: {
            id: true, firstName: true, lastName: true, employeeId: true,
            designation: true, status: true, dateOfJoining: true,
            isKycVerified: true, kycRejectionNote: true,
            branch: { select: { name: true } },
            onboardingRecord: {
                include: {
                    tasks: { orderBy: { order: "asc" } }
                }
            },
            documents: { orderBy: { uploadedAt: "desc" } }
        }
    })

    if (!emp) return NextResponse.json(null)
    return NextResponse.json(emp)
}

export async function PATCH(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })

    const emp = await prisma.employee.findFirst({ where: { userId: session.user.id } })
    if (!emp) return new NextResponse("Not found", { status: 404 })

    const body = await req.json()
    const { taskId, status } = body

    if (!taskId || !status) return new NextResponse("taskId and status required", { status: 400 })

    // Scope the update to the caller's OWN tasks. Without the employeeId filter
    // any user could flip any employee's onboarding task by guessing a taskId.
    const result = await prisma.onboardingTask.updateMany({
        where: { id: taskId, employeeId: emp.id },
        data: {
            status,
            completedAt: status === "COMPLETED" ? new Date() : null,
            completedBy: status === "COMPLETED" ? `${emp.firstName} ${emp.lastName}` : null
        }
    })
    if (result.count === 0) return new NextResponse("Not found", { status: 404 })

    const task = await prisma.onboardingTask.findUnique({ where: { id: taskId } })
    return NextResponse.json(task)
}
