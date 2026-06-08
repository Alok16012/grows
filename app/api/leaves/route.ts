import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        // Self-service: anyone WITHOUT the management permission falls back to
        // their own leaves only (scoped to their linked employee record). This
        // is role-independent — every employee sees their own data.
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "leaves.view")) {
            const linkedEmployee = await prisma.employee.findUnique({ where: { userId: session.user.id } })
            if (!linkedEmployee) return NextResponse.json([])
            const { searchParams } = new URL(req.url)
            const monthParam = searchParams.get("month")
            const where: Record<string, unknown> = { employeeId: linkedEmployee.id }
            if (monthParam?.includes("-")) {
                const [yr, mo] = monthParam.split("-").map(Number)
                where.startDate = { gte: new Date(yr, mo - 1, 1), lt: new Date(yr, mo, 1) }
            }
            const leaves = await prisma.leave.findMany({
                where,
                include: { employee: { select: { id: true, firstName: true, lastName: true, employeeId: true, designation: true, photo: true } } },
                orderBy: { createdAt: "desc" },
            })
            return NextResponse.json(leaves)
        }

        const { searchParams } = new URL(req.url)
        const employeeId = searchParams.get("employeeId")
        const status = searchParams.get("status")
        const monthParam = searchParams.get("month") // YYYY-MM
        const search = searchParams.get("search")
        const leaveType = searchParams.get("type")

        const where: Record<string, unknown> = {}
        if (employeeId) where.employeeId = employeeId
        if (status) where.status = status
        if (leaveType) where.type = leaveType

        if (monthParam && monthParam.includes("-")) {
            const [yr, mo] = monthParam.split("-").map(Number)
            where.startDate = {
                gte: new Date(yr, mo - 1, 1),
                lt: new Date(yr, mo, 1),
            }
        }

        if (search) {
            where.employee = {
                OR: [
                    { firstName: { contains: search, mode: "insensitive" } },
                    { lastName: { contains: search, mode: "insensitive" } },
                    { employeeId: { contains: search, mode: "insensitive" } },
                ],
            }
        }

        const leaves = await prisma.leave.findMany({
            where,
            include: {
                employee: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        employeeId: true,
                        designation: true,
                        photo: true,
                        branch: { select: { name: true } },
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        })

        return NextResponse.json(leaves)
    } catch (error) {
        console.error("[LEAVES_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        // Self-service: anyone WITHOUT the management permission can apply leave
        // only for their own linked employee. Role-independent.
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "leaves.view")) {
            const linkedEmployee = await prisma.employee.findUnique({ where: { userId: session.user.id } })
            if (!linkedEmployee) return new NextResponse("No employee record linked", { status: 400 })
            const body = await req.json()
            const { type, startDate, endDate, days, reason } = body
            if (!type || !startDate || !endDate || !days) {
                return new NextResponse("type, startDate, endDate and days are required", { status: 400 })
            }
            const leave = await prisma.leave.create({
                data: {
                    employeeId: linkedEmployee.id,
                    type, startDate: new Date(startDate), endDate: new Date(endDate),
                    days: parseFloat(days), reason, status: "PENDING",
                },
            })
            return NextResponse.json(leave)
        }

        const body = await req.json()
        const { employeeId, type, startDate, endDate, days, reason } = body

        if (!employeeId || !type || !startDate || !endDate || !days) {
            return new NextResponse("employeeId, type, startDate, endDate and days are required", { status: 400 })
        }

        const leave = await prisma.leave.create({
            data: {
                employeeId,
                type,
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                days: parseFloat(days),
                reason,
                status: "PENDING",
            },
        })

        return NextResponse.json(leave)
    } catch (error) {
        console.error("[LEAVES_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
