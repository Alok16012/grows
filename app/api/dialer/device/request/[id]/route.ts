import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { deviceFrom } from "@/lib/dialer-server"

export const dynamic = "force-dynamic"

// POST { status: "DIALING" | "FAILED" } — the phone picked up a click-to-call request.
export async function POST(req: Request, { params }: { params: { id: string } }) {
    const d = await deviceFrom(req)
    if (!d) return NextResponse.json({ error: "Not paired" }, { status: 401 })
    const b = await req.json().catch(() => ({}))
    const status = b?.status === "FAILED" ? "FAILED" : "DIALING"
    const n = await prisma.dialRequest.updateMany({ where: { id: params.id, userId: d.user.id, status: { in: ["PENDING", "DIALING"] } }, data: { status, pickedAt: new Date(), deviceId: d.device.id } })
    return NextResponse.json({ ok: n.count > 0 })
}
