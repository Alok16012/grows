import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard } from "@/lib/access"
import { inspectionScopeForApprover } from "@/lib/approval-scope"
import { QUALITY_VIEW } from "@/lib/defect-library"
import { TRACE_ROLES } from "@/lib/report-roles"
import { reportFigures } from "@/lib/inspection-customers"

export const dynamic = "force-dynamic"

// Labels that hold traceability data even without a Form Builder role.
const TRACE_LABEL = /\b(LOT|BATCH|HEAT|SERIAL|MACHINE|LINE NO|SUPPLIER|VENDOR|INVOICE|CHALLAN|CUSTOMER PART)\b/i

// GET ?q=LOT123 — every inspection whose lot / batch / machine / supplier /
// part-number field contains the text, with its quantities. Caller's scope.
export async function GET(req: Request) {
    const g = await guard(req, QUALITY_VIEW)
    if (g instanceof NextResponse) return g
    try {
        const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100)
        if (q.length < 2) return NextResponse.json({ error: "Type at least 2 characters" }, { status: 400 })

        const scope = await inspectionScopeForApprover(g.session)
        const hits = await prisma.inspectionData.findMany({
            where: {
                value: { contains: q, mode: "insensitive" },
                field: { category: { not: "DEFECT" } },
                inspection: { AND: [scope ?? {}, { status: { in: ["pending", "approved", "rejected"] } }] },
            },
            select: { inspectionId: true, value: true, field: { select: { fieldLabel: true, reportRole: true } } },
            take: 2000,
        })
        const trace = hits.filter(h => (h.field.reportRole && TRACE_ROLES.includes(h.field.reportRole)) || TRACE_LABEL.test(h.field.fieldLabel))
        const matchOf = new Map<string, { label: string; value: string }[]>()
        for (const h of trace) matchOf.set(h.inspectionId, [...(matchOf.get(h.inspectionId) ?? []), { label: h.field.fieldLabel, value: h.value ?? "" }])
        const ids = Array.from(matchOf.keys()).slice(0, 200)
        if (!ids.length) return NextResponse.json({ rows: [], truncated: false })

        const insp = await prisma.inspection.findMany({
            where: { id: { in: ids } },
            select: {
                id: true, status: true, submittedAt: true, approvedAt: true,
                submitter: { select: { name: true } },
                assignment: { select: { project: { select: { name: true, site: { select: { name: true } } } } } },
                responses: { select: { value: true, field: { select: { fieldLabel: true, category: true, reportRole: true } } } },
            },
            orderBy: { submittedAt: "desc" },
        })
        const rows = insp.map(i => {
            const f = reportFigures(i.responses as any)
            return {
                id: i.id, status: i.status, submittedAt: i.submittedAt, approvedAt: i.approvedAt,
                inspector: i.submitter?.name ?? null,
                project: i.assignment.project.name, site: i.assignment.project.site?.name ?? null,
                part: f.part, inspected: f.inspected, rework: f.rework, rejected: f.rejected,
                topDefects: f.defects.sort((a, b) => b.qty - a.qty).slice(0, 3),
                matches: matchOf.get(i.id) ?? [],
            }
        })
        const totals = rows.reduce((t, r) => ({ inspected: t.inspected + (r.inspected || 0), rework: t.rework + (r.rework || 0), rejected: t.rejected + (r.rejected || 0) }), { inspected: 0, rework: 0, rejected: 0 })
        return NextResponse.json({ rows, totals, truncated: matchOf.size > ids.length })
    } catch (e) {
        console.error("[QUALITY_TRACE]", e)
        return NextResponse.json({ error: "Search failed" }, { status: 500 })
    }
}
