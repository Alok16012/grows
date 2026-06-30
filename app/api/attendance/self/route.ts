import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const employee = await prisma.employee.findUnique({ where: { userId: session.user.id } })
        if (!employee) return new NextResponse("No linked employee record", { status: 404 })

        const { searchParams } = new URL(req.url)
        const monthParam = searchParams.get("month") // YYYY-MM

        const now = new Date()
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1)

        const [todayRecord, monthRecords] = await Promise.all([
            prisma.attendance.findFirst({
                where: { employeeId: employee.id, date: { gte: todayStart, lt: todayEnd } },
                include: { site: { select: { id: true, name: true } } },
            }),
            prisma.attendance.findMany({
                where: {
                    employeeId: employee.id,
                    date: monthParam
                        ? {
                            gte: new Date(parseInt(monthParam.split("-")[0]), parseInt(monthParam.split("-")[1]) - 1, 1),
                            lt: new Date(parseInt(monthParam.split("-")[0]), parseInt(monthParam.split("-")[1]), 1),
                          }
                        : {
                            gte: new Date(now.getFullYear(), now.getMonth(), 1),
                            lt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
                          },
                },
                include: { site: { select: { id: true, name: true } } },
                orderBy: { date: "asc" },
            }),
        ])

        return NextResponse.json({ employee, todayRecord, monthRecords })
    } catch (error) {
        console.error("[ATTENDANCE_SELF_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const employee = await prisma.employee.findUnique({ where: { userId: session.user.id } })
        if (!employee) return new NextResponse("No linked employee record found", { status: 404 })

        const body = await req.json()
        const { action, lat, lng } = body // action: "checkin" | "checkout"

        const now = new Date()
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1)

        const existing = await prisma.attendance.findFirst({
            where: { employeeId: employee.id, date: { gte: todayStart, lt: todayEnd } },
        })

        if (action === "checkin") {
            if (existing?.checkIn) return new NextResponse("Already checked in today", { status: 400 })

            let attendance
            if (existing) {
                attendance = await prisma.attendance.update({
                    where: { id: existing.id },
                    data: { checkIn: now, checkInLat: lat ?? null, checkInLng: lng ?? null, status: "PRESENT", markedBy: session.user.id },
                })
            } else {
                attendance = await prisma.attendance.create({
                    data: {
                        employeeId: employee.id,
                        date: todayStart,
                        checkIn: now,
                        checkInLat: lat ?? null,
                        checkInLng: lng ?? null,
                        status: "PRESENT",
                        markedBy: session.user.id,
                    },
                })
            }
            return NextResponse.json(attendance)
        }

        if (action === "checkout") {
            if (!existing?.checkIn) return new NextResponse("No check-in found for today", { status: 400 })
            if (existing.checkOut) return new NextResponse("Already checked out today", { status: 400 })

            const diff = now.getTime() - new Date(existing.checkIn).getTime()
            const workingHrs = Math.round((diff / (1000 * 60 * 60)) * 100) / 100

            const attendance = await prisma.attendance.update({
                where: { id: existing.id },
                data: { checkOut: now, checkOutLat: lat ?? null, checkOutLng: lng ?? null, workingHrs, markedBy: session.user.id },
            })
            return NextResponse.json(attendance)
        }

        return new NextResponse("Invalid action. Use 'checkin' or 'checkout'", { status: 400 })
    } catch (error) {
        console.error("[ATTENDANCE_SELF_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
