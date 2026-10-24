import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { publishProblem } from "@/lib/perf-hub"
import { perfCtx, perfErrorResponse, requireManager, jsonError, loadTemplate, PerfHubError } from "@/lib/perf-hub-db"

// POST — publish a draft; the family's previous live version is archived so
// assigned employees move to this one on their next report.
export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        const ctx = await perfCtx(req)
        requireManager(ctx)
        const t = await loadTemplate(params.id)
        if (t.status !== "DRAFT") return jsonError(409, "Only a draft can be published")
        const problem = publishProblem(t)
        if (problem) return jsonError(400, problem)

        await prisma.$transaction(async tx => {
            await tx.perfTemplate.updateMany({
                where: { familyId: t.familyId, status: "PUBLISHED", id: { not: t.id } },
                data: { status: "ARCHIVED" },
            })
            // Guarded on status so a double click can't publish twice.
            const res = await tx.perfTemplate.updateMany({
                where: { id: t.id, status: "DRAFT" },
                data: { status: "PUBLISHED", publishedAt: new Date() },
            })
            if (res.count === 0) throw new PerfHubError(409, "Only a draft can be published")
        })
        return NextResponse.json({ template: await loadTemplate(t.id) })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_TEMPLATE_PUBLISH]")
    }
}
