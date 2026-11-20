import { NextResponse } from "next/server"
import { guard } from "@/lib/access"
import { processQueue } from "@/lib/comm/engine"

export const dynamic = "force-dynamic"

// Sends whatever is due in the Communication Center queue.
// GET  — for a scheduler (Vercel cron or any external pinger) with
//        Authorization: Bearer <CRON_SECRET>.
// POST — "Process queue now" on the settings page (whatsapp.edit).
export async function GET(req: Request) {
    const secret = process.env.CRON_SECRET
    if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 })
    if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    return NextResponse.json(await processQueue({ budgetMs: 25_000 }))
}

export async function POST(req: Request) {
    const g = await guard(req, "whatsapp.edit")
    if (g instanceof NextResponse) return g
    return NextResponse.json(await processQueue({ budgetMs: 25_000 }))
}
