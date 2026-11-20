import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, employeeScope, auditLater, requestMeta } from "@/lib/access"
import { isMissingTableErr } from "@/lib/asset-workflow"
import { waConfig, waPhone, waEventTemplate, uploadMedia, sendTemplate } from "@/lib/whatsapp"
import { loadPayslip, renderPayslip, payslipFilename } from "@/lib/payslip-pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

// Payroll → Pay & slips → Send on WhatsApp.
// GET  ?month=&year=&siteId=  — who would get a slip: locked rows only, with a
//      valid mobile, and whether one was already sent.
// POST { month, year, payrollIds (≤10), resend? } — sends those slips. The page
//      calls this in small batches and shows progress.
// Each slip is rendered to PDF, uploaded to WhatsApp's media store and sent by
// media id — so no public link to anyone's salary ever exists.
const PERMS = ["payroll.markPaid", "payroll.manage"]
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const DONE = ["sent", "delivered", "read"]

async function sentMap(ids: string[]) {
    const m = new Map<string, { status: string; at: Date }>()
    if (!ids.length) return m
    try {
        const rows = await prisma.whatsAppMessage.findMany({
            where: { event: "payslip", refType: "Payroll", refId: { in: ids } },
            orderBy: { createdAt: "asc" }, select: { refId: true, status: true, createdAt: true },
        })
        for (const r of rows) if (r.refId) m.set(r.refId, { status: r.status, at: r.createdAt })   // latest wins
    } catch (e) { if (!isMissingTableErr(e)) throw e }
    return m
}

export async function GET(req: Request) {
    const g = await guard(req, PERMS)
    if (g instanceof NextResponse) return g
    const { searchParams } = new URL(req.url)
    const month = Number(searchParams.get("month")), year = Number(searchParams.get("year"))
    if (!(month >= 1 && month <= 12) || !(year >= 2000)) return NextResponse.json({ error: "Pick a month and year." }, { status: 400 })
    const siteId = searchParams.get("siteId") || null
    const scope = await employeeScope(g.access)
    const rows = await prisma.payroll.findMany({
        where: { month, year, ...(siteId ? { siteId } : {}), ...(scope ? { employee: scope } : {}) },
        select: { id: true, status: true, employee: { select: { employeeId: true, firstName: true, lastName: true, phone: true } } },
    })
    const sent = await sentMap(rows.map(r => r.id))
    const tpl = await waEventTemplate("payslip")
    const list = rows.map(r => ({
        id: r.id, empCode: r.employee.employeeId, name: `${r.employee.firstName} ${r.employee.lastName ?? ""}`.trim(),
        locked: r.status !== "DRAFT", phoneOk: !!waPhone(r.employee.phone),
        last: sent.get(r.id) ?? null,
    }))
    return NextResponse.json({
        connected: !!waConfig(),
        template: tpl ? `${tpl.template} (${tpl.language})` : null,
        total: list.length,
        draft: list.filter(x => !x.locked).length,
        noPhone: list.filter(x => x.locked && !x.phoneOk).length,
        alreadySent: list.filter(x => x.locked && x.phoneOk && x.last && DONE.includes(x.last.status)).length,
        ready: list.filter(x => x.locked && x.phoneOk && !(x.last && DONE.includes(x.last.status))).map(x => x.id),
        sendable: list.filter(x => x.locked && x.phoneOk).map(x => x.id),
        failed: list.filter(x => x.last?.status === "failed").length,
    })
}

export async function POST(req: Request) {
    const g = await guard(req, PERMS)
    if (g instanceof NextResponse) return g
    const b = await req.json().catch(() => ({}))
    const ids: string[] = Array.from(new Set((Array.isArray(b?.payrollIds) ? b.payrollIds : []).filter((x: unknown): x is string => typeof x === "string")))
    if (!ids.length) return NextResponse.json({ error: "No slips to send." }, { status: 400 })
    if (ids.length > 10) return NextResponse.json({ error: "At most 10 slips per request." }, { status: 400 })
    if (!waConfig()) return NextResponse.json({ error: "WhatsApp is not connected yet (Settings → WhatsApp)." }, { status: 409 })
    const tpl = await waEventTemplate("payslip")
    if (!tpl) return NextResponse.json({ error: "Choose and switch on the salary slip template in Settings → WhatsApp." }, { status: 409 })
    const resend = b?.resend === true

    const scope = await employeeScope(g.access)
    const sent = await sentMap(ids)
    const siteNames = new Map<string, string>()
    const results: { id: string; ok: boolean; skipped?: string; error?: string }[] = []

    for (const id of ids) {
        const p = await loadPayslip(id)
        if (!p) { results.push({ id, ok: false, error: "Not found" }); continue }
        if (scope && !(await prisma.employee.count({ where: { AND: [{ id: p.employee.id }, scope] } }))) { results.push({ id, ok: false, error: "Not in your scope" }); continue }
        // Only final figures leave the building.
        if (p.status === "DRAFT") { results.push({ id, ok: false, skipped: "Month not locked" }); continue }
        const to = waPhone(p.employee.phone)
        if (!to) { results.push({ id, ok: false, skipped: "No valid mobile" }); continue }
        const last = sent.get(id)
        if (!resend && last && DONE.includes(last.status)) { results.push({ id, ok: true, skipped: "Already sent" }); continue }

        let site = ""
        if (p.siteId) {
            if (!siteNames.has(p.siteId)) siteNames.set(p.siteId, (await prisma.site.findUnique({ where: { id: p.siteId }, select: { name: true } }))?.name ?? "")
            site = siteNames.get(p.siteId) ?? ""
        }
        try {
            const pdf = await renderPayslip(p, site)
            const filename = payslipFilename(p)
            const media = await uploadMedia(pdf, filename)
            if (!media.ok) { results.push({ id, ok: false, error: media.error }); continue }
            const r = await sendTemplate({
                to, template: tpl.template, language: tpl.language,
                header: { type: "document", id: media.id, filename },
                body: [p.employee.firstName, `${MONTHS[p.month - 1]} ${p.year}`],
                event: "payslip", refType: "Payroll", refId: p.id,
                recipientName: `${p.employee.firstName} ${p.employee.lastName ?? ""}`.trim(), employeeId: p.employee.id,
                sentBy: g.access.userId,
            })
            results.push(r.ok ? { id, ok: true } : { id, ok: false, error: r.error })
        } catch (e: any) {
            console.error("[PAYSLIP_WA]", e)
            results.push({ id, ok: false, error: e?.message || "Could not send" })
        }
    }

    const okCount = results.filter(r => r.ok && !r.skipped).length
    if (okCount) {
        auditLater({
            actorId: g.access.userId, actorName: g.access.name, action: "payslip.whatsapp", targetType: "Payroll",
            targetId: null, targetName: null, summary: `Salary slips sent on WhatsApp: ${okCount}${resend ? " (resend)" : ""}`,
            after: { sent: okCount, requested: ids.length }, ...requestMeta(req),
        })
    }
    return NextResponse.json({ results })
}
