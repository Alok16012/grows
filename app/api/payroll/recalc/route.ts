import { NextResponse } from "next/server"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { recalcDraftPayroll } from "@/lib/payroll-recalc"
import { openPayrollMonth } from "@/lib/payroll-change-control"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// POST — recalculate every DRAFT payroll row from the open payroll month on,
// with today's settings, structures and switches, from the attendance already
// on each row. Locked months are never touched. (Calculation Settings →
// "Recalculate draft payroll now"; saves of settings / salary / switches do
// this automatically for what they affect.)
export async function POST(req: Request) {
    const g = await guard(req, "payroll.edit")
    if (g instanceof NextResponse) return g
    const from = await openPayrollMonth()
    const result = await recalcDraftPayroll({ from })
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "payroll.recalc_drafts", targetType: "Payroll", targetId: `${from.year}-${from.month}`, targetName: "Draft payroll", summary: `Recalculated ${result.rows} draft row(s): ${result.months.join(", ") || "none"}`, ...requestMeta(req) })
    return NextResponse.json({ ok: true, from, ...result })
}
