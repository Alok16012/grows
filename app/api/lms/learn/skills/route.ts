import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard } from "@/lib/access"

export const dynamic = "force-dynamic"

// GET — my skill levels (My Learning → My skills).
export async function GET(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    try {
        const me = await prisma.employee.findUnique({ where: { userId: g.access.userId }, select: { id: true } })
        if (!me) return NextResponse.json({ skills: [] })
        const rows = await prisma.employeeSkill.findMany({
            where: { employeeId: me.id, skill: { isActive: true } },
            select: { level: true, source: true, assessedAt: true, skill: { select: { code: true, name: true, category: true } } },
            orderBy: { level: "desc" },
        })
        return NextResponse.json({ skills: rows })
    } catch (e: any) {
        if (e?.code === "P2021") return NextResponse.json({ skills: [] })
        console.error("[MY_SKILLS]", e)
        return NextResponse.json({ error: "Could not load" }, { status: 500 })
    }
}
