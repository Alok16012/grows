import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, has, auditLater, requestMeta } from "@/lib/access"
import { monthSanity } from "@/lib/challans"
import { getRelease, saveRelease, ym, NO_SITE, notifyPayslipReady, SEND_MODE_LABEL, type SendMode } from "@/lib/payslip-release"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const SENDERS = ["payroll.edit", "payroll.markPaid", "payroll.lock"]

// GET ?month&year                     — per site: processed / draft, sent or not, how many sent one by one
// GET ?month&year&employees=1&siteId= — that site's employees (or &q= across all sites), each sent or not
// GET ?settings=1                     — just the sending settings
export async function GET(req: Request) {
    const g = await guard(req, "payroll.view")
    if (g instanceof NextResponse) return g
    const sp = new URL(req.url).searchParams
    const s = await getRelease()
    const canSend = g.access.isAdmin || SENDERS.some(p => has(g.access, p))
    const settings = { mode: s.mode, notify: s.notify, startFrom: s.startFrom, modes: SEND_MODE_LABEL }
    if (sp.get("settings")) return NextResponse.json({ ...settings, canSend })
    const month = Number(sp.get("month")), year = Number(sp.get("year"))
    if (!month || !year) return NextResponse.json({ error: "month and year required" }, { status: 400 })
    const k = ym(year, month)

    if (sp.get("employees")) {
        const siteId = sp.get("siteId"), q = (sp.get("q") ?? "").trim()
        const rows = await prisma.payroll.findMany({
            where: {
                month, year,
                ...(siteId ? (siteId === NO_SITE ? { siteId: null } : { siteId }) : {}),
                ...(q ? { employee: { OR: [{ firstName: { contains: q, mode: "insensitive" as const } }, { lastName: { contains: q, mode: "insensitive" as const } }, { employeeId: { contains: q, mode: "insensitive" as const } }] } } : {}),
            },
            select: { employeeId: true, siteId: true, status: true, netSalary: true, employee: { select: { employeeId: true, firstName: true, lastName: true, designation: true, userId: true } } },
            orderBy: { employee: { firstName: "asc" } }, take: 1000,
        })
        const sites = new Map((await prisma.site.findMany({ select: { id: true, name: true } })).map(x => [x.id, x.name]))
        return NextResponse.json({
            employees: rows.map(r => {
                const viaSite = s.sent[k]?.[r.siteId ?? NO_SITE] ?? null, viaEmp = s.sentEmp[k]?.[r.employeeId] ?? null
                const auto = s.mode === "onLock" || (s.mode === "onPaid" && String(r.status) === "PAID") || (!!s.startFrom && k < s.startFrom)
                return {
                    employeeId: r.employeeId, code: r.employee?.employeeId ?? "", name: `${r.employee?.firstName ?? ""} ${r.employee?.lastName ?? ""}`.trim(),
                    designation: r.employee?.designation ?? null, site: r.siteId ? sites.get(r.siteId) ?? "—" : "No site", siteId: r.siteId ?? NO_SITE,
                    status: String(r.status), net: r.netSalary, hasLogin: !!r.employee?.userId,
                    visible: String(r.status) !== "DRAFT" && (auto || !!viaSite || !!viaEmp),
                    sentBy: viaEmp ? "employee" : viaSite ? "site" : auto && String(r.status) !== "DRAFT" ? "auto" : null,
                    sentAt: (viaEmp ?? viaSite)?.at ?? null,
                }
            }),
        })
    }

    const [rows, sites, emps] = await Promise.all([
        prisma.payroll.groupBy({ by: ["siteId", "status"], where: { month, year }, _count: { _all: true } }),
        prisma.site.findMany({ select: { id: true, name: true } }),
        prisma.payroll.findMany({ where: { month, year, employeeId: { in: Object.keys(s.sentEmp[k] ?? {}) } }, select: { employeeId: true, siteId: true } }),
    ])
    const name = new Map(sites.map(x => [x.id, x.name]))
    const by = new Map<string, { siteId: string; site: string; ready: number; draft: number; paid: number; empSent: number }>()
    for (const r of rows) {
        const key = r.siteId ?? NO_SITE
        const c = by.get(key) ?? { siteId: key, site: r.siteId ? name.get(r.siteId) ?? "Unknown site" : "No site", ready: 0, draft: 0, paid: 0, empSent: 0 }
        if (String(r.status) === "DRAFT") c.draft += r._count._all; else c.ready += r._count._all
        if (String(r.status) === "PAID") c.paid += r._count._all
        by.set(key, c)
    }
    for (const e of emps) { const c = by.get(e.siteId ?? NO_SITE); if (c) c.empSent++ }
    const before = !!s.startFrom && k < s.startFrom
    const list = Array.from(by.values()).map(c => ({ ...c, sent: s.sent[k]?.[c.siteId] ?? null })).sort((a, b) => a.site.localeCompare(b.site))
    const sanity = await monthSanity(month, year).catch(() => ({ issues: [] as { level: string; text: string }[] }))
    return NextResponse.json({
        warnings: sanity.issues.filter(i => i.level === "warn").map(i => i.text),
        ...settings, requireSend: s.mode !== "onLock", alwaysVisible: s.mode === "onLock" || before,
        canSend, sites: list,
    })
}

