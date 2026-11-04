import { NextResponse } from "next/server"
import { guard } from "@/lib/access"
import { checkAccess } from "@/lib/permissions"
import { listNewJoiners, countNewJoiners } from "@/lib/new-joiners"

export const dynamic = "force-dynamic"

// GET /api/new-joiners           → the alert: { needsSite, recentlyDeployed, canAssign, … }
// GET /api/new-joiners?count=1   → { needsSite, recentlyDeployed } counts, for the badge poll
//
// Anyone who can view employees sees it, limited to the employees in their
// scope — a site-scoped role only sees people already posted to its sites.
export async function GET(req: Request) {
    const g = await guard(req, ["employees.view"])
    if (g instanceof NextResponse) return g
    try {
        const countOnly = new URL(req.url).searchParams.get("count") === "1"
        if (countOnly) return NextResponse.json(await countNewJoiners(g.access))
        const data = await listNewJoiners(g.access)
        // Same rule as POST /api/deployments, so the button only shows when it will work.
        const canAssign = checkAccess(g.session, ["MANAGER", "HR_MANAGER"], "sites.view")
        return NextResponse.json({ ...data, canAssign })
    } catch (error) {
        console.error("[NEW_JOINERS_GET]", error)
        return NextResponse.json({ error: "Could not load new joiners" }, { status: 500 })
    }
}
