import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== Role.ADMIN && session.user.role !== Role.MANAGER && session.user.role !== Role.HR_MANAGER)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const [allLeads, todayLeads] = await Promise.all([
        prisma.lead.findMany({
            include: {
                assignee: { select: { id: true, name: true } },
            }
        }),
        prisma.lead.count({
            where: { createdAt: { gte: today, lt: tomorrow } }
        })
    ])

    const total = allLeads.length
    const activeLeads = allLeads.filter(l =>
        !["REJECTED", "DROPPED", "JOINED"].includes(l.status)
    ).length
    const interviews = allLeads.filter(l => l.status === "INTERVIEW_SCHEDULED").length
    const offers = allLeads.filter(l => l.status === "OFFERED").length
    const joinings = allLeads.filter(l => l.status === "JOINED").length
    const dropped = allLeads.filter(l => l.status === "DROPPED" || l.status === "REJECTED").length

    // Funnel per stage
    const stageOrder = [
        "NEW_LEAD", "CONTACTED", "INTERESTED",
        "INTERVIEW_SCHEDULED", "INTERVIEW_DONE",
        "SELECTED", "OFFERED", "JOINED",
        "REJECTED", "DROPPED"
    ]

    const funnelData = stageOrder.map((stage, idx) => {
        const count = allLeads.filter(l => l.status === stage).length
        const prevCount = idx > 0 ? allLeads.filter(l => l.status === stageOrder[idx - 1]).length : total
        const conversion = prevCount > 0 ? Math.round((count / prevCount) * 100) : 0
        return { stage, count, conversion }
    })

    // Source breakdown
    const sourceMap: Record<string, number> = {}
    allLeads.forEach(l => {
        sourceMap[l.source] = (sourceMap[l.source] ?? 0) + 1
    })
    const sourceBreakdown = Object.entries(sourceMap).map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)

    // Recruiter performance
    const recruiterMap: Record<string, { id: string; name: string; leads: number; interviews: number; joinings: number }> = {}
    allLeads.forEach(l => {
        if (l.assignee) {
            if (!recruiterMap[l.assignee.id]) {
                recruiterMap[l.assignee.id] = { id: l.assignee.id, name: l.assignee.name, leads: 0, interviews: 0, joinings: 0 }
            }
            recruiterMap[l.assignee.id].leads++
            if (l.status === "INTERVIEW_SCHEDULED" || l.status === "INTERVIEW_DONE") {
                recruiterMap[l.assignee.id].interviews++
            }
            if (l.status === "JOINED") {
                recruiterMap[l.assignee.id].joinings++
            }
        }
    })
    const recruiterPerformance = Object.values(recruiterMap).map(r => ({
        ...r,
        conversion: r.leads > 0 ? Math.round((r.joinings / r.leads) * 100) : 0
    })).sort((a, b) => b.joinings - a.joinings)

    return NextResponse.json({
        summary: { total, todayLeads, activeLeads, interviews, offers, joinings, dropped },
        funnelData,
        sourceBreakdown,
        recruiterPerformance
    })
}
