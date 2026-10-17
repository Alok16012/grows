import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { istDateOnly, dayWindow, monthWindow } from "@/lib/attendance-policy"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const employee = await prisma.employee.findUnique({ where: { userId: session.user.id } })
        if (!employee) return new NextResponse("No linked employee record", { status: 404 })

        const { searchParams } = new URL(req.url)
        const monthParam = searchParams.get("month") // YYYY-MM

        // "Today" is the IST date — the server runs UTC on Vercel, so a
        // server-local day put early-morning check-ins on yesterday.
        const today = istDateOnly()
        const [y, m] = monthParam && /^\d{4}-\d{2}$/.test(monthParam)
            ? monthParam.split("-").map(Number)
            : [today.getUTCFullYear(), today.getUTCMonth() + 1]

        const [todayRecord, monthRecords] = await Promise.all([
            prisma.attendance.findFirst({
                where: { employeeId: employee.id, date: dayWindow(today) },
                include: { site: { select: { id: true, name: true } } },
            }),
            prisma.attendance.findMany({
                where: {
                    employeeId: employee.id,
                    date: monthWindow(y, m),
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
        const todayStart = istDateOnly(now)

        const existing = await prisma.attendance.findFirst({
            where: { employeeId: employee.id, date: dayWindow(todayStart) },
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
