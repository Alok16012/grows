import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard } from "@/lib/access"
import { inspectionScopeForApprover } from "@/lib/approval-scope"
import { QUALITY_VIEW } from "@/lib/defect-library"

export const dynamic = "force-dynamic"
const DAY = 86_400_000

// GET ?from&to&siteId&projectId — defects across all customers, by library
// defect (approved reports, submitted in the range, the caller's scope).
export async function GET(req: Request) {
    const g = await guard(req, QUALITY_VIEW)
    if (g instanceof NextResponse) return g
    try {
        const sp = new URL(req.url).searchParams
        const to = sp.get("to") ? new Date(sp.get("to") + "T23:59:59+05:30") : new Date()
        const from = sp.get("from") ? new Date(sp.get("from") + "T00:00:00+05:30") : new Date(to.getTime() - 30 * DAY)
        if (isNaN(from.getTime()) || isNaN(to.getTime())) return NextResponse.json({ error: "Dates must be YYYY-MM-DD" }, { status: 400 })
        const siteId = sp.get("siteId") || undefined
        const projectId = sp.get("projectId") || undefined

        const scope = await inspectionScopeForApprover(g.session)
        const inspections = await prisma.inspection.findMany({
            where: {
                AND: [scope ?? {}, {
                    status: "approved", submittedAt: { gte: from, lte: to },
                    ...(siteId || projectId ? { assignment: { project: { ...(siteId ? { siteId } : {}), ...(projectId ? { id: projectId } : {}) } } } : {}),
                }],
            },
            select: { id: true },
            take: 20000,
        })
        const ids = inspections.map(i => i.id)
        if (!ids.length) return NextResponse.json({ rows: [], unmapped: [], totals: { reports: 0, qty: 0, mappedQty: 0 } })

        const rows: { defectTypeId: string | null; label: string; qty: number; reports: number; projects: number }[] = await prisma.$queryRawUnsafe(`
            SELECT f."defectTypeId",
                   CASE WHEN f."defectTypeId" IS NULL THEN upper(regexp_replace(trim(f."fieldLabel"), '\\s+', ' ', 'g')) ELSE '' END AS label,
                   SUM(d.value::numeric)::float AS qty,
                   COUNT(DISTINCT d."inspectionId")::int AS reports,
                   COUNT(DISTINCT f."projectId")::int AS projects
            FROM "InspectionData" d
            JOIN "FormTemplate" f ON f.id = d."fieldId"
            WHERE f.category = 'DEFECT' AND d."inspectionId" = ANY($1::text[])
              AND d.value ~ '^[0-9]+(\\.[0-9]+)?$' AND d.value::numeric > 0
            GROUP BY 1, 2`, ids)

        const lib = await prisma.defectType.findMany({ select: { id: true, code: true, name: true, severity: true, category: true } })
        const libOf = new Map(lib.map(d => [d.id, d]))
        const mapped = rows.filter(r => r.defectTypeId && libOf.has(r.defectTypeId)).map(r => ({ ...libOf.get(r.defectTypeId!)!, qty: Math.round(r.qty), reports: r.reports, projects: r.projects }))
            .sort((a, b) => b.qty - a.qty)
        const unmapped = rows.filter(r => !r.defectTypeId).map(r => ({ label: r.label, qty: Math.round(r.qty), reports: r.reports, projects: r.projects })).sort((a, b) => b.qty - a.qty)
        const mappedQty = mapped.reduce((n, r) => n + r.qty, 0)
        const qty = mappedQty + unmapped.reduce((n, r) => n + r.qty, 0)
        const bySeverity = { CRITICAL: 0, MAJOR: 0, MINOR: 0 } as Record<string, number>
        for (const r of mapped) bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + r.qty
        return NextResponse.json({ rows: mapped, unmapped: unmapped.slice(0, 50), totals: { reports: ids.length, qty, mappedQty, bySeverity } })
    } catch (e) {
        console.error("[QUALITY_PARETO]", e)
        return NextResponse.json({ error: "Could not build the Pareto" }, { status: 500 })
    }
}
