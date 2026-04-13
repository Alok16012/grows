import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const { searchParams } = new URL(req.url)
        const status = searchParams.get("status")
        const cycle = searchParams.get("cycle")
        const employeeId = searchParams.get("employeeId")
        const search = searchParams.get("search")

        const isAdminOrManager = session.user.role === "ADMIN" || session.user.role === "MANAGER"

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const where: Record<string, any> = {}

        if (!isAdminOrManager) {
            const emp = await prisma.employee.findFirst({
                where: { email: session.user.email ?? undefined },
                select: { id: true },
            })
            if (emp) {
                where.employeeId = emp.id
            } else {
                return NextResponse.json([])
            }
        } else {
            if (employeeId) where.employeeId = employeeId
        }

        if (status && status !== "ALL") where.status = status
        if (cycle && cycle !== "ALL") where.cycle = cycle

        if (search) {
            where.employee = {
                OR: [
                    { firstName: { contains: search, mode: "insensitive" } },
                    { lastName: { contains: search, mode: "insensitive" } },
                    { employeeId: { contains: search, mode: "insensitive" } },
                ],
            }
        }

        const reviews = await prisma.performanceReview.findMany({
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
                kpis: { select: { id: true, rating: true, kraId: true } },
                kras: { select: { id: true, title: true, weightage: true } },
            },
            orderBy: { createdAt: "desc" },
        })

        return NextResponse.json(reviews)
    } catch (error) {
        console.error("[PERFORMANCE_GET]", error)
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

        const body = await req.json()
        const { employeeId, cycle, periodStart, periodEnd, reviewerId } = body

        if (!employeeId || !cycle || !periodStart || !periodEnd) {
            return new NextResponse("employeeId, cycle, periodStart, periodEnd are required", { status: 400 })
        }

        const employee = await prisma.employee.findUnique({ where: { id: employeeId } })
        if (!employee) return new NextResponse("Employee not found", { status: 404 })

        const review = await prisma.performanceReview.create({
            data: {
                employeeId,
                reviewerId: reviewerId || session.user.id,
                cycle,
                periodStart: new Date(periodStart),
                periodEnd: new Date(periodEnd),
                status: "DRAFT",
            },
            include: {
                kpis: true,
                kras: true,
                employee: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        employeeId: true,
                        designation: true,
                    },
                },
            },
        })

        return NextResponse.json(review)
    } catch (error) {
        console.error("[PERFORMANCE_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
