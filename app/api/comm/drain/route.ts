import { NextResponse } from "next/server"
import { getApiSession } from "@/lib/apiSession"
import { processQueue } from "@/lib/comm/engine"

export const dynamic = "force-dynamic"

// POST — sends what is due among the messages *this user's own action*
// queued (e.g. an announcement to 600 people). Pages call it in a loop after
// a big action, so the batch goes out without a scheduler. Anyone signed in
// may call it; it only ever moves their own messages along.
export async function POST(req: Request) {
    const session = await getApiSession(req)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    try {
        return NextResponse.json(await processQueue({ createdBy: session.user.id, budgetMs: 20_000, limit: 150 }))
    } catch (e: any) {
        return NextResponse.json({ sent: 0, failed: 0, processed: 0, remaining: 0, error: e?.message })
    }
}
