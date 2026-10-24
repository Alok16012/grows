import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { perfCtx, perfErrorResponse, requireManager, jsonError, loadTemplate, assertDraft } from "@/lib/perf-hub-db"

type Params = { params: { id: string } }

// GET — one version with KRAs → KPIs.
export async function GET(req: Request, { params }: Params) {
    try {
        const ctx = await perfCtx(req)
        if (!ctx.canView) return jsonError(403, "Forbidden")
        return NextResponse.json({ template: await loadTemplate(params.id) })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_TEMPLATE_GET]")
    }
}

// PUT — rename / relabel a draft.
export async function PUT(req: Request, { params }: Params) {
    try {
        const ctx = await perfCtx(req)
        requireManager(ctx)
        await assertDraft(params.id)
        const body = await req.json().catch(() => ({}))
        const data: { name?: string; roleLabel?: string | null } = {}
        if (body?.name !== undefined) {
            const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : ""
            if (!name) return jsonError(400, "Template name is required")
            data.name = name
        }
        if (body?.roleLabel !== undefined) {
            data.roleLabel = typeof body.roleLabel === "string" && body.roleLabel.trim() ? body.roleLabel.trim().slice(0, 120) : null
        }
        await prisma.perfTemplate.update({ where: { id: params.id }, data })
        return NextResponse.json({ template: await loadTemplate(params.id) })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_TEMPLATE_PUT]")
    }
}

// DELETE — drafts only; published/archived versions are history for reports.
export async function DELETE(req: Request, { params }: Params) {
    try {
        const ctx = await perfCtx(req)
        requireManager(ctx)
        await assertDraft(params.id)
        await prisma.perfTemplate.delete({ where: { id: params.id } })
        return NextResponse.json({ ok: true })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_TEMPLATE_DELETE]")
    }
}
