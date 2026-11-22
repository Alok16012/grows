import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, has, auditLater, requestMeta } from "@/lib/access"
import { monthSanity } from "@/lib/challans"
import { getRelease, saveRelease, ym, NO_SITE } from "@/lib/payslip-release"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const SENDERS = ["payroll.edit", "payroll.markPaid", "payroll.lock"]

// GET ?month&year — per site: payslips processed / still draft, and whether they were sent.
export async function GET(req: Request) {
    const g = await guard(req, "payroll.view")
    if (g instanceof NextResponse) return g
    const sp = new URL(req.url).searchParams
    const month = Number(sp.get("month")), year = Number(sp.get("year"))
    if (!month || !year) return NextResponse.json({ error: "month and year required" }, { status: 400 })
    const [s, rows, sites] = await Promise.all([
        getRelease(),
        prisma.payroll.groupBy({ by: ["siteId", "status"], where: { month, year }, _count: { _all: true } }),
        prisma.site.findMany({ select: { id: true, name: true } }),
    ])
    const name = new Map(sites.map(x => [x.id, x.name]))
    const k = ym(year, month)
    const by = new Map<string, { siteId: string; site: string; ready: number; draft: number }>()
    for (const r of rows) {
        const key = r.siteId ?? NO_SITE
        const c = by.get(key) ?? { siteId: key, site: r.siteId ? name.get(r.siteId) ?? "Unknown site" : "No site", ready: 0, draft: 0 }
        if (String(r.status) === "DRAFT") c.draft += r._count._all; else c.ready += r._count._all
        by.set(key, c)
    }
    const before = !!s.startFrom && k < s.startFrom
    const list = Array.from(by.values()).map(c => ({ ...c, sent: s.sent[k]?.[c.siteId] ?? null })).sort((a, b) => a.site.localeCompare(b.site))
    const sanity = await monthSanity(month, year).catch(() => ({ issues: [] as { level: string; text: string }[] }))
    return NextResponse.json({
        warnings: sanity.issues.filter(i => i.level === "warn").map(i => i.text),
        requireSend: s.requireSend, startFrom: s.startFrom, alwaysVisible: !s.requireSend || before,
        canSend: g.access.isAdmin || SENDERS.some(p => has(g.access, p)), sites: list,
    })
}

// POST { month, year, siteIds: string[], action: "send" | "unsend" } | { action: "settings", requireSend, startFrom }
export async function POST(req: Request) {
    const g = await guard(req, "payroll.view")
    if (g instanceof NextResponse) return g
    if (!(g.access.isAdmin || SENDERS.some(p => has(g.access, p)))) return NextResponse.json({ error: "Needs Edit payroll (or Mark paid / Lock)" }, { status: 403 })
    const b = await req.json().catch(() => ({}))
    const s = await getRelease()
    if (b?.action === "settings") {
        if (typeof b.requireSend === "boolean") s.requireSend = b.requireSend
        if (typeof b.startFrom === "string" && /^\d{4}-\d{2}$/.test(b.startFrom)) s.startFrom = b.startFrom
        await saveRelease(s, g.access.userId)
        auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "payroll.payslip_settings", targetType: "Setting", targetId: "payslipRelease", targetName: "Payslip sending", summary: `Payslips need sending: ${s.requireSend ? "yes" : "no"}, from ${s.startFrom}`, ...requestMeta(req) })
        return NextResponse.json({ ok: true, requireSend: s.requireSend, startFrom: s.startFrom })
    }
    const month = Number(b?.month), year = Number(b?.year)
    const siteIds: string[] = Array.isArray(b?.siteIds) ? b.siteIds.filter((x: unknown): x is string => typeof x === "string").slice(0, 500) : []
    if (!month || !year || !siteIds.length) return NextResponse.json({ error: "Pick the month and site(s)" }, { status: 400 })
    const k = ym(year, month)
    const real = siteIds.filter(x => x !== NO_SITE)
    const rows = await prisma.payroll.findMany({
        where: { month, year, status: { not: "DRAFT" }, OR: [...(real.length ? [{ siteId: { in: real } }] : []), ...(siteIds.includes(NO_SITE) ? [{ siteId: null }] : [])] },
        select: { employeeId: true, siteId: true, employee: { select: { userId: true } } },
    })
    if (b?.action === "unsend") {
        for (const id of siteIds) if (s.sent[k]) delete s.sent[k][id]
        await saveRelease(s, g.access.userId)
        auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "payroll.payslip_unsend", targetType: "Payroll", targetName: `${k} · ${siteIds.length} site(s)`, summary: `Payslips for ${k} taken back for ${siteIds.length} site(s)`, ...requestMeta(req) })
        return NextResponse.json({ ok: true })
    }
    if (!rows.length) return NextResponse.json({ error: "No processed payslips for these sites — process payroll first" }, { status: 400 })
    s.sent[k] = s.sent[k] ?? {}
    const now = new Date().toISOString()
    for (const id of siteIds) {
        const count = rows.filter(r => (r.siteId ?? NO_SITE) === id).length
        if (count) s.sent[k][id] = { at: now, by: g.access.userId, byName: g.access.name, count }
    }
    await saveRelease(s, g.access.userId)
    // In-app note to each employee (never WhatsApp for payslips).
    const label = new Date(year, month - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" })
    const users = Array.from(new Set(rows.map(r => r.employee?.userId).filter((x): x is string => !!x)))
    for (let i = 0; i < users.length; i += 500) {
        await prisma.notification.createMany({ data: users.slice(i, i + 500).map(userId => ({ userId, title: `Payslip for ${label}`, message: "Your payslip is ready. Open My Profile → Payslip to view or download it.", type: "payroll", link: "/profile?tab=payslip" })) }).catch(e => console.error("[PAYSLIP_SEND_NOTIFY]", e))
    }
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "payroll.payslip_send", targetType: "Payroll", targetName: `${k} · ${siteIds.length} site(s)`, summary: `Payslips for ${k} sent to ${rows.length} employee(s) at ${siteIds.length} site(s)`, ...requestMeta(req) })
    return NextResponse.json({ ok: true, employees: rows.length, notified: users.length })
}
