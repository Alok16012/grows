import { NextResponse } from "next/server"
import { getApiSession } from "@/lib/apiSession"
import { recruitmentReport, canView } from "@/lib/recruitment-server"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD — recruiter scoreboard, sources, funnel, time to hire, open seats.
export async function GET(req: Request) {
    const s = await getApiSession(req)
    if (!s || !canView(s)) return NextResponse.json({ error: "No access" }, { status: 403 })
    const sp = new URL(req.url).searchParams
    const to = sp.get("to") ? new Date(`${sp.get("to")}T23:59:59+05:30`) : new Date()
    const from = sp.get("from") ? new Date(`${sp.get("from")}T00:00:00+05:30`) : new Date(to.getTime() - 30 * 86_400_000)
    if (isNaN(from.getTime()) || isNaN(to.getTime())) return NextResponse.json({ error: "Pick valid dates" }, { status: 400 })
    return NextResponse.json(await recruitmentReport(from, to))
}
