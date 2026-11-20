import { getServerSession } from "next-auth"
import { attendanceTimeError, postedSites } from "@/lib/attendance-guard"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { dayWindow } from "@/lib/attendance-policy"
import { isValidAttendanceStatus } from "@/lib/attendance-today"

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "attendance.manage")) {
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
        if (records.some(r => !r?.employeeId || !isValidAttendanceStatus(r.status))) {
            return new NextResponse("Invalid status", { status: 400 })
        }

        const attendanceDate = new Date(String(date).slice(0, 10) + "T00:00:00.000Z")
        const timeErr = attendanceTimeError(attendanceDate, null, null)
        if (timeErr) return new NextResponse(timeErr, { status: 400 })
        const sites = await postedSites(records.map(r => r.employeeId))

        const results = await Promise.all(
            records.map(async (rec) => {
                const existing = await prisma.attendance.findFirst({
                    where: {
                        employeeId: rec.employeeId,
                        date: dayWindow(attendanceDate),
                    },
                })

                if (existing) {
                    return prisma.attendance.update({
                        where: { id: existing.id },
                        data: {
                            status: rec.status,
                            markedBy: session.user.id,
                            ...(existing.siteId ? {} : { siteId: sites.get(rec.employeeId) ?? null }),
                        },
                    })
                } else {
                    return prisma.attendance.create({
                        data: {
                            employeeId: rec.employeeId,
                            siteId: sites.get(rec.employeeId) ?? null,
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
