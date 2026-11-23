import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { deviceFrom, matchNumbers, getDialerSettings } from "@/lib/dialer-server"
import { phoneKey, STAGES, type Stage } from "@/lib/dialer"

export const dynamic = "force-dynamic"

const day = (d: Date | null | undefined) => d ? d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : null

// Caller ID: the phone is ringing — who is it? POST { phone } with X-Dialer-Token.
// → { match: { type, title, line1, line2 } | null }. Only numbers in the ERP are named.
export async function POST(req: Request) {
    const d = await deviceFrom(req)
    if (!d) return NextResponse.json({ error: "Not paired" }, { status: 401 })
    const b = await req.json().catch(() => ({}))
    const k = phoneKey(b?.phone)
    if (k.length < 6) return NextResponse.json({ match: null })
    const m = (await matchNumbers([k], d.user.id)).get(k)
    if (!m) return NextResponse.json({ match: null })
    const s = await getDialerSettings()
    const label = new Map(s.outcomes.map(o => [o.key, o.label]))
    const last = await prisma.callLog.findFirst({ where: { phoneKey: k, OR: [{ outcome: { not: null } }, { connected: true }] }, orderBy: { startedAt: "desc" }, select: { startedAt: true, outcome: true, notes: true, userId: true } })
    const lastBy = last ? (await prisma.user.findUnique({ where: { id: last.userId }, select: { name: true } }))?.name : null
    const lastLine = last ? `Last call ${day(last.startedAt)}${lastBy ? ` by ${lastBy}` : ""}${last.outcome ? ` — ${label.get(last.outcome) ?? last.outcome}` : ""}${last.notes ? `: ${last.notes.split("\n")[0].slice(0, 80)}` : ""}` : null
    let title = m.name, line1 = "", line2 = lastLine ?? ""
    if (m.type === "SALES_LEAD") {
        const l = await prisma.salesLead.findUnique({ where: { id: m.id }, select: { contactName: true, company: true, stage: true, city: true, nextFollowUp: true, lastOutcome: true, notes: true } })
        if (l) {
            title = l.company ? `${l.contactName} · ${l.company}` : l.contactName
            line1 = ["Sales lead", STAGES[l.stage as Stage]?.label ?? l.stage, l.city, l.nextFollowUp ? `follow-up ${day(l.nextFollowUp)}` : null].filter(Boolean).join(" · ")
            if (!line2 && l.notes) line2 = l.notes.split("\n")[0].slice(0, 120)
        }
    } else if (m.type === "CANDIDATE") {
        const c = await prisma.lead.findUnique({ where: { id: m.id }, select: { candidateName: true, position: true, status: true, city: true } })
        if (c) line1 = ["Candidate", c.position, String(c.status).replace(/_/g, " ").toLowerCase(), c.city].filter(Boolean).join(" · ")
    } else if (m.type === "EMPLOYEE") {
        const e = await prisma.employee.findUnique({ where: { id: m.id }, select: { employeeId: true, designation: true, status: true } })
        if (e) line1 = ["Employee", e.employeeId, e.designation, e.status !== "ACTIVE" ? String(e.status).toLowerCase() : null].filter(Boolean).join(" · ")
    }
    return NextResponse.json({ match: { type: m.type, id: m.id, title, line1, line2 } })
}
