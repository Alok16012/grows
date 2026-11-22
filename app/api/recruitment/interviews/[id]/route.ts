import { NextResponse } from "next/server"
import { getApiSession } from "@/lib/apiSession"
import { updateInterview } from "@/lib/recruitment-server"

export const dynamic = "force-dynamic"

// POST { status?, result?, scores?, feedback?, scheduledAt?, interviewerId? } — the interviewer or a recruiter.
export async function POST(req: Request, { params }: { params: { id: string } }) {
    const s = await getApiSession(req)
    if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    try { return NextResponse.json({ interview: await updateInterview(s, params.id, await req.json().catch(() => ({}))) }) }
    catch (e: any) { return NextResponse.json({ error: e?.message || "Could not save" }, { status: 400 }) }
}
