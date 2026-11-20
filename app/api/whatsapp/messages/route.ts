import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard } from "@/lib/access"
import { isMissingTableErr } from "@/lib/asset-workflow"

export const dynamic = "force-dynamic"

// GET ?status=&event=&q=&page= — the WhatsApp message log, newest first.
export async function GET(req: Request) {
    const g = await guard(req, ["whatsapp.view", "whatsapp.edit"])
    if (g instanceof NextResponse) return g
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status") || undefined
    const event = searchParams.get("event") || undefined
    const q = (searchParams.get("q") || "").trim()
    const page = Math.max(1, Number(searchParams.get("page")) || 1)
    const take = 50
    const where = {
        ...(status ? { status } : {}),
        ...(event ? { event } : {}),
        ...(q ? { OR: [{ toPhone: { contains: q.replace(/\D/g, "") || q } }, { recipientName: { contains: q, mode: "insensitive" as const } }, { template: { contains: q } }] } : {}),
    }
    try {
        const [rows, total] = await Promise.all([
            prisma.whatsAppMessage.findMany({
                where, orderBy: { createdAt: "desc" }, take, skip: (page - 1) * take,
                select: { id: true, toPhone: true, recipientName: true, event: true, template: true, status: true, error: true, createdAt: true, sentAt: true, deliveredAt: true, readAt: true },
            }),
            prisma.whatsAppMessage.count({ where }),
        ])
        return NextResponse.json({ rows, total, page, pages: Math.ceil(total / take) })
    } catch (e) {
        if (isMissingTableErr(e)) return NextResponse.json({ rows: [], total: 0, page: 1, pages: 0, installed: false })
        console.error("[WA_MESSAGES]", e)
        return NextResponse.json({ error: "Could not load messages." }, { status: 500 })
    }
}
