import { NextResponse } from "next/server"
import { guard } from "@/lib/access"
import { canUse, matchNumbers } from "@/lib/dialer-server"
import { phoneKey } from "@/lib/dialer"

export const dynamic = "force-dynamic"

// GET ?phone= — who a number belongs to (sales lead / candidate / employee).
export async function GET(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    if (!canUse(g.access)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    const k = phoneKey(new URL(req.url).searchParams.get("phone"))
    const m = (await matchNumbers([k], g.access.userId)).get(k) ?? null
    return NextResponse.json({ match: m })
}
