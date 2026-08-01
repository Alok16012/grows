import { NextResponse } from "next/server"
import { syncAllLeaveStatuses } from "@/lib/leave-status"

// Daily job (see vercel.json) that moves employees into ON_LEAVE on the day
// their approved leave starts and back to ACTIVE the day after it ends.
// Without it, ON_LEAVE only ever got set and never cleared.
//
// Vercel signs its cron invocations with CRON_SECRET when that variable is set.
// If it isn't set the route stays closed rather than open, so a missing env var
// can't turn this into a public write endpoint.
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
    const secret = process.env.CRON_SECRET
    if (!secret) {
        return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 })
    }
    if (req.headers.get("authorization") !== `Bearer ${secret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const result = await syncAllLeaveStatuses()
        return NextResponse.json({ ok: true, ...result })
    } catch (error) {
        console.error("[CRON_SYNC_LEAVE_STATUS]", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}
