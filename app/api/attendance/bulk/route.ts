import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { date, records } = body as {
            date: string
            records: Array<{ employeeId: string; status: string }>
        }

        if (!date || !Array.isArray(records) || records.length === 0) {
            return new NextResponse("date and records[] are required", { status: 400 })
        }

        const attendanceDate = new Date(date)
        const nextDay = new Date(attendanceDate)
        nextDay.setDate(nextDay.getDate() + 1)

        const results = await Promise.all(
            records.map(async (rec) => {
                const existing = await prisma.attendance.findFirst({
                    where: {
                        employeeId: rec.employeeId,
                        date: { gte: attendanceDate, lt: nextDay },
                    },
                })

                if (existing) {
                    return prisma.attendance.update({
                        where: { id: existing.id },
                        data: {
                            status: rec.status,
                            markedBy: session.user.id,
                        },
                    })
                } else {
                    return prisma.attendance.create({
                        data: {
                            employeeId: rec.employeeId,
                            date: attendanceDate,
                            status: rec.status,
                            markedBy: session.user.id,
                        },
                    })
                }
            })
        )

        return NextResponse.json({ count: results.length, records: results })
    } catch (error) {
        console.error("[ATTENDANCE_BULK_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
