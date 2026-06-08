import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

// Self-service attendance punch — any logged-in user with a linked employee
// record can check in / out for THEMSELVES only. No management permission needed
// (it's their own attendance); the employee is always resolved from the session.

function dayRange(d = new Date()) {
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    return { start, end }
}

async function linkedEmployee(userId: string) {
    return prisma.employee.findFirst({ where: { userId }, select: { id: true } })
}

// GET — today's attendance record for the signed-in employee (or null)
export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })

    const emp = await linkedEmployee(session.user.id)
    if (!emp) return NextResponse.json({ employee: null, today: null })

    const { start, end } = dayRange()
    const today = await prisma.attendance.findFirst({
        where: { employeeId: emp.id, date: { gte: start, lt: end } },
        select: { id: true, date: true, checkIn: true, checkOut: true, status: true, workingHrs: true },
    })

    return NextResponse.json({ employee: emp, today })
}

// POST — punch in/out. Body: { action: "in" | "out", lat?, lng? }
export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })

    const emp = await linkedEmployee(session.user.id)
    if (!emp) return new NextResponse("No employee record linked to your account", { status: 400 })

    const body = await req.json().catch(() => ({}))
    const action = body?.action
    if (action !== "in" && action !== "out") {
        return new NextResponse("action must be 'in' or 'out'", { status: 400 })
    }
    const lat = typeof body?.lat === "number" ? body.lat : null
    const lng = typeof body?.lng === "number" ? body.lng : null

    const now = new Date()
    const { start, end } = dayRange(now)
    const existing = await prisma.attendance.findFirst({
        where: { employeeId: emp.id, date: { gte: start, lt: end } },
    })

    if (action === "in") {
        if (existing?.checkIn) {
            return new NextResponse("Already checked in today", { status: 409 })
        }
        const record = existing
            ? await prisma.attendance.update({
                where: { id: existing.id },
                data: { checkIn: now, status: "PRESENT", checkInLat: lat, checkInLng: lng, markedBy: session.user.id },
            })
            : await prisma.attendance.create({
                data: {
                    employeeId: emp.id, date: start, checkIn: now, status: "PRESENT",
                    checkInLat: lat, checkInLng: lng, markedBy: session.user.id,
                },
            })
        return NextResponse.json(record)
    }

    // action === "out"
    if (!existing?.checkIn) {
        return new NextResponse("Check in first before checking out", { status: 409 })
    }
    if (existing.checkOut) {
        return new NextResponse("Already checked out today", { status: 409 })
    }
    const diff = now.getTime() - new Date(existing.checkIn).getTime()
    const workingHrs = diff > 0 ? Math.round((diff / (1000 * 60 * 60)) * 100) / 100 : 0
    const record = await prisma.attendance.update({
        where: { id: existing.id },
        data: { checkOut: now, checkOutLat: lat, checkOutLng: lng, workingHrs, markedBy: session.user.id },
    })
    return NextResponse.json(record)
}