// POST { action: "settings", mode?, notify?, startFrom? }
//      { action: "send" | "unsend", month, year, siteIds }               — whole sites
//      { action: "sendEmployees" | "unsendEmployees", month, year, employeeIds } — chosen employees
export async function POST(req: Request) {
    const g = await guard(req, "payroll.view")
    if (g instanceof NextResponse) return g
    if (!(g.access.isAdmin || SENDERS.some(p => has(g.access, p)))) return NextResponse.json({ error: "Needs Edit payroll (or Mark paid / Lock)" }, { status: 403 })
    const b = await req.json().catch(() => ({}))
    const s = await getRelease()
    const actor = { at: new Date().toISOString(), by: g.access.userId, byName: g.access.name }

    if (b?.action === "settings") {
        if (["manual", "onLock", "onPaid"].includes(b.mode)) { s.mode = b.mode as SendMode; s.requireSend = s.mode !== "onLock" }
        else if (typeof b.requireSend === "boolean") { s.mode = b.requireSend ? "manual" : "onLock"; s.requireSend = b.requireSend }
        if (typeof b.notify === "boolean") s.notify = b.notify
        if (typeof b.startFrom === "string" && /^\d{4}-\d{2}$/.test(b.startFrom)) s.startFrom = b.startFrom
        await saveRelease(s, g.access.userId)
        auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "payroll.payslip_settings", targetType: "Setting", targetId: "payslipRelease", targetName: "Payslips to employees", summary: `${SEND_MODE_LABEL[s.mode]} · in-app note ${s.notify ? "on" : "off"} · from ${s.startFrom}`, ...requestMeta(req) })
        return NextResponse.json({ ok: true, mode: s.mode, notify: s.notify, startFrom: s.startFrom })
    }

    const month = Number(b?.month), year = Number(b?.year)
    if (!month || !year) return NextResponse.json({ error: "Pick the month" }, { status: 400 })
    const k = ym(year, month)

    if (b?.action === "sendEmployees" || b?.action === "unsendEmployees") {
        const ids: string[] = Array.isArray(b?.employeeIds) ? Array.from(new Set(b.employeeIds.filter((x: unknown): x is string => typeof x === "string"))).slice(0, 2000) as string[] : []
        if (!ids.length) return NextResponse.json({ error: "Pick the employees" }, { status: 400 })
        if (b.action === "unsendEmployees") {
            for (const id of ids) if (s.sentEmp[k]) delete s.sentEmp[k][id]
            await saveRelease(s, g.access.userId)
            auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "payroll.payslip_unsend", targetType: "Payroll", targetName: `${k} · ${ids.length} employee(s)`, summary: `Payslips for ${k} taken back for ${ids.length} employee(s)`, ...requestMeta(req) })
            return NextResponse.json({ ok: true, employees: ids.length })
        }
        const rows = await prisma.payroll.findMany({ where: { month, year, employeeId: { in: ids }, status: { not: "DRAFT" } }, select: { employeeId: true } })
        if (!rows.length) return NextResponse.json({ error: "None of these payslips is processed yet — lock payroll first" }, { status: 400 })
        s.sentEmp[k] = s.sentEmp[k] ?? {}
        for (const r of rows) s.sentEmp[k][r.employeeId] = { ...actor, count: 1 }
        await saveRelease(s, g.access.userId)
        const notified = s.notify ? await notifyPayslipReady(rows.map(r => r.employeeId), month, year) : 0
        auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "payroll.payslip_send", targetType: "Payroll", targetName: `${k} · ${rows.length} employee(s)`, summary: `Payslips for ${k} sent to ${rows.length} chosen employee(s)${ids.length > rows.length ? ` (${ids.length - rows.length} still draft, not sent)` : ""}`, ...requestMeta(req) })
        return NextResponse.json({ ok: true, employees: rows.length, skippedDraft: ids.length - rows.length, notified })
    }

    const siteIds: string[] = Array.isArray(b?.siteIds) ? b.siteIds.filter((x: unknown): x is string => typeof x === "string").slice(0, 500) : []
    if (!siteIds.length) return NextResponse.json({ error: "Pick the site(s)" }, { status: 400 })
    const real = siteIds.filter(x => x !== NO_SITE)
    const rows = await prisma.payroll.findMany({
        where: { month, year, status: { not: "DRAFT" }, OR: [...(real.length ? [{ siteId: { in: real } }] : []), ...(siteIds.includes(NO_SITE) ? [{ siteId: null }] : [])] },
        select: { employeeId: true, siteId: true },
    })
    if (b?.action === "unsend") {
        for (const id of siteIds) if (s.sent[k]) delete s.sent[k][id]
        await saveRelease(s, g.access.userId)
        auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "payroll.payslip_unsend", targetType: "Payroll", targetName: `${k} · ${siteIds.length} site(s)`, summary: `Payslips for ${k} taken back for ${siteIds.length} site(s)`, ...requestMeta(req) })
        return NextResponse.json({ ok: true })
    }
    if (!rows.length) return NextResponse.json({ error: "No processed payslips for these sites — lock payroll first" }, { status: 400 })
    s.sent[k] = s.sent[k] ?? {}
    for (const id of siteIds) {
        const count = rows.filter(r => (r.siteId ?? NO_SITE) === id).length
        if (count) s.sent[k][id] = { ...actor, count }
    }
    await saveRelease(s, g.access.userId)
    const notified = s.notify ? await notifyPayslipReady(rows.map(r => r.employeeId), month, year) : 0
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "payroll.payslip_send", targetType: "Payroll", targetName: `${k} · ${siteIds.length} site(s)`, summary: `Payslips for ${k} sent to ${rows.length} employee(s) at ${siteIds.length} site(s)`, ...requestMeta(req) })
    return NextResponse.json({ ok: true, employees: rows.length, notified })
}
