import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, employeeScope } from "@/lib/access"

export const dynamic = "force-dynamic"

// GET /api/payroll/reports/advance?from=2026-04&to=2026-09&siteId=
// Advance recovered through payroll, month by month: every payroll row in the
// range with an Advance deduction. That column (entered with the attendance
// sheet) is where advances are recorded today.
const parseYm = (v: string | null) => {
    const m = v?.match(/^(\d{4})-(\d{2})$/)
    if (!m) return null
    const year = Number(m[1]), month = Number(m[2])
    return month >= 1 && month <= 12 && year >= 2000 ? { year, month, key: year * 12 + month } : null
}

export async function GET(req: Request) {
    const g = await guard(req, "payroll.view")
    if (g instanceof NextResponse) return g
    const { searchParams } = new URL(req.url)
    const from = parseYm(searchParams.get("from")), to = parseYm(searchParams.get("to"))
    if (!from || !to) return NextResponse.json({ error: "Pick a from and to month." }, { status: 400 })
    if (from.key > to.key) return NextResponse.json({ error: "The from month is after the to month." }, { status: 400 })
    if (to.key - from.key > 35) return NextResponse.json({ error: "At most 36 months at a time." }, { status: 400 })
    const siteId = searchParams.get("siteId") || null

    // (year, month) pairs in the range — Prisma can't compare the two columns as one.
    const months: { year: number; month: number }[] = []
    for (let k = from.key; k <= to.key; k++) months.push({ year: Math.floor((k - 1) / 12), month: ((k - 1) % 12) + 1 })

    try {
        const scope = await employeeScope(g.access)
        const rows = await prisma.payroll.findMany({
            where: {
                advance: { gt: 0 },
                OR: months,
                ...(siteId ? { siteId } : {}),
                ...(scope ? { employee: scope } : {}),
            },
            select: {
                month: true, year: true, advance: true, netSalary: true, grossSalary: true, status: true, siteId: true,
                employee: { select: { id: true, employeeId: true, firstName: true, lastName: true, fathersName: true, designation: true } },
            },
        })
        const siteIds = Array.from(new Set(rows.map(r => r.siteId).filter((x): x is string => !!x)))
        const sites = siteIds.length ? await prisma.site.findMany({ where: { id: { in: siteIds } }, select: { id: true, name: true } }) : []
        const siteName = new Map(sites.map(s => [s.id, s.name]))

        const out = rows.map(r => ({
            employeeDbId: r.employee.id,
            empCode: r.employee.employeeId,
            name: `${r.employee.firstName} ${r.employee.lastName ?? ""}`.trim(),
            fatherName: r.employee.fathersName ?? "",
            designation: r.employee.designation ?? "",
            site: r.siteId ? siteName.get(r.siteId) ?? "" : "",
            month: r.month, year: r.year,
            advance: Math.round(r.advance * 100) / 100,
            gross: Math.round(r.grossSalary), net: Math.round(r.netSalary),
            status: r.status,
        }))
        out.sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month) || a.site.localeCompare(b.site) || a.empCode.localeCompare(b.empCode))
        return NextResponse.json({ rows: out })
    } catch (e) {
        console.error("[ADVANCE_REPORT]", e)
        return NextResponse.json({ error: "Could not build the report." }, { status: 500 })
    }
}
