import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000 // Earth radius in meters
    const toRad = (deg: number) => (deg * Math.PI) / 180
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
}

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const isAdminOrManager = checkAccess(session, ["MANAGER"], "field.view")
        if (!isAdminOrManager) return new NextResponse("Forbidden", { status: 403 })

        const { searchParams } = new URL(req.url)
        const employeeId = searchParams.get("employeeId")
        const siteId = searchParams.get("siteId")
        const date = searchParams.get("date")

        const where: Record<string, unknown> = {}
        if (employeeId) where.employeeId = employeeId
        if (siteId) where.siteId = siteId

        if (date) {
            const start = new Date(date)
            start.setHours(0, 0, 0, 0)
            const end = new Date(date)
            end.setHours(23, 59, 59, 999)
            where.checkedInAt = { gte: start, lte: end }
        }

        const checkIns = await prisma.fieldCheckIn.findMany({
            where,
            include: {
                employee: {
                    select: {
                        id: true,
                        employeeId: true,
                        firstName: true,
                        lastName: true,
                        photo: true,
                        designation: true,
                    },
                },
            },
            orderBy: { checkedInAt: "desc" },
        })

        const siteIds = [...new Set(checkIns.map((c) => c.siteId).filter(Boolean))] as string[]
        let siteMap: Record<string, string> = {}
        if (siteIds.length > 0) {
            const sites = await prisma.site.findMany({
                where: { id: { in: siteIds } },
                select: { id: true, name: true },
            })
            siteMap = Object.fromEntries(sites.map((s) => [s.id, s.name]))
        }

        const result = checkIns.map((c) => ({
            ...c,
            siteName: c.siteId ? siteMap[c.siteId] || null : null,
        }))

        return NextResponse.json(result)
    } catch (error) {
        console.error("[FIELD_CHECKINS_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const body = await req.json()
        const { employeeId, siteId, latitude, longitude, accuracy, notes } = body

        if (!employeeId || latitude === undefined || longitude === undefined) {
            return new NextResponse("employeeId, latitude and longitude are required", { status: 400 })
        }

        let isGeofenced = false
        let distanceFromSite: number | null = null

        if (siteId) {
            const site = await prisma.site.findUnique({
                where: { id: siteId },
                select: { latitude: true, longitude: true, radius: true },
            })
            if (site?.latitude && site?.longitude) {
                distanceFromSite = haversineDistance(latitude, longitude, site.latitude, site.longitude)
                isGeofenced = distanceFromSite <= (site.radius || 100)
            }
        }

        const checkIn = await prisma.fieldCheckIn.create({
            data: {
                employeeId,
                siteId: siteId || null,
                latitude,
                longitude,
                accuracy: accuracy || null,
                notes: notes || null,
                isGeofenced,
                distanceFromSite,
            },
            include: {
                employee: {
                    select: {
                        id: true,
                        employeeId: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
        })

        return NextResponse.json(checkIn)
    } catch (error) {
        console.error("[FIELD_CHECKINS_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
