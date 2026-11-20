import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard } from "@/lib/access"
import { COMM_EVENT_MAP, sampleData, type Channel } from "@/lib/comm/events"
import { notify } from "@/lib/comm/engine"

export const dynamic = "force-dynamic"

// POST { event, channel, to, name? } — one message with sample values, sent
// now even if the event is switched off. In-app goes to the person testing.
export async function POST(req: Request) {
    const g = await guard(req, "whatsapp.edit")
    if (g instanceof NextResponse) return g
    const b = await req.json().catch(() => ({}))
    const ev = COMM_EVENT_MAP.get(String(b?.event ?? ""))
    if (!ev) return NextResponse.json({ error: "Pick an event." }, { status: 400 })
    const channel = String(b?.channel) as Channel
    if (!["whatsapp", "email", "inapp"].includes(channel)) return NextResponse.json({ error: "Pick a channel." }, { status: 400 })
    if (ev.waDocument && channel === "whatsapp") {
        return NextResponse.json({ error: "This event sends a PDF — test it from the real Send button once that feature is live." }, { status: 400 })
    }
    const to = String(b?.to ?? "").trim()
    const name = String(b?.name ?? "").trim() || "Test"
    const me = channel === "inapp" ? await prisma.user.findUnique({ where: { id: g.access.userId }, select: { id: true, name: true } }) : null
    try {
        const r = await notify(ev.key, [{
            type: ev.audience === "customer" ? "customer" : "employee", name: me?.name ?? name,
            phone: channel === "whatsapp" ? to : null, email: channel === "email" ? to : null, userId: me?.id ?? null,
        }], { ...sampleData(ev), name: me?.name?.split(" ")[0] ?? name }, { channels: [channel], force: true, createdBy: g.access.userId, refType: "Test", budgetMs: 15_000 })
        const row = r.ids[0] ? await prisma.commMessage.findUnique({ where: { id: r.ids[0] }, select: { status: true, error: true } }) : null
        if (!row) return NextResponse.json({ error: "Nothing was queued." }, { status: 400 })
        if (row.status === "sent") return NextResponse.json({ ok: true })
        return NextResponse.json({ error: row.error || `Status: ${row.status}` }, { status: 502 })
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "Could not send" }, { status: 500 })
    }
}
