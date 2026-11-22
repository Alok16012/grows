import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { deviceFrom, ingestCalls, pendingFor, getDialerSettings, pollMs } from "@/lib/dialer-server"
import { cleanPhone } from "@/lib/dialer"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// The Growus Dialer app calls this every few seconds (header X-Dialer-Token):
// POST { onCall?: boolean, callPhone?: string, appVersion?: string, calls?: [{ number, direction, startedAt (ms), durationSec }] }
// → { pending: { id, phone, targetName } | null, sync: { saved, needOutcome: [{ id, name }] }, pollMs, settings, since }
export async function POST(req: Request) {
    const d = await deviceFrom(req)
    if (!d) return NextResponse.json({ error: "This phone is not paired — sign in again in the app" }, { status: 401 })
    const b = await req.json().catch(() => ({}))
    const now = new Date()
    const onCall = !!b?.onCall
    await prisma.dialerDevice.update({ where: { id: d.device.id }, data: {
        lastSeenAt: now, onCall, onCallSince: onCall ? (d.device.onCall ? d.device.onCallSince : now) : null,
        callPhone: onCall && b?.callPhone ? cleanPhone(b.callPhone).slice(0, 20) : null,
        ...(b?.appVersion ? { appVersion: String(b.appVersion).slice(0, 20) } : {}),
    } })
    let sync = null
    if (Array.isArray(b?.calls) && b.calls.length) sync = await ingestCalls(d.user.id, d.device.id, b.calls)
    const s = await getDialerSettings()
    const pending = onCall ? null : await pendingFor(d.user.id)
    return NextResponse.json({
        pending, sync, user: d.user.name, pollMs: pollMs(s),
        settings: { syncIncoming: s.syncIncoming, syncUnknown: s.syncUnknown },
        // The app sends calls newer than this (the last one we already have, minus a margin for edits).
        since: (await prisma.callLog.findFirst({ where: { userId: d.user.id }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }))?.startedAt.getTime() ?? null,
    })
}
