import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { listInterviews, addInterview, canView, canManage } from "@/lib/recruitment-server"

export const dynamic = "force-dynamic"

// GET ?leadId= — that candidate's rounds; else ?from=&to=&mine=1 — the interview calendar.
// Interviewers without recruitment access see only their own interviews.
export async function GET(req: Request) {
    const s = await getApiSession(req)
    if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const sp = new URL(req.url).searchParams
    const leadId = sp.get("leadId")
    if (leadId) {
        if (!canView(s)) return NextResponse.json({ error: "No access" }, { status: 403 })
        const rows = await prisma.leadInterview.findMany({ where: { leadId }, orderBy: { round: "asc" } })
        const users = await prisma.user.findMany({ where: { id: { in: Array.from(new Set(rows.map(r => r.interviewerId).filter((x): x is string => !!x))) } }, select: { id: true, name: true } })
        const nameOf = new Map(users.map(u => [u.id, u.name]))
        return NextResponse.json({ interviews: rows.map(r => ({ ...r, interviewerName: r.interviewerId ? nameOf.get(r.interviewerId) ?? "—" : null })) })
    }
    const from = sp.get("from") ? new Date(`${sp.get("from")}T00:00:00+05:30`) : new Date(Date.now() - 86_400_000)
    const to = sp.get("to") ? new Date(`${sp.get("to")}T23:59:59+05:30`) : new Date(from.getTime() + 15 * 86_400_000)
    if (isNaN(from.getTime()) || isNaN(to.getTime())) return NextResponse.json({ error: "Pick valid dates" }, { status: 400 })
    return NextResponse.json({ interviews: await listInterviews(s, from, to, sp.get("mine") === "1"), canManage: canManage(s) })
}

// POST { leadId, scheduledAt, title?, mode?, location?, interviewerId? } — next round for the candidate.
export async function POST(req: Request) {
    const s = await getApiSession(req)
    if (!s || !canManage(s)) return NextResponse.json({ error: "Needs Recruitment → Edit" }, { status: 403 })
    const b = await req.json().catch(() => ({}))
    try { return NextResponse.json({ interview: await addInterview(s, String(b?.leadId ?? ""), b) }) }
    catch (e: any) { return NextResponse.json({ error: e?.message || "Could not save" }, { status: 400 }) }
}
