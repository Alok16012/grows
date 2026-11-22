import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, employeeScope, auditLater, requestMeta } from "@/lib/access"
import { applyMovement, currentValues, MOVE_TYPES, type MoveValues } from "@/lib/employee-movement"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET — movements (scheduled first). POST { employeeIds, type, effectiveDate, to: { siteId?, designation?, departmentId?, managerId? }, note? }
export async function GET(req: Request) {
    const g = await guard(req, "employees.view")
    if (g instanceof NextResponse) return g
    const scope = await employeeScope(g.access)
    const ids = scope ? (await prisma.employee.findMany({ where: scope, select: { id: true } })).map(e => e.id) : null
    const rows = await prisma.employeeMovement.findMany({ where: ids ? { employeeId: { in: ids } } : {}, orderBy: [{ status: "desc" }, { effectiveDate: "desc" }], take: 500 })
    const [emps, sites, depts, users] = await Promise.all([
        prisma.employee.findMany({ where: { id: { in: Array.from(new Set(rows.map(r => r.employeeId))) } }, select: { id: true, employeeId: true, firstName: true, lastName: true } }),
        prisma.site.findMany({ select: { id: true, name: true } }),
        prisma.department.findMany({ select: { id: true, name: true } }),
        prisma.user.findMany({ where: { id: { in: Array.from(new Set(rows.flatMap(r => [(r.toValues as MoveValues)?.managerId, (r.fromValues as MoveValues | null)?.managerId, r.createdBy]).filter((x): x is string => !!x))) } }, select: { id: true, name: true } }),
    ])
    const empOf = new Map(emps.map(e => [e.id, e])), siteOf = new Map(sites.map(s => [s.id, s.name])), deptOf = new Map(depts.map(d => [d.id, d.name])), userOf = new Map(users.map(u => [u.id, u.name]))
    const show = (v: MoveValues | null) => v ? ({ site: v.siteId ? siteOf.get(v.siteId) ?? null : undefined, designation: v.designation ?? undefined, department: v.departmentId ? deptOf.get(v.departmentId) ?? null : undefined, manager: v.managerId ? userOf.get(v.managerId) ?? null : undefined }) : null
    return NextResponse.json({
        canEdit: g.access.isAdmin || g.access.permissions.includes("employees.edit"),
        movements: rows.map(r => ({
            ...r, employee: empOf.get(r.employeeId) ? `${empOf.get(r.employeeId)!.firstName} ${empOf.get(r.employeeId)!.lastName ?? ""}`.trim() : "", employeeCode: empOf.get(r.employeeId)?.employeeId ?? "",
            to: show(r.toValues as MoveValues), from: show(r.fromValues as MoveValues | null), createdByName: r.createdBy ? userOf.get(r.createdBy) ?? null : null,
        })),
    })
}

export async function POST(req: Request) {
    const g = await guard(req, "employees.edit")
    if (g instanceof NextResponse) return g
    const b = await req.json().catch(() => ({}))
    const type = String(b?.type ?? "")
    if (!(MOVE_TYPES as readonly string[]).includes(type)) return NextResponse.json({ error: "Pick the kind of change" }, { status: 400 })
    const ids: string[] = Array.isArray(b?.employeeIds) ? b.employeeIds.filter((x: unknown) => typeof x === "string").slice(0, 300) : []
    if (!ids.length) return NextResponse.json({ error: "Pick at least one employee" }, { status: 400 })
    const eff = new Date(b?.effectiveDate)
    if (isNaN(eff.getTime())) return NextResponse.json({ error: "Pick the effective date" }, { status: 400 })
    const t = b?.to ?? {}
    const to: MoveValues = {}
    if (t.siteId) { if (!(await prisma.site.findUnique({ where: { id: t.siteId }, select: { id: true } }))) return NextResponse.json({ error: "Pick a site" }, { status: 400 }); to.siteId = t.siteId }
    if (t.designation) to.designation = String(t.designation).trim().slice(0, 80)
    if (t.departmentId) { if (!(await prisma.department.findUnique({ where: { id: t.departmentId }, select: { id: true } }))) return NextResponse.json({ error: "Pick a department" }, { status: 400 }); to.departmentId = t.departmentId }
    if (t.managerId) { if (!(await prisma.user.findUnique({ where: { id: t.managerId }, select: { id: true } }))) return NextResponse.json({ error: "Pick a manager" }, { status: 400 }); to.managerId = t.managerId }
    if (!Object.keys(to).length) return NextResponse.json({ error: "Enter what changes (site, designation, department or manager)" }, { status: 400 })
    const scope = await employeeScope(g.access)
    const emps = await prisma.employee.findMany({ where: scope ? { AND: [{ id: { in: ids } }, scope] } : { id: { in: ids } }, select: { id: true } })
    const today = new Date(); today.setHours(23, 59, 59, 999)
    let created = 0, applied = 0
    for (const e of emps) {
        const m = await prisma.employeeMovement.create({ data: { employeeId: e.id, type, effectiveDate: eff, toValues: to as any, fromValues: (await currentValues(e.id)) as any, note: b?.note ? String(b.note).slice(0, 300) : null, createdBy: g.access.userId } })
        created++
        if (eff <= today && await applyMovement(m.id, { id: g.access.userId, name: g.access.name })) applied++
    }
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "employee.movement", targetType: "Employee", targetId: emps.slice(0, 5).map(e => e.id).join(","), targetName: type, summary: `${type.toLowerCase()} from ${eff.toISOString().slice(0, 10)} for ${created} employee(s); ${applied} applied now`, after: to, ...requestMeta(req) })
    return NextResponse.json({ created, applied })
}
