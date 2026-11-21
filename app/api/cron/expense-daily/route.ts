import { NextResponse } from "next/server"
import { guard } from "@/lib/access"
import { runExpenseDaily } from "@/lib/expense-daily"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Daily expense reminders (see vercel.json).
// GET  — Vercel cron, signed with CRON_SECRET (closed if it isn't set).
// POST — "Run now" (expenses.manage).
export async function GET(req: Request) {
    const secret = process.env.CRON_SECRET
    if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 })
    if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    try { return NextResponse.json({ ok: true, ...(await runExpenseDaily()) }) }
    catch (e) { console.error("[CRON_EXPENSE_DAILY]", e); return NextResponse.json({ error: "Internal Error" }, { status: 500 }) }
}

export async function POST(req: Request) {
    const g = await guard(req, "expenses.manage")
    if (g instanceof NextResponse) return g
    try { return NextResponse.json({ ok: true, ...(await runExpenseDaily()) }) }
    catch (e) { console.error("[EXPENSE_DAILY_RUN]", e); return NextResponse.json({ error: "Internal Error" }, { status: 500 }) }
}
