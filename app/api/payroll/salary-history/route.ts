import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, employeeScope } from "@/lib/access"
import { isMissingTableErr } from "@/lib/asset-workflow"

export const dynamic = "force-dynamic"

// GET ?q=EMP-123 or name → the employee's salary history: every revision by
// effective month (what is in force when), every save with before / after and
// who did it, and their arrears.
export async function GET(req: Request) {
    const g = await guard(req, ["payroll.view", "payroll.edit"])
    if (g instanceof NextResponse) return g
    const q = (new URL(req.url).searchParams.get("q") || "").trim()
    if (q.length < 2) return NextResponse.json({ error: "Type an employee code or name." }, { status: 400 })
    const scope = await employeeScope(g.access)
    const emp = await prisma.employee.findFirst({
        where: {
            AND: [
                { OR: [{ employeeId: { equals: q, mode: "insensitive" } }, { firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }] },
                ...(scope ? [scope] : []),
            ],
        },
        orderBy: { firstName: "asc" },
        select: { id: true, employeeId: true, firstName: true, lastName: true, designation: true },
    })
    if (!emp) return NextResponse.json({ error: "No employee found." }, { status: 404 })
    const revisions = await prisma.salaryRevision.findMany({
        where: { employeeId: emp.id }, orderBy: [{ effectiveYear: "desc" }, { effectiveMonth: "desc" }],
        select: { id: true, effectiveYear: true, effectiveMonth: true, basic: true, da: true, hra: true, washing: true, conveyance: true, leaveWithWages: true, otherAllowance: true, bonus: true, ctcMonthly: true, note: true, createdBy: true, createdAt: true, updatedAt: true },
    })
    let logs: any[] = [], arrears: any[] = []
    try {
        ;[logs, arrears] = await Promise.all([
            prisma.salaryRevisionLog.findMany({ where: { employeeId: emp.id }, orderBy: { changedAt: "desc" }, take: 100 }),
            prisma.salaryArrear.findMany({ where: { employeeId: emp.id }, orderBy: [{ forYear: "desc" }, { forMonth: "desc" }] }),
        ])
    } catch (e) { if (!isMissingTableErr(e)) throw e }
    const users = await prisma.user.findMany({ where: { id: { in: Array.from(new Set([...revisions.map(r => r.createdBy), ...logs.map(l => l.changedBy)].filter(Boolean))) } }, select: { id: true, name: true } })
    const uname = new Map(users.map(u => [u.id, u.name]))
    return NextResponse.json({
        employee: { id: emp.id, code: emp.employeeId, name: `${emp.firstName} ${emp.lastName ?? ""}`.trim(), designation: emp.designation ?? "" },
        revisions: revisions.map(r => ({ ...r, by: uname.get(r.createdBy) ?? "" })),
        logs: logs.map(l => ({ ...l, by: l.changedBy ? uname.get(l.changedBy) ?? "" : "" })),
        arrears,
    })
}
