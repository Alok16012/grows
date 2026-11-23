import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { loadManualOt, manualOtKey, saveManualOtAmounts } from "@/lib/payroll-manual-ot"
import { checkEffectiveMonth, effectiveWindow } from "@/lib/payroll-change-control"
import { recalcDraftPayroll } from "@/lib/payroll-recalc"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Calculation Settings → OT Rule by Site → Manual OT window.
//
// GET ?siteId=&month=&year= — the site's employees (active postings, plus anyone
// with payroll at the site that month) with their own OT rate from Salary
// Master and the manual OT amount entered for that month.
export async function GET(req: Request) {
    const g = await guard(req, "payroll.edit")
    if (g instanceof NextResponse) return g
    const sp = new URL(req.url).searchParams
    const siteId = sp.get("siteId") ?? ""
    const month = Number(sp.get("month")), year = Number(sp.get("year"))
    if (!siteId) return NextResponse.json({ error: "Pick a site" }, { status: 400 })

    const [deployed, paid] = await Promise.all([
        prisma.deployment.findMany({ where: { siteId, isActive: true }, select: { employeeId: true } }),
        Number.isInteger(month) && Number.isInteger(year)
            ? prisma.payroll.findMany({ where: { siteId, month, year }, select: { employeeId: true } })
            : Promise.resolve([] as { employeeId: string }[]),
    ])
    const ids = Array.from(new Set([...deployed, ...paid].map(r => r.employeeId)))
    const emps = ids.length ? await prisma.employee.findMany({
        where: { id: { in: ids } },
        select: { id: true, employeeId: true, firstName: true, lastName: true, status: true, employeeSalary: { select: { otRatePerHour: true } } },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }) : []
    const store = Number.isInteger(month) && Number.isInteger(year) ? (await loadManualOt())[manualOtKey({ month, year })] ?? {} : {}
    return NextResponse.json({
        employees: emps.map(e => ({
            id: e.id, code: e.employeeId, name: `${e.firstName} ${e.lastName}`.trim(), status: e.status,
            ownRate: e.employeeSalary?.otRatePerHour ?? null,
            amount: typeof store[e.id] === "number" ? store[e.id] : null,
        })),
        window: await effectiveWindow(),
    })
}

// PUT { month, year, amounts: { employeeId: ₹ | null }, reason? } — saves the
// monthly OT amounts (only for the months change control allows) and
// recalculates those employees' draft payroll from that month.
export async function PUT(req: Request) {
    const g = await guard(req, "payroll.edit")
    if (g instanceof NextResponse) return g
    const body = await req.json().catch(() => null)
    const p = { month: Number(body?.month), year: Number(body?.year) }
    const amounts = body?.amounts && typeof body.amounts === "object" ? body.amounts as Record<string, unknown> : null
    if (!amounts) return NextResponse.json({ error: "Nothing to save" }, { status: 400 })
    const problem = await checkEffectiveMonth(p, { isAdmin: g.access.isAdmin }, body?.reason)
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })

    const saved = await saveManualOtAmounts(p, amounts, g.access.userId)
    const employeeIds = Object.keys(amounts).filter(id => id && id.length <= 64)
    const recalculated = employeeIds.length ? await recalcDraftPayroll({ from: p, employeeIds }) : { rows: 0, months: [] }
    auditLater({
        actorId: g.access.userId, actorName: g.access.name, action: "payroll.manual_ot", targetType: "Payroll",
        targetId: manualOtKey(p), targetName: "Manual OT amounts", summary: `Manual OT amounts for ${p.month}/${p.year}: ${saved} employee(s)`, ...requestMeta(req),
    })
    return NextResponse.json({ ok: true, saved, recalculated })
}
