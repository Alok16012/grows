import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

export async function GET() {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "field.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        // Get all active employees
        const employees = await prisma.employee.findMany({
            where: { status: "ACTIVE" },
            select: {
                id: true,
                employeeId: true,
                firstName: true,
                lastName: true,
                photo: true,
                designation: true,
            },
        })

        // Latest check-in per employee in ONE query. Doing this per-employee
        // meant 2N+1 round trips, which also exhausted the connection pool and
        // stalled unrelated requests.
        //
        // DISTINCT ON rather than Prisma's `distinct`: the latter de-duplicates
        // in the client, so it would still pull every historical check-in row
        // for these employees over the wire just to keep the newest one.
        type CheckInRow = {
            id: string
            employeeId: string
            siteId: string | null
            latitude: number
            longitude: number
            accuracy: number | null
            checkedInAt: Date
            notes: string | null
            isGeofenced: boolean
            distanceFromSite: number | null
        }
        const employeeIds = employees.map(e => e.id)
        const checkIns: CheckInRow[] = employeeIds.length
            ? await prisma.$queryRaw<CheckInRow[]>`
                SELECT DISTINCT ON ("employeeId")
                    "id", "employeeId", "siteId", "latitude", "longitude",
                    "accuracy", "checkedInAt", "notes", "isGeofenced", "distanceFromSite"
                FROM "FieldCheckIn"
                WHERE "employeeId" = ANY(${employeeIds}::text[])
                ORDER BY "employeeId", "checkedInAt" DESC
            `
            : []

        const siteIds = Array.from(
            new Set(checkIns.map(c => c.siteId).filter((id): id is string => !!id))
        )
        const sites = siteIds.length
            ? await prisma.site.findMany({
                where: { id: { in: siteIds } },
                select: { id: true, name: true },
            })
            : []

        const siteNameById = new Map(sites.map(s => [s.id, s.name]))
        const checkInByEmployee = new Map(checkIns.map(c => [c.employeeId, c]))

        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)

        const latestCheckIns = employees.map(emp => {
            const lastCheckIn = checkInByEmployee.get(emp.id) ?? null
            return {
                employee: emp,
                lastCheckIn: lastCheckIn
                    ? { ...lastCheckIn, siteName: lastCheckIn.siteId ? (siteNameById.get(lastCheckIn.siteId) ?? null) : null }
                    : null,
                checkedInToday: lastCheckIn ? lastCheckIn.checkedInAt >= todayStart : false,
            }
        })

        return NextResponse.json(latestCheckIns)
    } catch (error) {
        console.error("[FIELD_CHECKINS_LATEST_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
