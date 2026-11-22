import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard } from "@/lib/access"
import { applyMovement } from "@/lib/employee-movement"

export const dynamic = "force-dynamic"

// PUT { action: "cancel" | "applyNow" } — a scheduled movement only.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
    const g = await guard(req, "employees.edit")
    if (g instanceof NextResponse) return g
    const b = await req.json().catch(() => ({}))
    const m = await prisma.employeeMovement.findUnique({ where: { id: params.id } })
    if (!m || m.status !== "SCHEDULED") return NextResponse.json({ error: "Only a scheduled change can be changed" }, { status: 400 })
    if (b?.action === "cancel") { await prisma.employeeMovement.update({ where: { id: m.id }, data: { status: "CANCELLED" } }); return NextResponse.json({ ok: true }) }
    if (b?.action === "applyNow") { await applyMovement(m.id, { id: g.access.userId, name: g.access.name }); return NextResponse.json({ ok: true }) }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
