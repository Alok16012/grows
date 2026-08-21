import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "assets.view")) {
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
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "assets.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { employeeId, assetId, condition, notes } = body

        if (!employeeId || !assetId) {
            return new NextResponse("employeeId and assetId are required", { status: 400 })
        }

        // Atomically check availability and decrement in one SQL step to
        // prevent race conditions where two concurrent requests could both
        // pass the check-then-act pattern.
        const assetAfter = (await prisma.$queryRaw`
            UPDATE "Asset"
            SET "available" = "available" - 1
            WHERE id = ${assetId} AND "available" > 0
            RETURNING "available"
        `) as { available: number }[]
        if (assetAfter.length === 0 || assetAfter[0].available < 0) {
            return new NextResponse("No available stock for this asset", { status: 400 })
        }

        // Check for duplicate active assignment to the same employee
        const existingAssignment = await prisma.employeeAsset.findFirst({
            where: { employeeId, assetId, isActive: true },
        })
        if (existingAssignment) {
            // Revert the decrement since we won't create a duplicate
            await prisma.asset.update({
                where: { id: assetId },
                data: { available: { increment: 1 } },
            })
            return new NextResponse("This employee already has an active assignment for this asset", { status: 400 })
        }

        const assignment = await prisma.employeeAsset.create({
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
        })

        return NextResponse.json(assignment)
    } catch (error) {
        console.error("[ASSET_ASSIGN_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
