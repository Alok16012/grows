import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { checkAccess } from "@/lib/permissions"

export const dynamic = "force-dynamic"

// Per-HR recruitment scoreboard for the admin dashboard: who recruited how many
// candidates and how many of those were onboarded (joined). Grouped by the lead
// *creator* (the HR who actually added the candidate), which is what "kisne
// recruit kiya" maps to — distinct from the assignee used on the analytics tab.
export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || !checkAccess(session, [Role.MANAGER, Role.HR_MANAGER], "recruitment.view")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const month = searchParams.get("month") // optional "YYYY-MM"

    let createdAtFilter: { gte: Date; lt: Date } | undefined
    if (month && /^\d{4}-\d{2}$/.test(month)) {
        const [y, m] = month.split("-").map(Number)
        const gte = new Date(y, m - 1, 1)
        const lt = new Date(y, m, 1)
        createdAtFilter = { gte, lt }
    }

    try {
        const leads = await prisma.lead.findMany({
            where: createdAtFilter ? { createdAt: createdAtFilter } : {},
            select: {
                status: true,
                convertedEmployeeId: true,
                creator: { select: { id: true, name: true, email: true } },
            },
        })

        const map: Record<string, {
            id: string; name: string
            recruited: number; interviewed: number; selected: number; onboarded: number
        }> = {}

        for (const l of leads) {
            const c = l.creator
            const id = c?.id ?? "unknown"
            const name = c?.name || c?.email || "Unknown"
            if (!map[id]) map[id] = { id, name, recruited: 0, interviewed: 0, selected: 0, onboarded: 0 }
            const row = map[id]
            row.recruited++
            if (l.status === "INTERVIEW_SCHEDULED" || l.status === "INTERVIEW_DONE") row.interviewed++
            if (l.status === "SELECTED" || l.status === "OFFERED") row.selected++
            // "Onboarded" = candidate actually joined (or converted to an employee).
            if (l.status === "JOINED" || l.status === "ON_SITE_JOINED" || l.convertedEmployeeId) row.onboarded++
        }

        const rows = Object.values(map)
            .map(r => ({ ...r, conversion: r.recruited > 0 ? Math.round((r.onboarded / r.recruited) * 100) : 0 }))
            .sort((a, b) => b.onboarded - a.onboarded || b.recruited - a.recruited)

        const totals = rows.reduce(
            (t, r) => ({
                recruited: t.recruited + r.recruited,
                interviewed: t.interviewed + r.interviewed,
                selected: t.selected + r.selected,
                onboarded: t.onboarded + r.onboarded,
            }),
            { recruited: 0, interviewed: 0, selected: 0, onboarded: 0 }
        )

        return NextResponse.json({ rows, totals })
    } catch (err) {
        console.error("[ADMIN_RECRUITMENT_SUMMARY]", err)
        return NextResponse.json({ error: "Failed to load recruitment summary" }, { status: 500 })
    }
}
