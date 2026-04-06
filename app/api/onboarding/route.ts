import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

const DEFAULT_TASKS = [
    { title: "Collect Aadhar Card", category: "Documents", order: 1 },
    { title: "Collect PAN Card", category: "Documents", order: 2 },
    { title: "Collect Bank Details", category: "Documents", order: 3 },
    { title: "Collect Passport Photo", category: "Documents", order: 4 },
    { title: "Sign Offer Letter", category: "Documents", order: 5 },
    { title: "Sign NDA / Agreement", category: "Documents", order: 6 },
    { title: "Issue ID Card", category: "Welcome Kit", order: 7 },
    { title: "Issue Uniform", category: "Welcome Kit", order: 8 },
    { title: "Site/Location Briefing", category: "Orientation", order: 9 },
    { title: "Safety Training", category: "Training", order: 10 },
    { title: "Role & Responsibility Briefing", category: "Orientation", order: 11 },
    { title: "Add to Attendance System", category: "IT Setup", order: 12 },
    { title: "PF Registration", category: "Compliance", order: 13 },
    { title: "ESI Registration", category: "Compliance", order: 14 },
]

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const status = searchParams.get("status")
        const search = searchParams.get("search")

        const where: Record<string, unknown> = {}
        if (status && status !== "ALL") where.status = status

        if (search) {
            where.employee = {
                OR: [
                    { firstName: { contains: search, mode: "insensitive" } },
                    { lastName: { contains: search, mode: "insensitive" } },
                    { employeeId: { contains: search, mode: "insensitive" } },
                ],
            }
        }

        const records = await prisma.onboardingRecord.findMany({
            where,
            include: {
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
                tasks: {
                    select: { id: true, status: true, category: true, isRequired: true },
                },
            },
            orderBy: { createdAt: "desc" },
        })

        return NextResponse.json(records)
    } catch (error) {
        console.error("[ONBOARDING_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { employeeId, assignedTo, notes } = body

        if (!employeeId) {
            return new NextResponse("employeeId is required", { status: 400 })
        }

        const existing = await prisma.onboardingRecord.findUnique({ where: { employeeId } })
        if (existing) {
            return new NextResponse("Onboarding already started for this employee", { status: 400 })
        }

        const employee = await prisma.employee.findUnique({ where: { id: employeeId } })
        if (!employee) return new NextResponse("Employee not found", { status: 404 })

        const record = await prisma.onboardingRecord.create({
            data: {
                employeeId,
                status: "IN_PROGRESS",
                startedAt: new Date(),
                assignedTo: assignedTo || null,
                notes: notes || null,
                tasks: {
                    create: DEFAULT_TASKS.map(t => ({
                        employeeId,
                        title: t.title,
                        category: t.category,
                        order: t.order,
                        status: "PENDING" as const,
                        isRequired: true,
                    })),
                },
            },
            include: {
                tasks: true,
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

        return NextResponse.json(record)
    } catch (error) {
        console.error("[ONBOARDING_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
