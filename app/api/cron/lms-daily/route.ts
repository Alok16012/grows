import { NextResponse } from "next/server"
import { guard } from "@/lib/access"
import { runLmsDaily } from "@/lib/lms-auto"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Nightly LMS job (see vercel.json): enrol by assignment rules, re-enrol before
// certificates expire, remind learners, escalate overdue training.
// GET  — Vercel cron, signed with CRON_SECRET (closed if it isn't set).
// POST — "Run now" from LMS → Settings (lms.manage).
export async function GET(req: Request) {
    const secret = process.env.CRON_SECRET
    if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 })
    if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    try {
        return NextResponse.json({ ok: true, ...(await runLmsDaily()) })
    } catch (e) {
        console.error("[CRON_LMS_DAILY]", e)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}

export async function POST(req: Request) {
    const g = await guard(req, "lms.edit")
    if (g instanceof NextResponse) return g
    try {
        return NextResponse.json({ ok: true, ...(await runLmsDaily()) })
    } catch (e: any) {
        console.error("[LMS_DAILY_RUN]", e)
        return NextResponse.json({ error: e?.message || "Could not run" }, { status: 500 })
    }
}
