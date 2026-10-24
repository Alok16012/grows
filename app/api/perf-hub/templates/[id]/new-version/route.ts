import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { perfCtx, perfErrorResponse, requireManager, loadTemplate } from "@/lib/perf-hub-db"

// POST — copy a published (or archived) version into the family's next DRAFT.
// One draft per family: if it already exists it's returned instead of a twin.
export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        const ctx = await perfCtx(req)
        requireManager(ctx)
        const src = await loadTemplate(params.id)

        const existing = await prisma.perfTemplate.findFirst({
            where: { familyId: src.familyId, status: "DRAFT" },
            select: { id: true },
        })
        if (existing) return NextResponse.json({ template: await loadTemplate(existing.id), existing: true })

        const id = await prisma.$transaction(async tx => {
            const top = await tx.perfTemplate.aggregate({ where: { familyId: src.familyId }, _max: { version: true } })
            const t = await tx.perfTemplate.create({
                data: {
                    name: src.name, roleLabel: src.roleLabel, familyId: src.familyId,
                    version: (top._max.version ?? src.version) + 1, createdBy: ctx.userId,
                },
            })
            for (const kra of src.kras) {
                const k = await tx.perfTemplateKra.create({
                    data: { templateId: t.id, title: kra.title, weight: kra.weight, sortOrder: kra.sortOrder },
                })
                if (kra.kpis.length) {
                    await tx.perfTemplateKpi.createMany({
                        data: kra.kpis.map(({ id: _id, kraId: _k, templateId: _t, ...kpi }) => ({ ...kpi, kraId: k.id, templateId: t.id })),
                    })
                }
            }
            return t.id
        }, { timeout: 20000 })
        return NextResponse.json({ template: await loadTemplate(id) }, { status: 201 })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_TEMPLATE_NEW_VERSION]")
    }
}
