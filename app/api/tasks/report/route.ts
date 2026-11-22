import { NextResponse } from "next/server"
import { guard } from "@/lib/access"
import { taskReport } from "@/lib/tasks-server"

export const dynamic = "force-dynamic"

// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD — on-time completion per person (team board scope).
export async function GET(req: Request) {
    const g = await guard(req, ["tasks.view"])
    if (g instanceof NextResponse) return g
    const sp = new URL(req.url).searchParams
    const to = sp.get("to") ? new Date(`${sp.get("to")}T23:59:59+05:30`) : new Date()
    const from = sp.get("from") ? new Date(`${sp.get("from")}T00:00:00+05:30`) : new Date(to.getTime() - 30 * 86_400_000)
    if (isNaN(from.getTime()) || isNaN(to.getTime())) return NextResponse.json({ error: "Pick valid dates" }, { status: 400 })
    return NextResponse.json({ from: from.toISOString(), to: to.toISOString(), rows: await taskReport(g.access, from, to) })
}
