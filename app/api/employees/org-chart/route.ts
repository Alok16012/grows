import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, employeeScope } from "@/lib/access"
import { postedSites } from "@/lib/attendance-guard"

export const dynamic = "force-dynamic"
export const maxDuration = 30

// GET — the reporting lines (People → Org chart). Each active employee with
// who they report to (Employee.managerId is the manager's login). A manager
// who has a login but no employee record still appears, as a person.
export async function GET(req: Request) {
    const g = await guard(req, "employees.view")
    if (g instanceof NextResponse) return g
    const scope = await employeeScope(g.access)
    const active = { status: { in: ["ACTIVE", "ONBOARDING"] as any } }
    const emps = await prisma.employee.findMany({
        where: scope ? { AND: [active, scope] } : active,
        select: { id: true, employeeId: true, firstName: true, lastName: true, designation: true, photo: true, userId: true, managerId: true, department: { select: { name: true } } },
    })
    const [posted, sites] = await Promise.all([postedSites(emps.map(e => e.id)), prisma.site.findMany({ select: { id: true, name: true } })])
    const siteName = new Map(sites.map(s => [s.id, s.name]))
    const byUser = new Map(emps.filter(e => e.userId).map(e => [e.userId!, e.id]))
    // Managers outside the list (no employee record, or not in scope).
    const outside = Array.from(new Set(emps.map(e => e.managerId).filter((m): m is string => !!m && !byUser.has(m))))
    const users = outside.length ? await prisma.user.findMany({ where: { id: { in: outside } }, select: { id: true, name: true } }) : []
    const nodes = [
        ...emps.map(e => ({
            id: e.id, code: e.employeeId, name: `${e.firstName} ${e.lastName ?? ""}`.trim(), designation: e.designation, department: e.department?.name ?? null,
            site: siteName.get(posted.get(e.id) ?? "") ?? null, photo: e.photo, managerNodeId: e.managerId ? (byUser.get(e.managerId) ?? `u:${e.managerId}`) : null, isPerson: false,
        })),
        ...users.map(u => ({ id: `u:${u.id}`, code: "", name: u.name ?? "Unnamed", designation: "Login only (no employee record here)", department: null, site: null, photo: null, managerNodeId: null, isPerson: true })),
    ]
    return NextResponse.json({ nodes })
}
