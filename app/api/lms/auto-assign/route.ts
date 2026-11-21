import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { assignByRules } from "@/lib/lms-auto"

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "lms.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { employeeId } = body

        if (!employeeId) return new NextResponse("employeeId is required", { status: 400 })

        const exists = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } })
        if (!exists) return new NextResponse("Employee not found", { status: 404 })
        const { created, total } = await assignByRules([employeeId], { enrolledBy: session.user.id })
        const ids = created.get(employeeId) ?? []
        const courses = ids.length ? await prisma.course.findMany({ where: { id: { in: ids } }, select: { title: true } }) : []
        return NextResponse.json({ enrolled: total, courses: courses.map(c => c.title) })
    } catch (error) {
        console.error("[LMS_AUTO_ASSIGN]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
