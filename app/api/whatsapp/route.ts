import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard } from "@/lib/access"
import { isMissingTableErr } from "@/lib/asset-workflow"
import { auditLater, requestMeta } from "@/lib/access"
import { waConfig, waEnvStatus, phoneInfo, listTemplates, getWaSettings, saveWaSettings, sanitizeWaSettings, WA_EVENTS } from "@/lib/whatsapp"

export const dynamic = "force-dynamic"

// Settings → WhatsApp: connection status, templates, which events send, and
// message counts. GET needs whatsapp.view; PUT (event settings) whatsapp.edit.
export async function GET(req: Request) {
    const g = await guard(req, ["whatsapp.view", "whatsapp.edit"])
    if (g instanceof NextResponse) return g
    const connected = !!waConfig()
    const [phone, tpl, settings] = await Promise.all([
        connected ? phoneInfo() : Promise.resolve(null),
        connected ? listTemplates() : Promise.resolve({ ok: false, templates: [], error: null }),
        getWaSettings(),
    ])

    let installed = true
    let counts: Record<string, number> = {}
    try {
        const since = new Date(Date.now() - 30 * 86_400_000)
        const g2 = await prisma.whatsAppMessage.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: true })
        counts = Object.fromEntries(g2.map(x => [x.status, x._count]))
    } catch (e) {
        if (!isMissingTableErr(e)) throw e
        installed = false
    }

    const origin = new URL(req.url).origin
    return NextResponse.json({
        connected,
        env: waEnvStatus(),
        phone,
        templates: tpl.templates,
        templatesError: tpl.error,
        settings,
        events: WA_EVENTS,
        webhookUrl: `${origin}/api/whatsapp/webhook`,
        installed,
        counts30d: counts,
    })
}

export async function PUT(req: Request) {
    const g = await guard(req, "whatsapp.edit")
    if (g instanceof NextResponse) return g
    const body = await req.json().catch(() => ({}))
    const next = sanitizeWaSettings(body)
    await saveWaSettings(next, g.access.userId)
    auditLater({
        actorId: g.access.userId, actorName: g.access.name, action: "whatsapp.settings", targetType: "Setting", targetId: "whatsappSettings",
        targetName: "WhatsApp events",
        summary: `WhatsApp events: ${Object.entries(next.events).map(([k, v]) => `${k} ${v.enabled ? `on (${v.template})` : "off"}`).join(", ")}`,
        after: next, ...requestMeta(req),
    })
    return NextResponse.json({ ok: true, settings: next })
}
