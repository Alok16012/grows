import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { isMissingTableErr } from "@/lib/asset-workflow"
import { waPhone } from "@/lib/whatsapp"

export const dynamic = "force-dynamic"

// People who asked not to be messaged on a channel.
export async function GET(req: Request) {
    const g = await guard(req, ["whatsapp.view", "whatsapp.edit"])
    if (g instanceof NextResponse) return g
    try {
        return NextResponse.json({ rows: await prisma.commOptOut.findMany({ orderBy: { createdAt: "desc" }, take: 500 }) })
    } catch (e) {
        if (isMissingTableErr(e)) return NextResponse.json({ rows: [] })
        throw e
    }
}

// POST { channel, address, reason? }
export async function POST(req: Request) {
    const g = await guard(req, "whatsapp.edit")
    if (g instanceof NextResponse) return g
    const b = await req.json().catch(() => ({}))
    const channel = b?.channel === "email" ? "email" : b?.channel === "whatsapp" ? "whatsapp" : null
    if (!channel) return NextResponse.json({ error: "Pick WhatsApp or Email." }, { status: 400 })
    const raw = String(b?.address ?? "").trim()
    const address = channel === "whatsapp" ? waPhone(raw) : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw.toLowerCase() : null
    if (!address) return NextResponse.json({ error: channel === "whatsapp" ? "Enter a valid mobile number." : "Enter a valid email." }, { status: 400 })
    const row = await prisma.commOptOut.upsert({
        where: { channel_address: { channel, address } },
        update: { reason: String(b?.reason ?? "").slice(0, 200) || null },
        create: { channel, address, reason: String(b?.reason ?? "").slice(0, 200) || null, createdBy: g.access.userId },
    })
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "comm.optout", targetType: "CommOptOut", targetId: row.id, targetName: address, summary: `Opted out of ${channel}: ${address}`, ...requestMeta(req) })
    return NextResponse.json({ ok: true, row })
}

// DELETE ?id= — let them receive messages again.
export async function DELETE(req: Request) {
    const g = await guard(req, "whatsapp.edit")
    if (g instanceof NextResponse) return g
    const id = new URL(req.url).searchParams.get("id") || ""
    const row = await prisma.commOptOut.delete({ where: { id } }).catch(() => null)
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "comm.optin", targetType: "CommOptOut", targetId: id, targetName: row.address, summary: `Messages on ${row.channel} allowed again: ${row.address}`, ...requestMeta(req) })
    return NextResponse.json({ ok: true })
}
