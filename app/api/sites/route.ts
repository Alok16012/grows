import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { resolveUserId } from "@/lib/resolveUserId"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const isActive = searchParams.get("isActive")
        const city = searchParams.get("city")
        const siteType = searchParams.get("siteType")
        const search = searchParams.get("search")
        const branchId = searchParams.get("branchId")

        const where: Record<string, unknown> = {}
        if (isActive !== null && isActive !== "") where.isActive = isActive === "true"
        if (city) where.city = { contains: city, mode: "insensitive" }
        if (siteType) where.siteType = siteType
        if (branchId) where.branchId = branchId
        if (search) {
            where.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { code: { contains: search, mode: "insensitive" } },
                { clientName: { contains: search, mode: "insensitive" } },
            ]
        }

        const sites = await prisma.site.findMany({
            where,
            include: {
                branch: { select: { id: true, name: true } },
                _count: {
                    select: {
                        deployments: { where: { isActive: true } },
                        attendances: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        })

        return NextResponse.json(sites)
    } catch (error) {
        console.error("[SITES_GET]", error)
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
        // Resolve real DB user ID
        const actorId = await resolveUserId(session)
        if (!actorId) return NextResponse.json({ error: "User not found. Please log in again." }, { status: 403 })


        const body = await req.json()
        const {
            name, address, city, state, pincode, branchId,
            clientName, clientId, latitude, longitude, radius,
            manpowerRequired, contactPerson, contactPhone, siteType, shift,
        } = body

        if (!name || !address || !branchId) {
            return new NextResponse("Name, address and branchId are required", { status: 400 })
        }

        // Auto-generate site code as SITE-NNNN
        const lastSite = await prisma.site.findFirst({
            where: { code: { startsWith: "SITE-" } },
            orderBy: { createdAt: "desc" },
            select: { code: true },
        })
        let nextNum = 1
        if (lastSite?.code) {
            const match = lastSite.code.match(/\d+$/)
            if (match) nextNum = parseInt(match[0]) + 1
        }
        const code = `SITE-${String(nextNum).padStart(4, "0")}`
        const existing = await prisma.site.findUnique({ where: { code } })
        const finalCode = existing ? `SITE-${String(nextNum + 1).padStart(4, "0")}` : code

        const site = await prisma.site.create({
            data: {
                name,
                code: finalCode,
                address,
                city: city || null,
                state: state || null,
                pincode: pincode || null,
                clientName: clientName || null,
                clientId: clientId || null,
                branchId,
                latitude: latitude ? parseFloat(latitude) : null,
                longitude: longitude ? parseFloat(longitude) : null,
                radius: radius ? parseFloat(radius) : 100,
                manpowerRequired: manpowerRequired ? parseInt(manpowerRequired) : 1,
                contactPerson: contactPerson || null,
                contactPhone: contactPhone || null,
                siteType: siteType || null,
                shift: shift || null,
                createdBy: actorId!,
            },
        })

        return NextResponse.json(site)
    } catch (error) {
        console.error("[SITES_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
