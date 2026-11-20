import { NextResponse } from "next/server"
import { guard } from "@/lib/access"
import { sendTemplate, waPhone } from "@/lib/whatsapp"

export const dynamic = "force-dynamic"

// POST { to, template, language, body?: string[] } — one test message.
// Every new WhatsApp account has Meta's "hello_world" template (en_US).
export async function POST(req: Request) {
    const g = await guard(req, "whatsapp.edit")
    if (g instanceof NextResponse) return g
    const b = await req.json().catch(() => ({}))
    const to = waPhone(b?.to)
    if (!to) return NextResponse.json({ error: "Enter a valid 10-digit Indian mobile number." }, { status: 400 })
    const template = String(b?.template ?? "").trim()
    if (!/^[a-z0-9_]{1,512}$/.test(template)) return NextResponse.json({ error: "Pick a template." }, { status: 400 })
    const language = /^[a-z]{2}(_[A-Z]{2})?$/.test(String(b?.language)) ? String(b.language) : "en_US"
    const body = Array.isArray(b?.body) ? b.body.slice(0, 10).map((x: unknown) => String(x ?? "").slice(0, 200)) : []
    const r = await sendTemplate({ to, template, language, body, event: "test", sentBy: g.access.userId, recipientName: "Test" })
    return r.ok ? NextResponse.json({ ok: true, wamid: r.wamid }) : NextResponse.json({ error: r.error }, { status: 502 })
}
