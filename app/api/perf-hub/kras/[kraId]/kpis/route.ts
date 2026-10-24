import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { perfCtx, perfErrorResponse, requireManager, assertDraft, normalizeKpi, jsonError } from "@/lib/perf-hub-db"

// POST — add a KPI under a KRA of a draft template.
export async function POST(req: Request, { params }: { params: { kraId: string } }) {
    try {
        const ctx = await perfCtx(req)
        requireManager(ctx)
        const kra = await prisma.perfTemplateKra.findUnique({ where: { id: params.kraId }, select: { id: true, templateId: true } })
        if (!kra) return jsonError(404, "KRA not found")
        await assertDraft(kra.templateId)

        const data = await normalizeKpi(await req.json().catch(() => ({})))
        const last = await prisma.perfTemplateKpi.aggregate({ where: { kraId: kra.id }, _max: { sortOrder: true } })
        const kpi = await prisma.perfTemplateKpi.create({
            data: {
                ...data,
                sortOrder: data.sortOrder ?? (last._max.sortOrder ?? -1) + 1,
                kraId: kra.id, templateId: kra.templateId,
            } as Prisma.PerfTemplateKpiUncheckedCreateInput,
        })
        return NextResponse.json({ kpi }, { status: 201 })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_KPI_POST]")
    }
}
