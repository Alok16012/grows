import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "attendance.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const employeeId = searchParams.get("employeeId")
        const dateStr = searchParams.get("date")
        const monthParam = searchParams.get("month") // YYYY-MM or numeric
        const month = searchParams.get("month")?.includes("-") ? searchParams.get("month")!.split("-")[1] : searchParams.get("month")
        const year = searchParams.get("month")?.includes("-") ? searchParams.get("month")!.split("-")[0] : searchParams.get("year")
        const branchId = searchParams.get("branchId")
        const siteId = searchParams.get("siteId")
        const status = searchParams.get("status")
        const search = searchParams.get("search")

        const where: Record<string, unknown> = {}
        if (employeeId) where.employeeId = employeeId
        if (siteId) where.siteId = siteId
        if (status) where.status = status

        if (dateStr) {
            const date = new Date(dateStr)
            const nextDay = new Date(date)
            nextDay.setDate(nextDay.getDate() + 1)
            where.date = { gte: date, lt: nextDay }
        } else if (monthParam && month && year) {
            const startDate = new Date(parseInt(year), parseInt(month) - 1, 1)
            const endDate = new Date(parseInt(year), parseInt(month), 1)
            where.date = { gte: startDate, lt: endDate }
        }

        const employeeWhere: Record<string, unknown> = {}
        if (branchId) employeeWhere.branchId = branchId
        if (search) {
            employeeWhere.OR = [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { employeeId: { contains: search, mode: "insensitive" } },
            ]
        }
        if (Object.keys(employeeWhere).length > 0) {
            where.employee = employeeWhere
        }

        const attendances = await prisma.attendance.findMany({
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
                site: { select: { id: true, name: true } },
            },
            orderBy: { date: "desc" },
        })

        return NextResponse.json(attendances)
    } catch (error) {
        console.error("[ATTENDANCE_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "attendance.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const {
            employeeId, siteId, date, checkIn, checkOut,
            checkInLat, checkInLng, checkOutLat, checkOutLng,
            status, overtimeHrs, remarks,
        } = body

        if (!employeeId || !date) {
            return new NextResponse("employeeId and date are required", { status: 400 })
        }

        const attendanceDate = new Date(date)
        const nextDay = new Date(attendanceDate)
        nextDay.setDate(nextDay.getDate() + 1)

        // Calculate working hours
        let workingHrs = 0
        if (checkIn && checkOut) {
            const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime()
            if (diff > 0) workingHrs = Math.round((diff / (1000 * 60 * 60)) * 100) / 100
        }

        // Upsert: update existing or create new
        const existing = await prisma.attendance.findFirst({
            where: {
                employeeId,
                date: { gte: attendanceDate, lt: nextDay },
            },
        })

        let attendance
        if (existing) {
            attendance = await prisma.attendance.update({
                where: { id: existing.id },
                data: {
                    siteId: siteId || null,
                    checkIn: checkIn ? new Date(checkIn) : null,
                    checkOut: checkOut ? new Date(checkOut) : null,
                    checkInLat, checkInLng, checkOutLat, checkOutLng,
                    status: status || "PRESENT",
                    overtimeHrs: overtimeHrs || 0,
                    workingHrs,
                    remarks,
                    markedBy: session.user.id,
                },
            })
        } else {
            attendance = await prisma.attendance.create({
                data: {
                    employeeId,
                    siteId: siteId || null,
                    date: attendanceDate,
                    checkIn: checkIn ? new Date(checkIn) : null,
                    checkOut: checkOut ? new Date(checkOut) : null,
                    checkInLat, checkInLng, checkOutLat, checkOutLng,
                    status: status || "PRESENT",
                    overtimeHrs: overtimeHrs || 0,
                    workingHrs,
                    remarks,
                    markedBy: session.user.id,
                },
            })
        }

        return NextResponse.json(attendance)
    } catch (error) {
        console.error("[ATTENDANCE_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
