import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard } from "@/lib/access"
import { isMissingTableErr } from "@/lib/asset-workflow"
import { processQueue } from "@/lib/comm/engine"

export const dynamic = "force-dynamic"

// GET ?channel=&status=&event=&audience=&q=&page= — every message, newest first.
export async function GET(req: Request) {
    const g = await guard(req, ["whatsapp.view", "whatsapp.edit"])
    if (g instanceof NextResponse) return g
    const sp = new URL(req.url).searchParams
    const q = (sp.get("q") || "").trim()
    const page = Math.max(1, Number(sp.get("page")) || 1)
    const take = 50
    const where: any = {
        ...(sp.get("channel") ? { channel: sp.get("channel") } : {}),
        ...(sp.get("status") ? { status: sp.get("status") } : {}),
        ...(sp.get("event") ? { event: sp.get("event") } : {}),
        ...(sp.get("audience") ? { recipientType: sp.get("audience") } : {}),
        ...(q ? { OR: [{ toAddress: { contains: q.replace(/[^\d]/g, "") && /^\+?\d/.test(q) ? q.replace(/[^\d]/g, "") : q, mode: "insensitive" } }, { recipientName: { contains: q, mode: "insensitive" } }, { subject: { contains: q, mode: "insensitive" } }] } : {}),
    }
    try {
        const [rows, total] = await Promise.all([
            prisma.commMessage.findMany({
                where, orderBy: { createdAt: "desc" }, take, skip: (page - 1) * take,
                select: { id: true, channel: true, event: true, recipientType: true, recipientName: true, toAddress: true, subject: true, status: true, error: true, attempts: true, nextAttemptAt: true, createdAt: true, sentAt: true, deliveredAt: true, readAt: true },
            }),
            prisma.commMessage.count({ where }),
        ])
        return NextResponse.json({ rows, total, page, pages: Math.ceil(total / take) })
    } catch (e) {
        if (isMissingTableErr(e)) return NextResponse.json({ rows: [], total: 0, page: 1, pages: 0, installed: false })
        throw e
    }
}

// POST { id } — send a failed (or skipped-by-mistake) message again.
export async function POST(req: Request) {
    const g = await guard(req, "whatsapp.edit")
    if (g instanceof NextResponse) return g
    const b = await req.json().catch(() => ({}))
    const id = typeof b?.id === "string" ? b.id : ""
    const m = await prisma.commMessage.findUnique({ where: { id }, select: { id: true, status: true, toAddress: true } })
    if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (!["failed", "skipped"].includes(m.status)) return NextResponse.json({ error: "Only failed or skipped messages can be resent." }, { status: 400 })
    if (!m.toAddress) return NextResponse.json({ error: "There is no address to send to." }, { status: 400 })
    await prisma.commMessage.update({ where: { id }, data: { status: "queued", attempts: 0, nextAttemptAt: new Date(), error: null } })
    const r = await processQueue({ ids: [id], budgetMs: 15_000 })
    const after = await prisma.commMessage.findUnique({ where: { id }, select: { status: true, error: true } })
    return NextResponse.json({ ok: after?.status === "sent", status: after?.status, error: after?.error, ...r })
}
