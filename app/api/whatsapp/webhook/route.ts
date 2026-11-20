import { NextResponse } from "next/server"
import crypto from "crypto"
import prisma from "@/lib/prisma"
import { isMissingTableErr } from "@/lib/asset-workflow"

export const dynamic = "force-dynamic"

// Meta → Growus. Public on purpose (Meta calls it without a session); every
// POST must carry a valid X-Hub-Signature-256 made with the app secret.
//
// Setup in the Meta app → WhatsApp → Configuration:
//   Callback URL  https://<your domain>/api/whatsapp/webhook
//   Verify token  the value of WHATSAPP_VERIFY_TOKEN
//   Subscribe to  messages

// GET — Meta's one-time handshake when the webhook is saved.
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const mode = searchParams.get("hub.mode")
    const token = searchParams.get("hub.verify_token")
    const challenge = searchParams.get("hub.challenge") ?? ""
    const expected = process.env.WHATSAPP_VERIFY_TOKEN?.trim()
    if (mode === "subscribe" && expected && token === expected) {
        return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } })
    }
    return new NextResponse("Forbidden", { status: 403 })
}

const RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 }

// POST — delivery receipts (sent / delivered / read / failed) for our messages.
export async function POST(req: Request) {
    const secret = process.env.WHATSAPP_APP_SECRET?.trim()
    const raw = await req.text()
    if (!secret) return new NextResponse("Webhook not configured", { status: 503 })
    const sig = req.headers.get("x-hub-signature-256") ?? ""
    const want = "sha256=" + crypto.createHmac("sha256", secret).update(raw, "utf8").digest("hex")
    const a = Buffer.from(sig), b = Buffer.from(want)
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return new NextResponse("Bad signature", { status: 401 })

    let body: any
    try { body = JSON.parse(raw) } catch { return new NextResponse("Bad JSON", { status: 400 }) }

    const statuses: any[] = []
    for (const entry of body?.entry ?? []) for (const ch of entry?.changes ?? []) for (const st of ch?.value?.statuses ?? []) statuses.push(st)

    try {
        for (const st of statuses) {
            const wamid = typeof st?.id === "string" ? st.id : null
            const status = typeof st?.status === "string" ? st.status : null
            if (!wamid || !status || !(status in RANK)) continue
            const row = await prisma.whatsAppMessage.findUnique({ where: { wamid }, select: { id: true, status: true, deliveredAt: true } })
            if (!row) continue
            const at = st.timestamp ? new Date(Number(st.timestamp) * 1000) : new Date()
            const data: Record<string, unknown> = {}
            // Receipts can arrive out of order: never step back (read → delivered).
            if (status === "failed" || RANK[status] > (RANK[row.status] ?? 0)) data.status = status
            if (status === "delivered") data.deliveredAt = at
            if (status === "read") { data.readAt = at; if (!row.deliveredAt) data.deliveredAt = at }
            if (status === "failed") data.error = [st.errors?.[0]?.title, st.errors?.[0]?.error_data?.details].filter(Boolean).join(" — ").slice(0, 500) || "Failed"
            if (Object.keys(data).length) await prisma.whatsAppMessage.update({ where: { id: row.id }, data })
        }
    } catch (e) {
        if (!isMissingTableErr(e)) console.error("[WA_WEBHOOK]", e)
    }
    // Always 200 once the signature checks out, or Meta keeps retrying.
    return NextResponse.json({ ok: true })
}
