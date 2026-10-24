import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { perfCtx, perfErrorResponse, requireManager, assertDraft, parseKraInput, PerfHubError } from "@/lib/perf-hub-db"

type Params = { params: { kraId: string } }

async function draftKra(kraId: string) {
    const kra = await prisma.perfTemplateKra.findUnique({ where: { id: kraId }, select: { id: true, templateId: true } })
    if (!kra) throw new PerfHubError(404, "KRA not found")
    await assertDraft(kra.templateId)
    return kra
}

// PUT — rename / reweight / reorder a KRA of a draft.
export async function PUT(req: Request, { params }: Params) {
    try {
        const ctx = await perfCtx(req)
        requireManager(ctx)
        await draftKra(params.kraId)
        const data = parseKraInput(await req.json().catch(() => ({})), true)
        const kra = await prisma.perfTemplateKra.update({
            where: { id: params.kraId }, data,
            include: { kpis: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
        })
        return NextResponse.json({ kra })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_KRA_PUT]")
    }
}

// DELETE — a KRA and its KPIs, drafts only.
export async function DELETE(req: Request, { params }: Params) {
    try {
        const ctx = await perfCtx(req)
        requireManager(ctx)
        await draftKra(params.kraId)
        await prisma.perfTemplateKra.delete({ where: { id: params.kraId } })
        return NextResponse.json({ ok: true })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_KRA_DELETE]")
    }
}
