import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { isMissingTableErr } from "@/lib/asset-workflow"
import { COMM_EVENTS } from "@/lib/comm/events"
import { getCommSettings, saveCommSettings, sanitizeCommSettings } from "@/lib/comm/settings"
import { waConfig, waEnvStatus, phoneInfo, listTemplates } from "@/lib/whatsapp"
import { emailStatus } from "@/lib/mailer"

export const dynamic = "force-dynamic"

// Settings → Communication. The permission keys are whatsapp.view / .edit
// (shown as "Communication Center" in Roles).
const VIEW = ["whatsapp.view", "whatsapp.edit"]

export async function GET(req: Request) {
    const g = await guard(req, VIEW)
    if (g instanceof NextResponse) return g
    const connected = !!waConfig()
    const [phone, tpl, settings] = await Promise.all([
        connected ? phoneInfo() : Promise.resolve(null),
        connected ? listTemplates() : Promise.resolve({ ok: false, templates: [], error: null }),
        getCommSettings(),
    ])
    let installed = true
    let counts: { channel: string; status: string; n: number }[] = []
    let queue = { due: 0, waiting: 0 }
    try {
        const since = new Date(Date.now() - 30 * 86_400_000)
        const gb = await prisma.commMessage.groupBy({ by: ["channel", "status"], where: { createdAt: { gte: since } }, _count: true })
        counts = gb.map(x => ({ channel: x.channel, status: x.status, n: x._count }))
        const now = new Date()
        const [due, waiting] = await Promise.all([
            prisma.commMessage.count({ where: { status: "queued", nextAttemptAt: { lte: now } } }),
            prisma.commMessage.count({ where: { status: "queued", nextAttemptAt: { gt: now } } }),
        ])
        queue = { due, waiting }
    } catch (e) {
        if (!isMissingTableErr(e)) throw e
        installed = false
    }
    return NextResponse.json({
        events: COMM_EVENTS,
        settings,
        whatsapp: { connected, env: waEnvStatus(), phone, templates: tpl.templates, templatesError: tpl.error, webhookUrl: `${new URL(req.url).origin}/api/whatsapp/webhook` },
        email: emailStatus(),
        installed, counts, queue,
    })
}

export async function PUT(req: Request) {
    const g = await guard(req, "whatsapp.edit")
    if (g instanceof NextResponse) return g
    const next = sanitizeCommSettings(await req.json().catch(() => ({})))
    await saveCommSettings(next, g.access.userId)
    const on = Object.entries(next.events).map(([k, v]) => {
        const ch = (["whatsapp", "email", "inapp"] as const).filter(c => v[c].enabled)
        return ch.length ? `${k}: ${ch.join("+")}` : null
    }).filter(Boolean)
    auditLater({
        actorId: g.access.userId, actorName: g.access.name, action: "comm.settings", targetType: "Setting", targetId: "commSettings",
        targetName: "Communication Center", summary: `Communication settings saved — on: ${on.join(", ") || "nothing"}`,
        after: next, ...requestMeta(req),
    })
    return NextResponse.json({ ok: true, settings: next })
}
