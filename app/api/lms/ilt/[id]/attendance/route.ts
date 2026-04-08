import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const attendances = await prisma.iLTAttendance.findMany({
            where: { sessionId: params.id },
            include: {
                employee: {
                    select: { id: true, firstName: true, lastName: true, employeeId: true, designation: true, photo: true },
                },
            },
        })

        return NextResponse.json(attendances)
    } catch (error) {
        console.error("[ILT_ATTENDANCE_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const body = await req.json()
        const { employeeIds, status } = body

        if (status === "MARK_ALL_PRESENT") {
            await prisma.iLTAttendance.updateMany({
                where: { sessionId: params.id, status: { not: "ABSENT" } },
                data: { attendedAt: new Date(), status: "PRESENT" },
            })
            return NextResponse.json({ success: true })
        }

        if (employeeIds && Array.isArray(employeeIds)) {
            await prisma.iLTAttendance.updateMany({
                where: { sessionId: params.id, employeeId: { in: employeeIds } },
                data: { attendedAt: new Date(), status: status || "PRESENT" },
            })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[ILT_ATTENDANCE_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
