import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { checkAccess } from "@/lib/permissions"
import { buildRegister } from "@/lib/attendance-register"

// GET /api/attendance/register?month=YYYY-MM[&siteId=…]
// The month's muster roll. Without attendance.view the caller gets only their
// own row — the same register their manager sees, so the two never disagree.
export async function GET(req: Request) {
    const session = await getApiSession(req)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })

    try {
        const { searchParams } = new URL(req.url)
        const m = /^(\d{4})-(\d{2})$/.exec(searchParams.get("month") || "")
        if (!m) return new NextResponse("month=YYYY-MM is required", { status: 400 })
        const year = Number(m[1]), month = Number(m[2])
        if (month < 1 || month > 12) return new NextResponse("Invalid month", { status: 400 })

        if (checkAccess(session, [], "attendance.view")) {
            return NextResponse.json(await buildRegister({ year, month, siteId: searchParams.get("siteId") }))
        }
        const me = await prisma.employee.findUnique({ where: { userId: session.user.id }, select: { id: true } })
        if (!me) return new NextResponse("No employee record linked to your login", { status: 404 })
        return NextResponse.json(await buildRegister({ year, month, employeeIds: [me.id] }))
    } catch (error) {
        console.error("[ATTENDANCE_REGISTER]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
