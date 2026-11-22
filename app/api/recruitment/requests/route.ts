import { NextResponse } from "next/server"
import { getApiSession } from "@/lib/apiSession"
import { auditLater, requestMeta } from "@/lib/access"
import { listRequests, createRequest, canRequest, canApprove, canManage } from "@/lib/recruitment-server"

export const dynamic = "force-dynamic"

// GET ?status=OPEN|ALL|PENDING|… — manpower requests (requesters see their own).
export async function GET(req: Request) {
    const s = await getApiSession(req)
    if (!s || !canRequest(s)) return NextResponse.json({ error: "No access" }, { status: 403 })
    const status = new URL(req.url).searchParams.get("status") ?? "OPEN"
    return NextResponse.json({ requests: await listRequests(s, status), can: { approve: canApprove(s), manage: canManage(s) } })
}

// POST { siteId, position, headcount, reason, neededBy, salaryMin, salaryMax, priority, notes }
export async function POST(req: Request) {
    const s = await getApiSession(req)
    if (!s || !canRequest(s)) return NextResponse.json({ error: "Needs Recruitment → Raise manpower requests" }, { status: 403 })
    try {
        const r = await createRequest(s, await req.json().catch(() => ({})))
        auditLater({ actorId: s.user.id, actorName: s.user.name ?? null, action: "recruitment.request.create", targetType: "ManpowerRequest", targetId: r.id, targetName: r.reqNo, summary: `${r.reqNo}: ${r.headcount} × ${r.position}${r.siteName ? ` at ${r.siteName}` : ""}`, ...requestMeta(req) })
        return NextResponse.json({ request: r })
    } catch (e: any) { return NextResponse.json({ error: e?.message || "Could not save" }, { status: 400 }) }
}
