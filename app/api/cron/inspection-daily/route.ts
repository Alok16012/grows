import { NextResponse } from "next/server"
import { guard } from "@/lib/access"
import { runInspectionDaily } from "@/lib/inspection-daily"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Daily inspection job (see vercel.json): overdue-approval reminders and
// escalation, draft reminders / clean-up, customer summaries.
// GET  — Vercel cron, signed with CRON_SECRET (closed if it isn't set).
// POST — "Run now" from Approvals → Settings (approvals.manage).
export async function GET(req: Request) {
    const secret = process.env.CRON_SECRET
    if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 })
    if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    try {
        return NextResponse.json({ ok: true, ...(await runInspectionDaily()) })
    } catch (e) {
        console.error("[CRON_INSPECTION_DAILY]", e)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}

export async function POST(req: Request) {
    const g = await guard(req, ["approvals.manage", "projects.edit"])
    if (g instanceof NextResponse) return g
    try {
        return NextResponse.json({ ok: true, ...(await runInspectionDaily(new Date(), { createdBy: g.access.userId })) })
    } catch (e: any) {
        console.error("[INSPECTION_DAILY_RUN]", e)
        return NextResponse.json({ error: e?.message || "Could not run" }, { status: 500 })
    }
}
