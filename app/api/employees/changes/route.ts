import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, employeeScope, hiddenFields, maskValue } from "@/lib/access"
import { SENSITIVE, type Change } from "@/lib/employee-change"

export const dynamic = "force-dynamic"

// GET ?status=PENDING|ALL — change requests in the caller's employee scope.
// Sensitive values are masked for roles that can't see them.
export async function GET(req: Request) {
    const g = await guard(req, "employees.view")
    if (g instanceof NextResponse) return g
    const status = new URL(req.url).searchParams.get("status") ?? "PENDING"
    const scope = await employeeScope(g.access)
    const ids = scope ? (await prisma.employee.findMany({ where: scope, select: { id: true } })).map(e => e.id) : null
    const rows = await prisma.employeeChangeRequest.findMany({
        where: { ...(status === "ALL" ? {} : { status }), ...(ids ? { employeeId: { in: ids } } : {}) },
        orderBy: { createdAt: "desc" }, take: 500,
    })
    const [emps, users] = await Promise.all([
        prisma.employee.findMany({ where: { id: { in: Array.from(new Set(rows.map(r => r.employeeId))) } }, select: { id: true, employeeId: true, firstName: true, lastName: true } }),
        prisma.user.findMany({ where: { id: { in: Array.from(new Set(rows.flatMap(r => [r.requestedBy, r.decidedBy].filter((x): x is string => !!x)))) } }, select: { id: true, name: true } }),
    ])
    const empOf = new Map(emps.map(e => [e.id, e])), nameOf = new Map(users.map(u => [u.id, u.name]))
    const hidden = hiddenFields(g.access)
    return NextResponse.json({
        me: g.access.userId,
        canDecide: g.access.isAdmin || g.access.permissions.includes("employees.edit"),
        requests: rows.map(r => ({
            ...r,
            employee: empOf.get(r.employeeId) ? `${empOf.get(r.employeeId)!.firstName} ${empOf.get(r.employeeId)!.lastName ?? ""}`.trim() : "",
            employeeCode: empOf.get(r.employeeId)?.employeeId ?? "",
            requestedByName: nameOf.get(r.requestedBy) ?? "", decidedByName: r.decidedBy ? nameOf.get(r.decidedBy) ?? "" : null,
            changes: (r.changes as Change[]).map(c => (SENSITIVE.has(c.field) || hidden.has(c.field)) && hidden.has(c.field) ? { ...c, from: maskValue(c.from), to: maskValue(c.to) } : c),
        })),
    })
}
