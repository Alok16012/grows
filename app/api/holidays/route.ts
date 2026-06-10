import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { getApiSession } from "@/lib/apiSession"
import { checkAccess } from "@/lib/permissions"
import { resolveUserId } from "@/lib/resolveUserId"
import { audienceWhere, cleanIdArray } from "@/lib/audience"

// GET — users see holidays targeted at their site/role. Optional ?year=YYYY.
// Managers/admins see all (audienceWhere → null).
export async function GET(req: Request) {
    const session = await getApiSession(req)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })

    const { searchParams } = new URL(req.url)
    const year = searchParams.get("year")
    const where: Record<string, unknown> = {}
    if (year && /^\d{4}$/.test(year)) {
        const y = parseInt(year)
        where.date = { gte: new Date(y, 0, 1), lt: new Date(y + 1, 0, 1) }
    }
    const aud = await audienceWhere(session)
    if (aud) Object.assign(where, aud)

    try {
        const holidays = await prisma.holiday.findMany({ where, orderBy: { date: "asc" } })
        return NextResponse.json(holidays)
    } catch (err: any) {
        const msg = String(err?.message || "")
        if (msg.includes("does not exist") || err?.code === "P2021" || err?.code === "P2022") {
            return NextResponse.json([])
        }
        console.error("[HOLIDAYS_GET]", err)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

// POST — add a holiday (management permission only).
export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "announcements.manage")) {
        return new NextResponse("Forbidden", { status: 403 })
    }
    const body = await req.json().catch(() => ({}))
    const { name, date, type, description, targetSiteIds, targetRoleIds } = body
    if (!name || !date) {
        return new NextResponse("name and date are required", { status: 400 })
    }
    const createdBy = session ? await resolveUserId(session) : null
    const holiday = await prisma.holiday.create({
        data: {
            name,
            date: new Date(date),
            type: type || "PUBLIC",
            description: description || null,
            createdBy: createdBy ?? null,
            targetSiteIds: cleanIdArray(targetSiteIds),
            targetRoleIds: cleanIdArray(targetRoleIds),
        },
    })
    return NextResponse.json(holiday)
}
