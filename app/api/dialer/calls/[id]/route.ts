import { NextResponse } from "next/server"
import { guard } from "@/lib/access"
import { saveOutcome } from "@/lib/dialer-server"

export const dynamic = "force-dynamic"

// PATCH { outcome?, notes?, followUpAt?, stage? } — what happened on the call (also moves the lead / candidate on).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    const b = await req.json().catch(() => ({}))
    try { return NextResponse.json({ call: await saveOutcome(g.access, params.id, b) }) }
    catch (e: any) { return NextResponse.json({ error: e?.message || "Could not save" }, { status: 400 }) }
}
