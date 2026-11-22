import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, has } from "@/lib/access"
import { canUse, canSales, getDialerSettings } from "@/lib/dialer-server"
import { OPEN_STAGES } from "@/lib/dialer"

export const dynamic = "force-dynamic"

// GET — my call list for today: calls waiting for an outcome, sales leads and candidates
// with a follow-up due (or never called), my phone, and the outcome list.
export async function GET(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    if (!canUse(g.access)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    const me = g.access.userId
    const ist = new Date(Date.now() + 5.5 * 3600_000)
    const endOfToday = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 5.5 * 3600_000 + 86400_000)
    const closed = ["JOINED", "ON_SITE_JOINED", "REJECTED", "DROPPED"] as any
    const recruiter = g.access.isAdmin || has(g.access, "recruitment.view")
    const [pendingOutcome, salesDue, salesNew, candDue, candNew, device, settings] = await Promise.all([
        prisma.callLog.findMany({ where: { userId: me, connected: true, outcome: null, targetType: { not: "UNKNOWN" }, startedAt: { gt: new Date(Date.now() - 3 * 86400_000) } }, orderBy: { startedAt: "desc" }, take: 20 }),
        canSales(g.access) ? prisma.salesLead.findMany({ where: { assignedTo: me, stage: { in: OPEN_STAGES }, nextFollowUp: { lt: endOfToday } }, orderBy: { nextFollowUp: "asc" }, take: 100 }) : [],
        canSales(g.access) ? prisma.salesLead.findMany({ where: { assignedTo: me, stage: "NEW", callCount: 0, nextFollowUp: null }, orderBy: { createdAt: "asc" }, take: 100 }) : [],
        recruiter ? prisma.lead.findMany({ where: { assignedTo: me, nextFollowUp: { lt: endOfToday }, status: { notIn: closed } }, orderBy: { nextFollowUp: "asc" }, take: 100, select: { id: true, candidateName: true, phone: true, position: true, city: true, status: true, nextFollowUp: true } }) : [],
        recruiter ? prisma.lead.findMany({ where: { assignedTo: me, status: "NEW_LEAD", nextFollowUp: null }, orderBy: { createdAt: "asc" }, take: 100, select: { id: true, candidateName: true, phone: true, position: true, city: true, status: true, nextFollowUp: true } }) : [],
        prisma.dialerDevice.findFirst({ where: { userId: me, active: true }, orderBy: { createdAt: "desc" }, select: { id: true, deviceName: true, lastSeenAt: true, lastSyncAt: true, appVersion: true } }),
        getDialerSettings(),
    ])
    const lead = (l: any, why: string) => ({ type: "SALES_LEAD", id: l.id, name: l.contactName, sub: [l.company, l.city].filter(Boolean).join(" · "), phone: l.phone, stage: l.stage, due: l.nextFollowUp, why, lastOutcome: l.lastOutcome })
    const cand = (c: any, why: string) => ({ type: "CANDIDATE", id: c.id, name: c.candidateName, sub: [c.position, c.city].filter(Boolean).join(" · "), phone: c.phone, stage: c.status, due: c.nextFollowUp, why, lastOutcome: null })
    return NextResponse.json({
        pendingOutcome,
        toCall: [...salesDue.map(l => lead(l, "Follow-up due")), ...candDue.map(c => cand(c, "Follow-up due")), ...salesNew.map(l => lead(l, "New lead")), ...candNew.map(c => cand(c, "New candidate"))],
        device: device ? { ...device, online: !!device.lastSeenAt && Date.now() - device.lastSeenAt.getTime() < 3 * 60_000 } : null,
        outcomes: settings.outcomes, me, name: g.access.name,
    })
}
