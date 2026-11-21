import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { nextDefectCode, autoLinkDefects, parseDefect, clashWith, canManageQuality, QUALITY_VIEW, QUALITY_MANAGE } from "@/lib/defect-library"

export const dynamic = "force-dynamic"

// GET — the defect library with how widely each defect is used.
export async function GET(req: Request) {
    const g = await guard(req, QUALITY_VIEW)
    if (g instanceof NextResponse) return g
    try {
        const [defects, usage] = await Promise.all([
            prisma.defectType.findMany({ orderBy: [{ isActive: "desc" }, { code: "asc" }] }),
            prisma.formTemplate.groupBy({ by: ["defectTypeId"], where: { defectTypeId: { not: null } }, _count: { _all: true } }),
        ])
        const projects = await prisma.formTemplate.findMany({
            where: { defectTypeId: { not: null } }, select: { defectTypeId: true, projectId: true }, distinct: ["defectTypeId", "projectId"],
        })
        const fieldsOf = new Map(usage.map(u => [u.defectTypeId!, u._count._all]))
        const projectsOf = new Map<string, number>()
        for (const p of projects) projectsOf.set(p.defectTypeId!, (projectsOf.get(p.defectTypeId!) ?? 0) + 1)
        return NextResponse.json({
            defects: defects.map(d => ({ ...d, fields: fieldsOf.get(d.id) ?? 0, projects: projectsOf.get(d.id) ?? 0 })),
            canManage: canManageQuality(g.access),
        })
    } catch (e: any) {
        if (e?.code === "P2021" || /DefectType/.test(String(e?.message))) return NextResponse.json({ error: "The defect library isn't set up in the database yet." }, { status: 503 })
        console.error("[QUALITY_DEFECTS_GET]", e)
        return NextResponse.json({ error: "Could not load the defect library" }, { status: 500 })
    }
}

// POST — add a defect to the library (then link matching project columns).
export async function POST(req: Request) {
    const g = await guard(req, QUALITY_MANAGE)
    if (g instanceof NextResponse) return g
    try {
        const data = parseDefect(await req.json().catch(() => ({})), false)
        const clash = await clashWith([data.name!, ...(data.aliases ?? [])])
        if (clash) return NextResponse.json({ error: `That name is already used by ${clash}` }, { status: 409 })
        let created = null
        for (let i = 0; i < 3 && !created; i++) {
            try {
                created = await prisma.defectType.create({ data: { ...data, name: data.name!, code: await nextDefectCode(), createdBy: g.access.userId } })
            } catch (e: any) { if (e?.code !== "P2002") throw e }
        }
        if (!created) return NextResponse.json({ error: "Could not create — try again" }, { status: 409 })
        const linked = await autoLinkDefects()
        auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "quality.defect_create", targetType: "DefectType", targetId: created.id, targetName: `${created.code} ${created.name}`, summary: "Defect added to the library", after: created, ...requestMeta(req) })
        return NextResponse.json({ defect: created, linked }, { status: 201 })
    } catch (e: any) {
        if (e instanceof Error && !("code" in e)) return NextResponse.json({ error: e.message }, { status: 400 })
        console.error("[QUALITY_DEFECTS_POST]", e)
        return NextResponse.json({ error: "Could not save" }, { status: 500 })
    }
}
