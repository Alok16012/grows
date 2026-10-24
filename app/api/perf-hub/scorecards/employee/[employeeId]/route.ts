import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { monthPeriod, monthKey } from "@/lib/perf-hub"
import {
    perfCtx, perfErrorResponse, jsonError, myEmployeeId, canSeeEmployee, buildScorecards, EMPLOYEE_SELECT,
} from "@/lib/perf-hub-db"

// GET — one employee's month, KPI by KPI ("me" = the caller). Feeds My
// Performance and the team drill-down.
export async function GET(req: Request, { params }: { params: { employeeId: string } }) {
    try {
        const ctx = await perfCtx(req)
        const sp = new URL(req.url).searchParams
        const month = monthPeriod(sp.get("month"))
        if (!month) return jsonError(400, "month must be YYYY-MM")
        const approvedOnly = sp.get("approvedOnly") === "1" || sp.get("approvedOnly") === "true"

        const employeeId = params.employeeId === "me" ? myEmployeeId(ctx) : params.employeeId
        if (!(await canSeeEmployee(ctx, employeeId))) return jsonError(403, "Forbidden")

        const [card] = await buildScorecards([employeeId], month, approvedOnly)
        if (!card) {
            const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: EMPLOYEE_SELECT })
            if (!employee) return jsonError(404, "Employee not found")
            return NextResponse.json({
                month: monthKey(month), employee, roleLabel: null, template: null, kras: [],
                overall: null, grade: null, compliance: null, red: 0, pending: 0, assigned: false,
            })
        }
        return NextResponse.json({
            month: monthKey(month),
            employee: card.employee,
            roleLabel: card.roleLabel,
            template: card.template,
            kras: card.breakdown.kras.map(k => ({
                id: k.id, title: k.title, weight: k.weight, pct: k.pct,
                kpis: k.kpis.map(kpi => ({
                    id: kpi.id, name: kpi.name, code: (kpi as { code?: string | null }).code ?? null,
                    frequency: kpi.frequency, valueType: kpi.valueType, direction: kpi.direction,
                    target: kpi.target, targetLabel: (kpi as { targetLabel?: string | null }).targetLabel ?? null,
                    weightage: kpi.weightage, rollup: kpi.rollup, greenAt: kpi.greenAt, amberAt: kpi.amberAt,
                    value: kpi.value, achievementPct: kpi.achievementPct, rag: kpi.rag, periodValues: kpi.periodValues,
                })),
            })),
            overall: card.overall,
            grade: card.grade,
            compliance: card.compliance,
            red: card.red,
            pending: card.pending,
            assigned: true,
        })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_SCORECARD_EMPLOYEE_GET]")
    }
}
