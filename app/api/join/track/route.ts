import { NextResponse } from "next/server"
import { findLink, bumpLink } from "@/lib/join-links"

export const dynamic = "force-dynamic"

// Public — the join form reports "started filling" once per visit, so the link
// manager can show opened → started → submitted.
export async function POST(req: Request) {
    const b = await req.json().catch(() => ({}))
    const link = await findLink(b?.l).catch(() => null)
    if (link && b?.event === "start") await bumpLink(link.id, "starts")
    return NextResponse.json({ ok: true })
}
