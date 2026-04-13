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
        const { employeeAssetId, returnCondition, notes, returnedAt } = body

        if (!employeeAssetId) {
            return new NextResponse("employeeAssetId is required", { status: 400 })
        }

        const empAsset = await prisma.employeeAsset.findUnique({
            where: { id: employeeAssetId },
            include: { asset: true },
        })
        if (!empAsset) return new NextResponse("Assignment not found", { status: 404 })
        if (!empAsset.isActive) return new NextResponse("Asset already returned", { status: 400 })
        if (empAsset.assetId !== params.id) return new NextResponse("Asset ID mismatch", { status: 400 })

        // Determine if asset condition should be downgraded
        const assetUpdate: Record<string, unknown> = { available: { increment: 1 } }
        if (returnCondition === "DAMAGED" || returnCondition === "LOST") {
            assetUpdate.condition = returnCondition
        }

        const [assignment] = await prisma.$transaction([
            prisma.employeeAsset.update({
                where: { id: employeeAssetId },
                data: {
                    isActive: false,
                    returnedAt: returnedAt ? new Date(returnedAt) : new Date(),
                    returnedTo: session.user.id,
                    returnCondition: returnCondition || null,
                    notes: notes || empAsset.notes || null,
                },
                include: {
                    employee: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            employeeId: true,
                        },
                    },
                    asset: {
                        select: {
                            id: true,
                            assetCode: true,
                            name: true,
                        },
                    },
                },
            }),
            prisma.asset.update({
                where: { id: params.id },
                data: assetUpdate,
            }),
        ])

        return NextResponse.json(assignment)
    } catch (error) {
        console.error("[ASSET_RETURN_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
