import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard } from "@/lib/access"
import { canEditAny, canSeeTeam } from "@/lib/dialer-server"

export const dynamic = "force-dynamic"

// GET — active logins to assign leads to (for people who manage leads or see the team).
export async function GET(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    if (!canEditAny(g.access) && !canSeeTeam(g.access)) return NextResponse.json({ users: [] })
    const users = await prisma.user.findMany({ where: { isActive: true, role: { not: "CLIENT" as any } }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 3000 })
    return NextResponse.json({ users })
}
