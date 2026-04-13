import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function POST(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { employeeId, condition, notes, issuedAt } = body

        if (!employeeId) {
            return new NextResponse("employeeId is required", { status: 400 })
        }

        // Check asset availability
        const asset = await prisma.asset.findUnique({ where: { id: params.id } })
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
                    assetId: params.id,
                    issuedBy: session.user.id,
                    condition: condition || "GOOD",
                    notes: notes || null,
                    isActive: true,
                    issuedAt: issuedAt ? new Date(issuedAt) : new Date(),
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
                where: { id: params.id },
                data: { available: { decrement: 1 } },
            }),
        ])

        return NextResponse.json(assignment)
    } catch (error) {
        console.error("[ASSET_ASSIGN_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
