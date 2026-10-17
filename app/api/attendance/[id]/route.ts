import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { isValidAttendanceStatus, parseIstDateTime } from "@/lib/attendance-today"

function calcWorkingHrs(checkIn?: Date | null, checkOut?: Date | null): number {
    if (!checkIn || !checkOut) return 0
    const diff = checkOut.getTime() - checkIn.getTime()
    if (diff <= 0) return 0
    return Math.round((diff / (1000 * 60 * 60)) * 100) / 100
}

export async function PUT(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "attendance.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { status, checkIn, checkOut, overtimeHrs, remarks } = body

        if (status !== undefined && !isValidAttendanceStatus(status)) {
            return new NextResponse("Invalid status", { status: 400 })
        }

        // Naive "YYYY-MM-DDTHH:mm:ss" from the HR form is IST wall-clock, not UTC.
        const checkInAt = parseIstDateTime(checkIn)
        const checkOutAt = parseIstDateTime(checkOut)
        const workingHrs = calcWorkingHrs(checkInAt, checkOutAt)

        const updated = await prisma.attendance.update({
            where: { id: params.id },
            data: {
                ...(status !== undefined && { status }),
                ...(checkIn !== undefined && { checkIn: checkInAt }),
                ...(checkOut !== undefined && { checkOut: checkOutAt }),
                ...(overtimeHrs !== undefined && { overtimeHrs: parseFloat(overtimeHrs) || 0 }),
                ...(remarks !== undefined && { remarks }),
                workingHrs,
                markedBy: session.user.id,
            },
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
        })

        return NextResponse.json(updated)
    } catch (error) {
        console.error("[ATTENDANCE_PUT]", error)
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
        if (!checkAccess(session, [], "attendance.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        await prisma.attendance.delete({ where: { id: params.id } })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[ATTENDANCE_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
