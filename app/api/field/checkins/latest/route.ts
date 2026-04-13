import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET() {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        // Get all active employees
        const employees = await prisma.employee.findMany({
            where: { status: "ACTIVE" },
            select: {
                id: true,
                employeeId: true,
                firstName: true,
                lastName: true,
                photo: true,
                designation: true,
            },
        })

        // Get latest check-in per employee
        const latestCheckIns = await Promise.all(
            employees.map(async (emp) => {
                const lastCheckIn = await prisma.fieldCheckIn.findFirst({
                    where: { employeeId: emp.id },
                    orderBy: { checkedInAt: "desc" },
                })

                let siteName: string | null = null
                if (lastCheckIn?.siteId) {
                    const site = await prisma.site.findUnique({
                        where: { id: lastCheckIn.siteId },
                        select: { name: true },
                    })
                    siteName = site?.name || null
                }

                // Check if checked in today
                const todayStart = new Date()
                todayStart.setHours(0, 0, 0, 0)
                const checkedInToday = lastCheckIn
                    ? lastCheckIn.checkedInAt >= todayStart
                    : false

                return {
                    employee: emp,
                    lastCheckIn: lastCheckIn
                        ? { ...lastCheckIn, siteName }
                        : null,
                    checkedInToday,
                }
            })
        )

        return NextResponse.json(latestCheckIns)
    } catch (error) {
        console.error("[FIELD_CHECKINS_LATEST_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
