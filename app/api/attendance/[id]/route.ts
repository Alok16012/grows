import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

function calcWorkingHrs(checkIn?: string | null, checkOut?: string | null): number {
    if (!checkIn || !checkOut) return 0
    const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime()
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
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "attendance.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { status, checkIn, checkOut, overtimeHrs, remarks } = body

        const workingHrs = calcWorkingHrs(checkIn, checkOut)

        const updated = await prisma.attendance.update({
            where: { id: params.id },
            data: {
                ...(status !== undefined && { status }),
                ...(checkIn !== undefined && { checkIn: checkIn ? new Date(checkIn) : null }),
                ...(checkOut !== undefined && { checkOut: checkOut ? new Date(checkOut) : null }),
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
        if (!checkAccess(session, [], "attendance.view")) {
            return new NextResponse("Forbidden — ADMIN only", { status: 403 })
        }

        await prisma.attendance.delete({ where: { id: params.id } })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[ATTENDANCE_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
