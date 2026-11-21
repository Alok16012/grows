import { NextResponse } from "next/server"
import { guard } from "@/lib/access"
import { runAssetDaily } from "@/lib/asset-daily"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Daily asset reminders (see vercel.json).
// GET — Vercel cron, signed with CRON_SECRET (closed if it isn't set). POST — "Run now" (assets.manage).
export async function GET(req: Request) {
    const secret = process.env.CRON_SECRET
    if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 })
    if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    try { return NextResponse.json({ ok: true, ...(await runAssetDaily()) }) }
    catch (e) { console.error("[CRON_ASSET_DAILY]", e); return NextResponse.json({ error: "Internal Error" }, { status: 500 }) }
}

export async function POST(req: Request) {
    const g = await guard(req, "assets.manage")
    if (g instanceof NextResponse) return g
    try { return NextResponse.json({ ok: true, ...(await runAssetDaily()) }) }
    catch (e) { console.error("[ASSET_DAILY_RUN]", e); return NextResponse.json({ error: "Internal Error" }, { status: 500 }) }
}
