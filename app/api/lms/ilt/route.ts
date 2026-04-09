import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { resolveUserId } from "@/lib/resolveUserId"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const { searchParams } = new URL(req.url)
        const status = searchParams.get("status")
        const upcoming = searchParams.get("upcoming") === "true"

        const where: Record<string, unknown> = {}
        if (status) where.status = status
        if (upcoming) where.startTime = { gte: new Date() }

        const sessions = await prisma.iLTSession.findMany({
            where,
            orderBy: { startTime: "asc" },
            include: {
                _count: { select: { attendances: true } },
                attendances: {
                    where: { employeeId: session.user.id },
                    select: { status: true },
                },
            },
        })

        return NextResponse.json(sessions.map(s => ({
            ...s,
            userAttended: s.attendances[0]?.status === "PRESENT",
            seatsFilled: s._count.attendances,
        })))
    } catch (error) {
        console.error("[ILT_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }
        // Resolve real DB user ID
        const actorId = await resolveUserId(session)
        if (!actorId) return NextResponse.json({ error: "User not found. Please log in again." }, { status: 403 })


        const body = await req.json()
        const { title, description, instructorId, courseId, location, startTime, endTime, maxSeats, employeeIds } = body

        if (!title || !startTime || !endTime) {
            return new NextResponse("title, startTime, and endTime are required", { status: 400 })
        }

        const ilt = await prisma.iLTSession.create({
            data: {
                title,
                description: description || null,
                instructorId: instructorId || session.user.id,
                courseId: courseId || null,
                location: location || null,
                startTime: new Date(startTime),
                endTime: new Date(endTime),
                maxSeats: maxSeats ? parseInt(maxSeats) : 20,
                createdBy: actorId!,
            },
        })

        if (employeeIds && Array.isArray(employeeIds)) {
            await prisma.iLTAttendance.createMany({
                data: employeeIds.map((empId: string) => ({
                    sessionId: ilt.id,
                    employeeId: empId,
                    status: "PENDING",
                })),
            })
        }

        return NextResponse.json(ilt)
    } catch (error) {
        console.error("[ILT_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
