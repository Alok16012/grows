import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const asset = await prisma.asset.findUnique({
            where: { id: params.id },
            include: {
                assignments: {
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
                    },
                },
            },
        })

        if (!asset) return new NextResponse("Asset not found", { status: 404 })
        return NextResponse.json(asset)
    } catch (error) {
        console.error("[ASSET_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

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

        const body = await req.json()
        const { name, category, description, serialNo, quantity, condition, purchaseDate, purchaseCost, vendor, location, isActive } = body

        const existing = await prisma.asset.findUnique({ where: { id: params.id } })
        if (!existing) return new NextResponse("Asset not found", { status: 404 })

        const updateData: Record<string, unknown> = {}
        if (name !== undefined) updateData.name = name
        if (category !== undefined) updateData.category = category
        if (description !== undefined) updateData.description = description || null
        if (serialNo !== undefined) updateData.serialNo = serialNo || null
        if (condition !== undefined) updateData.condition = condition
        if (purchaseDate !== undefined) updateData.purchaseDate = purchaseDate ? new Date(purchaseDate) : null
        if (purchaseCost !== undefined) updateData.purchaseCost = purchaseCost ? parseFloat(purchaseCost) : null
        if (vendor !== undefined) updateData.vendor = vendor || null
        if (location !== undefined) updateData.location = location || null
        if (isActive !== undefined) updateData.isActive = isActive
        if (quantity !== undefined) {
            const newQty = parseInt(quantity)
            if (isNaN(newQty) || newQty < 1) {
                return new NextResponse("quantity must be a positive integer", { status: 400 })
            }
            const issuedCount = existing.quantity - existing.available
            if (newQty < issuedCount) {
                return new NextResponse(`Cannot reduce quantity below issued count (${issuedCount})`, { status: 400 })
            }
            updateData.quantity = newQty
            updateData.available = newQty - issuedCount
        }

        const asset = await prisma.asset.update({
            where: { id: params.id },
            data: updateData,
        })

        return NextResponse.json(asset)
    } catch (error) {
        console.error("[ASSET_PUT]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const existing = await prisma.asset.findUnique({
            where: { id: params.id },
            include: { _count: { select: { assignments: { where: { isActive: true } } } } },
        })
        if (!existing) return new NextResponse("Asset not found", { status: 404 })
        if (existing._count.assignments > 0) {
            return new NextResponse("Cannot delete asset with active assignments", { status: 400 })
        }

        await prisma.asset.delete({ where: { id: params.id } })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[ASSET_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
