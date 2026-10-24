import { NextResponse } from "next/server"
import { monthPeriod, monthKey } from "@/lib/perf-hub"
import { perfCtx, perfErrorResponse, jsonError, myEmployeeId, revieweeIds, buildScorecards } from "@/lib/perf-hub-db"

const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null)
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null
}

const csvCell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// GET — monthly scorecards for the team (or just me), as JSON or CSV.
export async function GET(req: Request) {
    try {
        const ctx = await perfCtx(req)
        const sp = new URL(req.url).searchParams
        const month = monthPeriod(sp.get("month"))
        if (!month) return jsonError(400, "month must be YYYY-MM")
        const approvedOnly = sp.get("approvedOnly") === "1" || sp.get("approvedOnly") === "true"

        let employeeIds: string[] | null
        if (sp.get("scope") === "me") employeeIds = [myEmployeeId(ctx)]
        else if (ctx.canView) employeeIds = null
        else {
            employeeIds = await revieweeIds(ctx.userId)
            if (!employeeIds.length) return jsonError(403, "Forbidden")
        }

        const cards = await buildScorecards(employeeIds, month, approvedOnly)
        const rows = cards.map(c => ({
            employee: c.employee,
            roleLabel: c.roleLabel,
            template: c.template,
            kras: c.breakdown.kras.map(k => ({ title: k.title, weight: k.weight, pct: k.pct })),
            overall: c.overall,
            grade: c.grade,
            compliance: c.compliance,
            red: c.red,
            pending: c.pending,
        }))

        if (sp.get("format") === "csv") {
            // Roles have different KRAs: one column per distinct KRA title.
            const kraCols: string[] = []
            for (const r of rows) for (const k of r.kras) if (!kraCols.includes(k.title)) kraCols.push(k.title)
            const header = ["Employee ID", "Name", "Designation", "Role", ...kraCols.map(t => `${t} %`), "Overall %", "Grade", "Compliance %", "Red KPIs", "Pending review"]
            const lines = rows.map(r => [
                r.employee.employeeId, `${r.employee.firstName} ${r.employee.lastName}`.trim(), r.employee.designation, r.roleLabel,
                ...kraCols.map(t => r.kras.find(k => k.title === t)?.pct ?? ""),
                r.overall, r.grade, r.compliance, r.red, r.pending,
            ].map(csvCell).join(","))
            const csv = [header.map(csvCell).join(","), ...lines].join("\n")
            return new NextResponse(csv, {
                headers: {
                    "Content-Type": "text/csv; charset=utf-8",
                    "Content-Disposition": `attachment; filename="kpi-scorecards-${monthKey(month)}.csv"`,
                },
            })
        }

        return NextResponse.json({
            month: monthKey(month),
            summary: {
                employees: rows.length,
                avgScore: avg(rows.map(r => r.overall)),
                avgCompliance: avg(rows.map(r => r.compliance)),
                pendingReview: rows.reduce((n, r) => n + r.pending, 0),
                redKpis: rows.reduce((n, r) => n + r.red, 0),
                below70: rows.filter(r => r.overall !== null && r.overall < 70).length,
            },
            rows,
        })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_SCORECARDS_GET]")
    }
}
