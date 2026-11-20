import { NextResponse } from "next/server"
import { runDwmDaily } from "@/lib/dwm-daily"
import { perfCtx, perfErrorResponse, requireManager } from "@/lib/perf-hub-db"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Daily DWM job (see vercel.json): report reminders, missed-deadline lists,
// reviewer reminders, escalation and optional auto-approve (DWM Settings).
// GET  — Vercel cron, signed with CRON_SECRET (closed if it isn't set).
// POST — "Run now" from DWM Settings (performance.manage).
export async function GET(req: Request) {
    const secret = process.env.CRON_SECRET
    if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 })
    if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    try {
        return NextResponse.json({ ok: true, ...(await runDwmDaily()) })
    } catch (e) {
        console.error("[CRON_DWM_DAILY]", e)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const ctx = await perfCtx(req)
        requireManager(ctx)
        return NextResponse.json({ ok: true, ...(await runDwmDaily()) })
    } catch (e) {
        return perfErrorResponse(e, "[DWM_DAILY_RUN]")
    }
}
