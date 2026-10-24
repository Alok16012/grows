import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { perfCtx, perfErrorResponse, requireManager, assertDraft, normalizeKpi, jsonError } from "@/lib/perf-hub-db"

type Params = { params: { kpiId: string } }

// PUT — edit a KPI of a draft template; only the fields sent change.
export async function PUT(req: Request, { params }: Params) {
    try {
        const ctx = await perfCtx(req)
        requireManager(ctx)
        const existing = await prisma.perfTemplateKpi.findUnique({ where: { id: params.kpiId } })
        if (!existing) return jsonError(404, "KPI not found")
        await assertDraft(existing.templateId)

        const body = await req.json().catch(() => ({}))
        const data = await normalizeKpi(body, existing)
        // Moving to another KRA must stay inside the same template.
        if (body?.kraId && body.kraId !== existing.kraId) {
            const kra = await prisma.perfTemplateKra.findUnique({ where: { id: String(body.kraId) }, select: { templateId: true } })
            if (!kra || kra.templateId !== existing.templateId) return jsonError(400, "KRA not found in this template")
            data.kraId = String(body.kraId)
        }
        const kpi = await prisma.perfTemplateKpi.update({ where: { id: params.kpiId }, data })
        return NextResponse.json({ kpi })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_KPI_PUT]")
    }
}

export async function DELETE(req: Request, { params }: Params) {
    try {
        const ctx = await perfCtx(req)
        requireManager(ctx)
        const existing = await prisma.perfTemplateKpi.findUnique({ where: { id: params.kpiId }, select: { templateId: true } })
        if (!existing) return jsonError(404, "KPI not found")
        await assertDraft(existing.templateId)
        await prisma.perfTemplateKpi.delete({ where: { id: params.kpiId } })
        return NextResponse.json({ ok: true })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_KPI_DELETE]")
    }
}
