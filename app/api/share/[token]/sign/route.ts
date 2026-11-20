import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { isMissingTableErr } from "@/lib/asset-workflow"

export const dynamic = "force-dynamic"

// POST { name, signature } — the customer acknowledges a shared report.
// Public (the share token is the key), once per report, approved reports only.
export async function POST(req: Request, { params }: { params: { token: string } }) {
    const b = await req.json().catch(() => ({}))
    const name = String(b?.name ?? "").trim().slice(0, 80)
    const signature = String(b?.signature ?? "")
    if (name.length < 2) return NextResponse.json({ error: "Please type your name." }, { status: 400 })
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature) || signature.length > 300_000) {
        return NextResponse.json({ error: "Please sign in the box." }, { status: 400 })
    }
    try {
        const link = await prisma.shareableLink.findUnique({
            where: { token: params.token },
            select: { expiresAt: true, inspection: { select: { id: true, status: true, customerSignedAt: true } } },
        })
        if (!link) return NextResponse.json({ error: "Link not found." }, { status: 404 })
        if (link.expiresAt && link.expiresAt < new Date()) return NextResponse.json({ error: "This link has expired." }, { status: 410 })
        if (link.inspection.status !== "approved") return NextResponse.json({ error: "This report is no longer available." }, { status: 410 })
        if (link.inspection.customerSignedAt) return NextResponse.json({ error: "This report was already acknowledged." }, { status: 409 })
        const r = await prisma.inspection.updateMany({
            where: { id: link.inspection.id, customerSignedAt: null },
            data: { customerSignature: signature, customerSignedName: name, customerSignedAt: new Date() },
        })
        if (!r.count) return NextResponse.json({ error: "This report was already acknowledged." }, { status: 409 })
        return NextResponse.json({ ok: true })
    } catch (e) {
        if (isMissingTableErr(e)) return NextResponse.json({ error: "Not available yet." }, { status: 503 })
        console.error("[SHARE_SIGN]", e)
        return NextResponse.json({ error: "Could not save." }, { status: 500 })
    }
}
