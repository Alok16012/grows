import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { resolveUserId } from "@/lib/resolveUserId"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "assets.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const search = searchParams.get("search")
        const category = searchParams.get("category")
        const isActiveParam = searchParams.get("isActive")

        const where: Record<string, unknown> = {}
        if (category && category !== "All") where.category = category
        if (isActiveParam !== null && isActiveParam !== "") {
            where.isActive = isActiveParam === "true"
        }
        if (search) {
            where.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { assetCode: { contains: search, mode: "insensitive" } },
                { serialNo: { contains: search, mode: "insensitive" } },
            ]
        }

        const assets = await prisma.asset.findMany({
            where,
            orderBy: { createdAt: "desc" },
            include: {
                _count: {
                    select: { assignments: { where: { isActive: true } } }
                }
            }
        })

        return NextResponse.json(assets)
    } catch (error) {
        console.error("[ASSETS_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "assets.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }
        // Resolve real DB user ID
        const actorId = await resolveUserId(session)
        if (!actorId) return NextResponse.json({ error: "User not found. Please log in again." }, { status: 403 })


        const body = await req.json()
        const { name, category, description, serialNo, quantity, condition, purchaseDate, purchaseCost, vendor, location } = body

        if (!name || !category) {
            return new NextResponse("name and category are required", { status: 400 })
        }

        const qty = parseInt(quantity ?? "1")
        if (isNaN(qty) || qty < 1) {
            return new NextResponse("quantity must be a positive integer", { status: 400 })
        }

        // Auto-generate assetCode AST-NNNN
        const lastAsset = await prisma.asset.findFirst({
            orderBy: { assetCode: "desc" },
            select: { assetCode: true }
        })
        let nextNum = 1
        if (lastAsset?.assetCode) {
            const match = lastAsset.assetCode.match(/AST-(\d+)/)
            if (match) nextNum = parseInt(match[1]) + 1
        }
        const assetCode = `AST-${String(nextNum).padStart(4, "0")}`

        const asset = await prisma.asset.create({
            data: {
                assetCode,
                name,
                category,
                description: description || null,
                serialNo: serialNo || null,
                quantity: qty,
                available: qty,
                condition: condition || "NEW",
                purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
                purchaseCost: purchaseCost ? parseFloat(purchaseCost) : null,
                vendor: vendor || null,
                location: location || null,
                createdBy: actorId!,
            },
        })

        return NextResponse.json(asset)
    } catch (error) {
        console.error("[ASSETS_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
