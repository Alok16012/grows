import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { canView, getRecSettings } from "@/lib/recruitment-server"

export const dynamic = "force-dynamic"

// GET — what a candidate can be linked to: open job openings and approved manpower requests, plus sites and scorecard items.
export async function GET(req: Request) {
    const s = await getApiSession(req)
    if (!s || !canView(s)) return NextResponse.json({ error: "No access" }, { status: 403 })
    const [jobs, requests, sites, settings] = await Promise.all([
        prisma.jobPosting.findMany({ where: { status: { in: ["PUBLISHED", "DRAFT"] } }, select: { id: true, title: true, siteName: true, status: true, openings: true }, orderBy: { createdAt: "desc" }, take: 200 }),
        prisma.manpowerRequest.findMany({ where: { status: "APPROVED" }, select: { id: true, reqNo: true, position: true, siteName: true, siteId: true, headcount: true, jobId: true }, orderBy: { createdAt: "desc" }, take: 200 }),
        prisma.site.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
        getRecSettings(),
    ])
    return NextResponse.json({ jobs, requests, sites, scoreItems: settings.scoreItems })
}
