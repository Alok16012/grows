import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { checkAccess } from "@/lib/permissions"

// Work-anniversary corner — active employees whose joining-date anniversary
// falls today or within the next N days (default 14), with the number of years
// completed. Mirrors /api/birthdays. Phone (for the "Congratulate on WhatsApp"
// action) is only included for users who can view employees. Employees in their
// first year (0 completed years) are excluded.
export async function GET(req: Request) {
    const session = await getApiSession(req)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })

    const { searchParams } = new URL(req.url)
    const windowDays = Math.min(60, Math.max(1, parseInt(searchParams.get("days") ?? "14")))
    const canSeePhone = checkAccess(session, [], "employees.view")

    try {
        const employees = await prisma.employee.findMany({
            where: { status: "ACTIVE", dateOfJoining: { not: null } },
            select: {
                id: true, firstName: true, lastName: true, photo: true, designation: true, phone: true,
                dateOfJoining: true,
                department: { select: { name: true } },
            },
        })

        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const items = employees
            .map((e) => {
                const doj = new Date(e.dateOfJoining as Date)
                const month = doj.getMonth()
                const day = doj.getDate()
                let next = new Date(today.getFullYear(), month, day)
                if (next < today) next = new Date(today.getFullYear() + 1, month, day)
                const inDays = Math.round((next.getTime() - today.getTime()) / 86400000)
                const years = next.getFullYear() - doj.getFullYear()
                return {
                    id: e.id,
                    name: `${e.firstName} ${e.lastName ?? ""}`.trim(),
                    photo: e.photo,
                    designation: e.designation,
                    department: e.department?.name ?? null,
                    phone: canSeePhone ? e.phone : null,
                    day,
                    month,
                    years,
                    isToday: inDays === 0,
                    inDays,
                }
            })
            .filter((x) => x.years >= 1 && x.inDays <= windowDays)
            .sort((a, b) => a.inDays - b.inDays)

        return NextResponse.json({
            todayCount: items.filter((x) => x.isToday).length,
            anniversaries: items,
        })
    } catch (err: any) {
        const msg = String(err?.message || "")
        if (msg.includes("does not exist") || err?.code === "P2021" || err?.code === "P2022") {
            return NextResponse.json({ todayCount: 0, anniversaries: [] })
        }
        console.error("[ANNIVERSARIES_GET]", err)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
