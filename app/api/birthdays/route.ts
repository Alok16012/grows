import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { checkAccess } from "@/lib/permissions"

// Birthday corner — active employees whose birthday falls today or within the
// next N days (default 14). Any signed-in user may see it (it's a social board),
// but the phone number (used for the "Wish on WhatsApp" action) is only included
// for users who can view employees, to avoid broadly exposing contact details.
// Only month/day are returned — never the birth year — so ages aren't leaked.
export async function GET(req: Request) {
    const session = await getApiSession(req)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })

    const { searchParams } = new URL(req.url)
    const windowDays = Math.min(60, Math.max(1, parseInt(searchParams.get("days") ?? "14")))
    const canSeePhone = checkAccess(session, [], "employees.view")

    try {
        const employees = await prisma.employee.findMany({
            where: { status: "ACTIVE", dateOfBirth: { not: null } },
            select: {
                id: true, firstName: true, lastName: true, photo: true, designation: true, phone: true,
                dateOfBirth: true,
                department: { select: { name: true } },
            },
        })

        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const items = employees
            .map((e) => {
                const dob = new Date(e.dateOfBirth as Date)
                const month = dob.getMonth()
                const day = dob.getDate()
                // Next occurrence of this month/day from today (handles year wrap).
                let next = new Date(today.getFullYear(), month, day)
                if (next < today) next = new Date(today.getFullYear() + 1, month, day)
                const inDays = Math.round((next.getTime() - today.getTime()) / 86400000)
                return {
                    id: e.id,
                    name: `${e.firstName} ${e.lastName ?? ""}`.trim(),
                    photo: e.photo,
                    designation: e.designation,
                    department: e.department?.name ?? null,
                    phone: canSeePhone ? e.phone : null,
                    day,
                    month,
                    isToday: inDays === 0,
                    inDays,
                }
            })
            .filter((x) => x.inDays <= windowDays)
            .sort((a, b) => a.inDays - b.inDays)

        return NextResponse.json({
            todayCount: items.filter((x) => x.isToday).length,
            birthdays: items,
        })
    } catch (err: any) {
        const msg = String(err?.message || "")
        if (msg.includes("does not exist") || err?.code === "P2021" || err?.code === "P2022") {
            return NextResponse.json({ todayCount: 0, birthdays: [] })
        }
        console.error("[BIRTHDAYS_GET]", err)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
