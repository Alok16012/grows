import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, employeeScope, hiddenFields, maskValue, auditLater, requestMeta } from "@/lib/access"
import { isDocChange, type Change } from "@/lib/employee-change"
import { getPeopleSettings, savePeopleSettings } from "@/lib/people-quality-server"

export const dynamic = "force-dynamic"

// Onboarding → Approvals: what employees changed or uploaded themselves (My
// Profile, My Onboarding), waiting before it goes into their record.
// GET ?status=PENDING|ALL  (&count=1 → just the number waiting)
const VIEW = ["onboarding.view", "onboarding.approve", "employees.edit"]
const canDecideOf = (a: { isAdmin: boolean; permissions: string[] }) => a.isAdmin || a.permissions.includes("onboarding.approve") || a.permissions.includes("employees.edit")

export async function GET(req: Request) {
    const g = await guard(req, VIEW)
    if (g instanceof NextResponse) return g
    const u = new URL(req.url)
    const status = u.searchParams.get("status") ?? "PENDING"
    const scope = await employeeScope(g.access)
    const ids = scope ? (await prisma.employee.findMany({ where: scope, select: { id: true } })).map(e => e.id) : null
    const where = { source: "SELF", ...(status === "ALL" ? {} : { status }), ...(ids ? { employeeId: { in: ids } } : {}) }
    if (u.searchParams.get("count")) return NextResponse.json({ count: await prisma.employeeChangeRequest.count({ where: { ...where, status: "PENDING" } }) })

    const rows = await prisma.employeeChangeRequest.findMany({ where, orderBy: status === "PENDING" ? { updatedAt: "asc" } : { updatedAt: "desc" }, take: 300 })
    const [emps, users] = await Promise.all([
        prisma.employee.findMany({ where: { id: { in: Array.from(new Set(rows.map(r => r.employeeId))) } }, select: { id: true, employeeId: true, firstName: true, lastName: true, designation: true, status: true, photo: true, branch: { select: { name: true } } } }),
        prisma.user.findMany({ where: { id: { in: Array.from(new Set(rows.flatMap(r => [r.requestedBy, r.decidedBy].filter((x): x is string => !!x)))) } }, select: { id: true, name: true } }),
    ])
    const empOf = new Map(emps.map(e => [e.id, e])), nameOf = new Map(users.map(x => [x.id, x.name]))
    const hidden = hiddenFields(g.access)
    const s = await getPeopleSettings()
    return NextResponse.json({
        me: g.access.userId,
        canDecide: canDecideOf(g.access),
        canEditSettings: g.access.isAdmin || g.access.permissions.includes("employees.edit") || g.access.permissions.includes("onboarding.approve"),
        settings: { selfAllFields: s.approval.selfAllFields, selfDocs: s.approval.selfDocs, joinersToo: s.approval.joinersToo, selfService: s.approval.selfService },
        requests: rows.map(r => {
            const e = empOf.get(r.employeeId)
            return {
                id: r.id, requestNo: r.requestNo, employeeId: r.employeeId, status: r.status, reason: r.reason,
                createdAt: r.createdAt, updatedAt: r.updatedAt, decidedAt: r.decidedAt, decisionNote: r.decisionNote,
                requestedBy: r.requestedBy, decidedByName: r.decidedBy ? nameOf.get(r.decidedBy) ?? "" : null,
                employee: e ? `${e.firstName} ${e.lastName ?? ""}`.trim() : "", employeeCode: e?.employeeId ?? "",
                designation: e?.designation ?? null, site: e?.branch?.name ?? null, employeeStatus: e?.status ?? null, photo: e?.photo ?? null,
                changes: (r.changes as Change[]).map(c => !isDocChange(c) && hidden.has(c.field) ? { ...c, from: maskValue(c.from), to: maskValue(c.to) } : c),
            }
        }),
    })
}

// PUT { selfAllFields?, selfDocs?, joinersToo? } — the rule's switches.
export async function PUT(req: Request) {
    const g = await guard(req, ["employees.edit", "onboarding.approve"])
    if (g instanceof NextResponse) return g
    const b = await req.json().catch(() => ({}))
    const cur = await getPeopleSettings()
    const ap = { ...cur.approval }
    for (const k of ["selfAllFields", "selfDocs", "joinersToo"] as const) if (typeof b?.[k] === "boolean") ap[k] = b[k]
    const s = await savePeopleSettings({ ...cur, approval: ap }, g.access.userId)
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "employee.quality_settings", targetType: "Setting", targetId: "peopleSettings", targetName: "Employee update approvals", summary: "Employee update approval rule saved", after: { selfAllFields: s.approval.selfAllFields, selfDocs: s.approval.selfDocs, joinersToo: s.approval.joinersToo }, ...requestMeta(req) })
    return NextResponse.json({ ok: true, settings: { selfAllFields: s.approval.selfAllFields, selfDocs: s.approval.selfDocs, joinersToo: s.approval.joinersToo, selfService: s.approval.selfService } })
}
