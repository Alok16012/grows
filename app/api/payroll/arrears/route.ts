import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, employeeScope, auditLater, requestMeta } from "@/lib/access"
import { isMissingTableErr } from "@/lib/asset-workflow"
import { refreshArrears } from "@/lib/salary-arrears"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Payroll → Arrears. A back-dated salary revision into a locked / paid month
// files a PENDING arrear (lib/salary-arrears). HR reviews it here; approved
// arrears are paid with the next payroll processed for that employee.
//   GET  ?status=PENDING&q=          list + counts
//   POST { action: "approve" | "reject", ids, note? }
//   POST { action: "amount", id, amount, note? }       change what will be paid
//   POST { action: "recheck", month, year }            look for arrears in a finalized month
const MISSING = "Arrears aren't set up on the database yet (scripts/salary-effective.sql)."

export async function GET(req: Request) {
    const g = await guard(req, ["payroll.view", "payroll.manage"])
    if (g instanceof NextResponse) return g
    const sp = new URL(req.url).searchParams
    const status = sp.get("status") || "PENDING"
    const q = (sp.get("q") || "").trim()
    try {
        const scope = await employeeScope(g.access)
        const empWhere: any = {
            ...(scope ?? {}),
            ...(q ? { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { employeeId: { contains: q, mode: "insensitive" } }] } : {}),
        }
        const empIds = Object.keys(empWhere).length ? (await prisma.employee.findMany({ where: empWhere, select: { id: true }, take: 5000 })).map(e => e.id) : null
        const where: any = { status, ...(empIds ? { employeeId: { in: empIds } } : {}) }
        const [rows, counts] = await Promise.all([
            prisma.salaryArrear.findMany({ where, orderBy: [{ forYear: "desc" }, { forMonth: "desc" }, { createdAt: "desc" }], take: 500 }),
            prisma.salaryArrear.groupBy({ by: ["status"], where: empIds ? { employeeId: { in: empIds } } : {}, _count: true, _sum: { amount: true } }),
        ])
        const emps = await prisma.employee.findMany({
            where: { id: { in: Array.from(new Set(rows.map(r => r.employeeId))) } },
            select: { id: true, employeeId: true, firstName: true, lastName: true, designation: true, deployments: { where: { isActive: true }, take: 1, select: { site: { select: { name: true } } } } },
        })
        const byId = new Map(emps.map(e => [e.id, e]))
        const users = await prisma.user.findMany({ where: { id: { in: Array.from(new Set(rows.flatMap(r => [r.reviewedBy, r.createdBy]).filter((x): x is string => !!x))) } }, select: { id: true, name: true } })
        const uname = new Map(users.map(u => [u.id, u.name]))
        return NextResponse.json({
            counts: Object.fromEntries(counts.map(c => [c.status, { n: c._count, amount: Math.round(c._sum.amount ?? 0) }])),
            rows: rows.map(r => {
                const e = byId.get(r.employeeId)
                return {
                    ...r,
                    employee: e ? { code: e.employeeId, name: `${e.firstName} ${e.lastName ?? ""}`.trim(), designation: e.designation ?? "", site: e.deployments[0]?.site?.name ?? "" } : null,
                    reviewedByName: r.reviewedBy ? uname.get(r.reviewedBy) ?? "" : "",
                }
            }),
        })
    } catch (e) {
        if (isMissingTableErr(e)) return NextResponse.json({ counts: {}, rows: [], installed: false, error: MISSING })
        throw e
    }
}

export async function POST(req: Request) {
    const g = await guard(req, "payroll.manage")
    if (g instanceof NextResponse) return g
    const b = await req.json().catch(() => ({}))
    const note = typeof b?.note === "string" ? b.note.trim().slice(0, 300) || null : undefined
    try {
        if (b?.action === "approve" || b?.action === "reject") {
            const ids: string[] = (Array.isArray(b?.ids) ? b.ids : []).filter((x: unknown): x is string => typeof x === "string").slice(0, 2000)
            if (!ids.length) return NextResponse.json({ error: "Pick at least one arrear." }, { status: 400 })
            const r = await prisma.salaryArrear.updateMany({
                where: { id: { in: ids }, status: "PENDING" },
                data: { status: b.action === "approve" ? "APPROVED" : "REJECTED", reviewedBy: g.access.userId, reviewedAt: new Date(), ...(note !== undefined ? { note } : {}) },
            })
            auditLater({ actorId: g.access.userId, actorName: g.access.name, action: `salary.arrear.${b.action}`, targetType: "SalaryArrear", targetId: null, targetName: null, summary: `${r.count} arrear(s) ${b.action === "approve" ? "approved" : "rejected"}`, after: { ids, note }, ...requestMeta(req) })
            return NextResponse.json({ ok: true, updated: r.count })
        }
        if (b?.action === "amount") {
            const amount = Number(b?.amount)
            if (!Number.isFinite(amount) || Math.abs(amount) > 10_000_000) return NextResponse.json({ error: "Enter a valid amount." }, { status: 400 })
            const r = await prisma.salaryArrear.updateMany({
                where: { id: String(b?.id ?? ""), status: { in: ["PENDING", "APPROVED"] } },
                data: { amount: Math.round(amount * 100) / 100, ...(note !== undefined ? { note } : {}) },
            })
            if (!r.count) return NextResponse.json({ error: "Only pending or approved (not yet paid) arrears can be changed." }, { status: 400 })
            auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "salary.arrear.amount", targetType: "SalaryArrear", targetId: String(b.id), targetName: null, summary: `Arrear amount set to ₹${amount}`, after: { amount, note }, ...requestMeta(req) })
            return NextResponse.json({ ok: true })
        }
        if (b?.action === "recheck") {
            const month = Number(b?.month), year = Number(b?.year)
            if (!(month >= 1 && month <= 12) || !(year >= 2000)) return NextResponse.json({ error: "Pick a month." }, { status: 400 })
            const ids = (await prisma.payroll.findMany({ where: { month, year, status: { in: ["PROCESSED", "PAID"] } }, select: { employeeId: true } })).map(r => r.employeeId)
            if (!ids.length) return NextResponse.json({ ok: true, checked: 0, pending: 0, note: "No locked or paid payroll in that month." })
            // Only that month: compare it with the salary now in force for it.
            const pending = await refreshArrears(ids, { month, year }, g.access.userId)
            // refreshArrears looks from the month onward; keep this check to the one month.
            return NextResponse.json({ ok: true, checked: ids.length, pending })
        }
        return NextResponse.json({ error: "Unknown action." }, { status: 400 })
    } catch (e) {
        if (isMissingTableErr(e)) return NextResponse.json({ error: MISSING }, { status: 503 })
        throw e
    }
}
