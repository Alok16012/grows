import { NextResponse } from "next/server"
import { randomUUID } from "crypto"
import prisma from "@/lib/prisma"
import { perfCtx, perfErrorResponse, requireManager, jsonError } from "@/lib/perf-hub-db"

// GET — every template version with its shape, for the designer list.
export async function GET(req: Request) {
    try {
        const ctx = await perfCtx(req)
        if (!ctx.canView) return jsonError(403, "Forbidden")

        const [templates, assigned] = await Promise.all([
            prisma.perfTemplate.findMany({
                orderBy: [{ name: "asc" }, { version: "desc" }],
                include: { kras: { select: { weight: true, _count: { select: { kpis: true } } } } },
            }),
            prisma.perfAssignment.groupBy({ by: ["templateFamilyId"], _count: { _all: true } }),
        ])
        const assignedByFamily = new Map(assigned.map(a => [a.templateFamilyId, a._count._all]))

        return NextResponse.json({
            templates: templates.map(t => ({
                id: t.id, name: t.name, roleLabel: t.roleLabel, version: t.version, status: t.status,
                familyId: t.familyId, publishedAt: t.publishedAt, createdAt: t.createdAt, updatedAt: t.updatedAt,
                kraCount: t.kras.length,
                kpiCount: t.kras.reduce((n, k) => n + k._count.kpis, 0),
                weightTotal: Math.round(t.kras.reduce((n, k) => n + k.weight, 0) * 100) / 100,
                // Assignments point at the family, so every version shows the same count.
                assignedCount: assignedByFamily.get(t.familyId) ?? 0,
            })),
        })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_TEMPLATES_GET]")
    }
}

// POST — a new template family, starting as DRAFT v1.
export async function POST(req: Request) {
    try {
        const ctx = await perfCtx(req)
        requireManager(ctx)
        const body = await req.json().catch(() => ({}))
        const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : ""
        if (!name) return jsonError(400, "Template name is required")
        const roleLabel = typeof body?.roleLabel === "string" && body.roleLabel.trim() ? body.roleLabel.trim().slice(0, 120) : null

        const template = await prisma.perfTemplate.create({
            data: { name, roleLabel, familyId: randomUUID(), createdBy: ctx.userId },
        })
        return NextResponse.json({ ...template, kras: [] }, { status: 201 })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_TEMPLATES_POST]")
    }
}
