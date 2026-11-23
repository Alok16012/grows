import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, has, auditLater, requestMeta } from "@/lib/access"
import { signRefs } from "@/lib/secure-files"
import { monthRegister, recentMonths, monthSanity, oldDraftMonths, deleteOldDrafts, saveChallanSettings, getChallanSettings, CHALLAN_TYPES, type ChallanType } from "@/lib/challans"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const RECORDERS = ["payroll.markPaid", "payroll.edit"]

// GET ?month&year — that month's dues, challans and sanity check. No month — recent months overview + old drafts.
export async function GET(req: Request) {
    const g = await guard(req, "payroll.view")
    if (g instanceof NextResponse) return g
    const sp = new URL(req.url).searchParams
    const month = Number(sp.get("month")), year = Number(sp.get("year"))
    const canRecord = g.access.isAdmin || RECORDERS.some(p => has(g.access, p))
    const canDeleteDrafts = g.access.isAdmin || has(g.access, "payroll.unlock")
    if (month && year) {
        const [reg, sanity] = await Promise.all([monthRegister(month, year), monthSanity(month, year)])
        // Receipts are private files: send short-lived signed links.
        return NextResponse.json(await signRefs({ ...reg, sanity, canRecord }))
    }
    const [months, drafts, settings] = await Promise.all([recentMonths(8), oldDraftMonths(), getChallanSettings()])
    return NextResponse.json({ months, oldDrafts: drafts, settings, canRecord, canDeleteDrafts })
}

// POST { action: "record", type, month, year, amount, trrnNumber?, paymentDate?, documentUrl?, status? }
//      { action: "attach", id, documentUrl } (paid challan file for an existing record)
//      { action: "remove", id } | { action: "settings", ... } | { action: "deleteDrafts", months: [{year, month}], confirm }
export async function POST(req: Request) {
    const g = await guard(req, "payroll.view")
    if (g instanceof NextResponse) return g
    const b = await req.json().catch(() => ({}))
    const actor = { id: g.access.userId, name: g.access.name }
    const canRecord = g.access.isAdmin || RECORDERS.some(p => has(g.access, p))
    if (b?.action === "deleteDrafts") {
        if (!(g.access.isAdmin || has(g.access, "payroll.unlock"))) return NextResponse.json({ error: "Needs Unlock payroll (or Admin)" }, { status: 403 })
        const months = Array.isArray(b.months) ? b.months.filter((m: any) => Number.isInteger(m?.year) && Number.isInteger(m?.month)).slice(0, 36) : []
        if (!months.length) return NextResponse.json({ error: "Pick the months" }, { status: 400 })
        if (b.confirm !== "DELETE") return NextResponse.json({ error: "Type DELETE to confirm" }, { status: 400 })
        return NextResponse.json(await deleteOldDrafts(months, actor))
    }
    if (!canRecord) return NextResponse.json({ error: "Needs Mark paid or Edit payroll" }, { status: 403 })
    if (b?.action === "settings") {
        const s = await saveChallanSettings(b.settings ?? b, actor.id)
        auditLater({ actorId: actor.id, actorName: actor.name, action: "payroll.challan_settings", targetType: "Setting", targetId: "challanSettings", targetName: "Challan settings", summary: `Due days PF ${s.dueDay.PF} / ESIC ${s.dueDay.ESI} / PT ${s.dueDay.PT} / TDS ${s.dueDay.TDS}; reminder ${s.remindDaysBefore} day(s) before`, after: s, ...requestMeta(req) })
        return NextResponse.json({ settings: s })
    }
    if (b?.action === "remove" && typeof b.id === "string") {
        const c = await prisma.statutoryChallan.findUnique({ where: { id: b.id } })
        if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 })
        await prisma.statutoryChallan.delete({ where: { id: c.id } })
        auditLater({ actorId: actor.id, actorName: actor.name, action: "payroll.challan_remove", targetType: "StatutoryChallan", targetId: c.id, targetName: `${c.type} ${c.month}/${c.year}`, summary: `Challan removed: ${c.type} ${c.month}/${c.year} ₹${c.amount}${c.trrnNumber ? ` (${c.trrnNumber})` : ""}`, before: c, ...requestMeta(req) })
        return NextResponse.json({ ok: true })
    }
    // { action: "attach", id, documentUrl } — the paid challan (PDF / photo) for a record saved without it.
    if (b?.action === "attach" && typeof b.id === "string") {
        const url = typeof b.documentUrl === "string" && (/^sb:\/\//.test(b.documentUrl) || /^https:\/\//.test(b.documentUrl)) ? b.documentUrl : null
        if (!url) return NextResponse.json({ error: "Upload the challan file" }, { status: 400 })
        const c = await prisma.statutoryChallan.findUnique({ where: { id: b.id } })
        if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 })
        const u = await prisma.statutoryChallan.update({ where: { id: c.id }, data: { documentUrl: url } })
        auditLater({ actorId: actor.id, actorName: actor.name, action: "payroll.challan_attach", targetType: "StatutoryChallan", targetId: c.id, targetName: `${c.type} ${c.month}/${c.year}`, summary: `Paid challan uploaded: ${c.type} ${c.month}/${c.year} ₹${c.amount}`, ...requestMeta(req) })
        return NextResponse.json({ challan: u })
    }
    if (b?.action === "record") {
        const type = String(b.type) as ChallanType
        const month = Number(b.month), year = Number(b.year), amount = Number(b.amount)
        if (!(type in CHALLAN_TYPES)) return NextResponse.json({ error: "Pick the challan type" }, { status: 400 })
        if (!month || !year) return NextResponse.json({ error: "Pick the month" }, { status: 400 })
        if (!(amount > 0)) return NextResponse.json({ error: "Enter the amount paid" }, { status: 400 })
        const pd = b.paymentDate ? new Date(`${String(b.paymentDate).slice(0, 10)}T12:00:00+05:30`) : null
        const url = typeof b.documentUrl === "string" && (/^sb:\/\//.test(b.documentUrl) || /^https:\/\//.test(b.documentUrl)) ? b.documentUrl : null
        const c = await prisma.statutoryChallan.create({ data: { type, month, year, amount: Math.round(amount * 100) / 100, trrnNumber: b.trrnNumber ? String(b.trrnNumber).trim().slice(0, 60) : null, paymentDate: pd && !isNaN(pd.getTime()) ? pd : null, status: b.status === "PENDING" ? "PENDING" : "PAID", documentUrl: url } })
        auditLater({ actorId: actor.id, actorName: actor.name, action: "payroll.challan_record", targetType: "StatutoryChallan", targetId: c.id, targetName: `${type} ${month}/${year}`, summary: `Challan recorded: ${CHALLAN_TYPES[type]} ${month}/${year} ₹${c.amount}${c.trrnNumber ? ` (${c.trrnNumber})` : ""}`, after: c, ...requestMeta(req) })
        return NextResponse.json({ challan: c })
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
