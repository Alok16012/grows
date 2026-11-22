import { NextResponse } from "next/server"
import { getApiSession } from "@/lib/apiSession"
import { auditLater, requestMeta } from "@/lib/access"
import { actOnRequest, canRequest } from "@/lib/recruitment-server"

export const dynamic = "force-dynamic"

// POST { action: approve|reject|cancel|fill|reopen|makeJob, note? }
export async function POST(req: Request, { params }: { params: { id: string } }) {
    const s = await getApiSession(req)
    if (!s || !canRequest(s)) return NextResponse.json({ error: "No access" }, { status: 403 })
    const b = await req.json().catch(() => ({}))
    try {
        const r = await actOnRequest(s, params.id, String(b?.action), b)
        auditLater({ actorId: s.user.id, actorName: s.user.name ?? null, action: `recruitment.request.${b?.action}`, targetType: "ManpowerRequest", targetId: params.id, targetName: r?.reqNo ?? null, summary: `${r?.reqNo}: ${b?.action}${b?.note ? ` — ${String(b.note).slice(0, 100)}` : ""}`, ...requestMeta(req) })
        return NextResponse.json({ request: r })
    } catch (e: any) { return NextResponse.json({ error: e?.message || "Could not save" }, { status: 400 }) }
}
