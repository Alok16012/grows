import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { parseSkill } from "@/lib/skills"

export const dynamic = "force-dynamic"

// PATCH — edit a skill (name, category, site, linked course, active).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    const g = await guard(req, "lms.manage")
    if (g instanceof NextResponse) return g
    try {
        const data = parseSkill(await req.json().catch(() => ({})), true)
        const skill = await prisma.skill.update({ where: { id: params.id }, data })
        auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "lms.skill_edit", targetType: "Skill", targetId: skill.id, targetName: `${skill.code} ${skill.name}`, summary: "Skill edited", after: skill, ...requestMeta(req) })
        return NextResponse.json({ skill })
    } catch (e: any) {
        if (e?.code === "P2025") return NextResponse.json({ error: "Skill not found" }, { status: 404 })
        if (e instanceof Error && !("code" in e)) return NextResponse.json({ error: e.message }, { status: 400 })
        console.error("[SKILL_PATCH]", e)
        return NextResponse.json({ error: "Could not save" }, { status: 500 })
    }
}
