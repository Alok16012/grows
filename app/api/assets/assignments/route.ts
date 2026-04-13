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
        const employeeId = searchParams.get("employeeId")
        const assetId = searchParams.get("assetId")
        const isActiveParam = searchParams.get("isActive")
        const search = searchParams.get("search")

        const where: Record<string, unknown> = {}
        if (employeeId) where.employeeId = employeeId
        if (assetId) where.assetId = assetId
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
            orderBy: { issuedAt: "desc" },
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

        return NextResponse.json(assignments)
    } catch (error) {
        console.error("[ASSET_ASSIGNMENTS_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
