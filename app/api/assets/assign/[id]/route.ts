import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function PUT(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const existing = await prisma.employeeAsset.findUnique({
            where: { id: params.id },
        })
        if (!existing) return new NextResponse("Assignment not found", { status: 404 })
        if (!existing.isActive) {
            return new NextResponse("Asset has already been returned", { status: 400 })
        }

        const [assignment] = await prisma.$transaction([
            prisma.employeeAsset.update({
                where: { id: params.id },
                data: { returnedAt: new Date(), isActive: false },
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
                where: { id: existing.assetId },
                data: { available: { increment: 1 } },
            }),
        ])

        return NextResponse.json(assignment)
    } catch (error) {
        console.error("[ASSET_RETURN_PUT]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
