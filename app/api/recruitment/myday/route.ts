import { NextResponse } from "next/server"
import { getApiSession } from "@/lib/apiSession"
import { auditLater, requestMeta } from "@/lib/access"
import { myDay, assignUnassigned, canView, canManage, canApprove } from "@/lib/recruitment-server"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET ?all=1 — follow-ups due, interviews today, stuck candidates, offers waiting to join.
export async function GET(req: Request) {
    const s = await getApiSession(req)
    if (!s || !canView(s)) return NextResponse.json({ error: "No access" }, { status: 403 })
    const d = await myDay(s, new URL(req.url).searchParams.get("all") === "1")
    return NextResponse.json({ ...d, can: { manage: canManage(s), all: canApprove(s) || s.user.role === "ADMIN" } })
}

// POST { action: "assignUnassigned" } — share every open candidate without a recruiter.
export async function POST(req: Request) {
    const s = await getApiSession(req)
    if (!s || !(canApprove(s) || s.user.role === "ADMIN")) return NextResponse.json({ error: "Needs Recruitment → Approve" }, { status: 403 })
    try {
        const r = await assignUnassigned(s.user.id)
        auditLater({ actorId: s.user.id, actorName: s.user.name ?? null, action: "recruitment.assign.bulk", targetType: "Lead", targetId: null, targetName: "Unassigned candidates", summary: `${r.assigned} candidate(s) shared between ${r.recruiters} recruiter(s)`, ...requestMeta(req) })
        return NextResponse.json(r)
    } catch (e: any) { return NextResponse.json({ error: e?.message || "Could not assign" }, { status: 400 }) }
}
