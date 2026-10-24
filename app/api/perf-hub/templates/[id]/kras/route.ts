import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { perfCtx, perfErrorResponse, requireManager, assertDraft, parseKraInput } from "@/lib/perf-hub-db"

// POST — add a KRA to a draft template (appended at the end).
export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        const ctx = await perfCtx(req)
        requireManager(ctx)
        await assertDraft(params.id)
        const data = parseKraInput(await req.json().catch(() => ({})), false)
        const last = await prisma.perfTemplateKra.aggregate({ where: { templateId: params.id }, _max: { sortOrder: true } })
        const kra = await prisma.perfTemplateKra.create({
            data: {
                templateId: params.id, title: data.title!, weight: data.weight!,
                sortOrder: data.sortOrder ?? (last._max.sortOrder ?? -1) + 1,
            },
            include: { kpis: true },
        })
        return NextResponse.json({ kra }, { status: 201 })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_KRA_POST]")
    }
}
