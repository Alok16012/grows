import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const search = searchParams.get("search")
        const isActiveParam = searchParams.get("isActive")

        const where: Record<string, unknown> = {}
        if (isActiveParam !== null && isActiveParam !== "") {
            where.isActive = isActiveParam === "true"
        }
        if (search) {
            where.OR = [
                {
                    employee: {
                        OR: [
                            { firstName: { contains: search, mode: "insensitive" } },
                            { lastName: { contains: search, mode: "insensitive" } },
                            { employeeId: { contains: search, mode: "insensitive" } },
                        ],
                    },
                },
                {
                    asset: {
                        OR: [
                            { name: { contains: search, mode: "insensitive" } },
                            { assetCode: { contains: search, mode: "insensitive" } },
                        ],
                    },
                },
            ]
        }

        const assignments = await prisma.employeeAsset.findMany({
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
                    },
                },
                asset: {
                    select: {
                        id: true,
                        assetCode: true,
                        name: true,
                        category: true,
                        serialNo: true,
                    },
                },
            },
            orderBy: { issuedAt: "desc" },
        })

        return NextResponse.json(assignments)
    } catch (error) {
        console.error("[ASSET_ASSIGN_GET]", error)
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
        const { employeeId, assetId, condition, notes } = body

        if (!employeeId || !assetId) {
            return new NextResponse("employeeId and assetId are required", { status: 400 })
        }

        // Check asset availability
        const asset = await prisma.asset.findUnique({ where: { id: assetId } })
        if (!asset) return new NextResponse("Asset not found", { status: 404 })
        if (asset.available < 1) {
            return new NextResponse("No available stock for this asset", { status: 400 })
        }

        // Check employee exists
        const employee = await prisma.employee.findUnique({ where: { id: employeeId } })
        if (!employee) return new NextResponse("Employee not found", { status: 404 })

        const [assignment] = await prisma.$transaction([
            prisma.employeeAsset.create({
                data: {
                    employeeId,
                    assetId,
                    issuedBy: session.user.id,
                    condition: condition || "GOOD",
                    notes: notes || null,
                    isActive: true,
                },
                include: {
                    employee: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            employeeId: true,
                            designation: true,
                            photo: true,
                        },
                    },
                    asset: {
                        select: {
                            id: true,
                            assetCode: true,
                            name: true,
                            category: true,
                            serialNo: true,
                        },
                    },
                },
            }),
            prisma.asset.update({
                where: { id: assetId },
                data: { available: { decrement: 1 } },
            }),
        ])

        return NextResponse.json(assignment)
    } catch (error) {
        console.error("[ASSET_ASSIGN_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
