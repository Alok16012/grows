import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, employeeScope, maskEmployee } from "@/lib/access"
import { postedSites } from "@/lib/attendance-guard"

export const dynamic = "force-dynamic"
export const maxDuration = 30

// GET — one employee, everything in one place (People → Employee 360):
// attendance, leave, payroll, assets, expenses, documents, learning,
// performance, exit, reporting line and recent history. Each block only when
// the caller's permissions allow it; sensitive fields masked as everywhere.
export async function GET(req: Request, { params }: { params: { id: string } }) {
    const g = await guard(req, "employees.view")
    if (g instanceof NextResponse) return g
    const a = g.access
    const can = (p: string) => a.isAdmin || a.permissions.includes(p)
    const scope = await employeeScope(a)
    const e = await prisma.employee.findFirst({
        where: scope ? { AND: [{ id: params.id }, scope] } : { id: params.id },
        include: { department: { select: { id: true, name: true } } },
    })
    if (!e) return NextResponse.json({ error: "Employee not found" }, { status: 404 })

    const now = new Date()
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
    const d30 = new Date(now.getTime() - 30 * 86_400_000)
    const [posted, manager, reports, att30, attMonth, leaves, docs, enrol, review, assets, exit, history, sal, payrolls, expenses] = await Promise.all([
        postedSites([e.id]),
        e.managerId ? Promise.all([
            prisma.user.findUnique({ where: { id: e.managerId }, select: { id: true, name: true } }),
            prisma.employee.findFirst({ where: { userId: e.managerId }, select: { id: true, designation: true } }),
        ]).then(([u, me]) => u ? { ...u, employee: me } : null).catch(() => null) : null,
        e.userId ? prisma.employee.findMany({ where: { managerId: e.userId, status: { in: ["ACTIVE", "ONBOARDING"] as any } }, select: { id: true, firstName: true, lastName: true, designation: true }, orderBy: { firstName: "asc" }, take: 50 }) : [],
        prisma.attendance.groupBy({ by: ["status"], where: { employeeId: e.id, date: { gte: d30 } }, _count: { _all: true } }),
        prisma.attendance.count({ where: { employeeId: e.id, date: { gte: monthStart }, status: "PRESENT" } }),
        prisma.leave.findMany({ where: { employeeId: e.id, startDate: { gte: yearStart } }, select: { type: true, days: true, status: true, startDate: true, endDate: true }, orderBy: { startDate: "desc" } }),
        prisma.employeeDocument.findMany({ where: { employeeId: e.id }, select: { type: true, status: true, uploadedAt: true } }),
        prisma.courseEnrollment.findMany({ where: { employeeId: e.id }, select: { status: true, dueDate: true, completedAt: true, course: { select: { title: true } } } }).catch(() => []),
        prisma.performanceReview.findFirst({ where: { employeeId: e.id }, orderBy: { periodEnd: "desc" }, select: { cycle: true, periodEnd: true, overallRating: true, status: true, incrementPercent: true } }).catch(() => null),
        prisma.assetIssue.findMany({ where: { employeeId: e.id, status: "ACTIVE" }, select: { issueNo: true, quantity: true, returnedQty: true, issuedAt: true, acknowledgedAt: true, asset: { select: { name: true, assetCode: true } } } }).catch(() => []),
        prisma.exitRequest.findUnique({ where: { employeeId: e.id }, select: { status: true, lastWorkingDate: true } }).catch(() => null),
        prisma.auditLog.findMany({ where: { targetType: "Employee", targetId: e.id }, orderBy: { at: "desc" }, take: 25, select: { at: true, action: true, summary: true, actorName: true } }).catch(() => []),
        can("employees.viewSalary") ? prisma.employeeSalary.findUnique({ where: { employeeId: e.id }, select: { basic: true, ctcMonthly: true, complianceType: true } }) : null,
        can("employees.viewSalary") || can("payroll.view") ? prisma.payroll.findMany({ where: { employeeId: e.id }, orderBy: [{ year: "desc" }, { month: "desc" }], take: 3, select: { month: true, year: true, grossSalary: true, netSalary: true, status: true, presentDays: true } }) : [],
        e.userId ? prisma.expense.groupBy({ by: ["status"], where: { submittedBy: e.userId, status: { in: ["SUBMITTED", "APPROVED"] } }, _count: { _all: true }, _sum: { amount: true } }).catch(() => []) : [],
    ])
    const siteId = posted.get(e.id) ?? null
    const site = siteId ? await prisma.site.findUnique({ where: { id: siteId }, select: { id: true, name: true } }) : null
    const leaveBy = new Map<string, number>()
    for (const l of leaves.filter(l => l.status === "APPROVED")) leaveBy.set(l.type, (leaveBy.get(l.type) ?? 0) + l.days)

    return NextResponse.json({
        employee: maskEmployee({ ...e, department: undefined }, a),
        department: e.department, site,
        manager: manager ? { userId: manager.id, name: manager.name, employeeId: manager.employee?.id ?? null, designation: manager.employee?.designation ?? null } : null,
        reports: reports.map(r => ({ id: r.id, name: `${r.firstName} ${r.lastName ?? ""}`.trim(), designation: r.designation })),
        attendance: { presentThisMonth: attMonth, last30: Object.fromEntries(att30.map(x => [x.status, x._count._all])) },
        leave: { approvedThisYear: Object.fromEntries(leaveBy), pending: leaves.filter(l => l.status === "PENDING").length, recent: leaves.slice(0, 5) },
        documents: { total: docs.length, verified: docs.filter(d => /verif|approv/i.test(d.status)).length, pending: docs.filter(d => /pend|upload/i.test(d.status)).length, types: Array.from(new Set(docs.map(d => d.type))) },
        learning: {
            completed: enrol.filter(x => x.status === "COMPLETED").length,
            inProgress: enrol.filter(x => x.status === "ENROLLED" || x.status === "IN_PROGRESS").length,
            overdue: enrol.filter(x => x.status !== "COMPLETED" && x.dueDate && x.dueDate < now).map(x => x.course.title),
        },
        performance: review,
        assets: assets.map(x => ({ issueNo: x.issueNo, name: x.asset.name, code: x.asset.assetCode, qty: x.quantity - x.returnedQty, issuedAt: x.issuedAt, confirmed: !!x.acknowledgedAt })),
        expenses: Object.fromEntries(expenses.map(x => [x.status, { count: x._count._all, amount: x._sum.amount ?? 0 }])),
        salary: sal, payrolls,
        exit,
        history,
        canEdit: can("employees.edit"),
    })
}
