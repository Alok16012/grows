import { NextResponse } from "next/server"
import { guard } from "@/lib/access"
import { canUse, canSeeTeam, callerStats, dialerUserIds, liveStatus } from "@/lib/dialer-server"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET ?from=&to=&view=mine|team — numbers per caller, calls by hour / day, outcomes, live status (team).
export async function GET(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    if (!canUse(g.access)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    const sp = new URL(req.url).searchParams
    const team = sp.get("view") !== "mine" && canSeeTeam(g.access)
    // Default: today in India.
    const ist = new Date(Date.now() + 5.5 * 3600_000)
    const today = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 5.5 * 3600_000)
    const from = sp.get("from") ? new Date(sp.get("from")!) : today
    const to = sp.get("to") ? new Date(sp.get("to")!) : new Date(today.getTime() + 86400_000)
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from) return NextResponse.json({ error: "Pick a valid date range" }, { status: 400 })
    if (to.getTime() - from.getTime() > 93 * 86400_000) return NextResponse.json({ error: "At most 3 months at a time" }, { status: 400 })
    const ids = team ? await dialerUserIds() : [g.access.userId]
    const s = await callerStats(from, to, ids)
    return NextResponse.json({ ...s, team, canSeeTeam: canSeeTeam(g.access), me: g.access.userId, live: team ? await liveStatus() : null, from, to })
}
