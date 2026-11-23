import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, employeeScope } from "@/lib/access"
import { computeSettlement, previewSettlement } from "@/lib/exit-settlement"

export const dynamic = "force-dynamic"

// Payroll → Reports → FNF Settlement.
// GET  ?month=&year=&siteId=  — everyone whose leaving date falls in the month.
// POST { employeeIds }        — their F&F statements, for printing.
// Leavers are found by Employee.dateOfLeaving (most never had an Exit request);
// where an Exit request exists its notice period, adjustments and payment are
// used, otherwise the leaving date is taken as both notice and last day.

const PERMS = ["exit.view", "payroll.view"]
const monthRange = (month: number, year: number) => ({
    gte: new Date(Date.UTC(year, month - 1, 1)),
    lt: new Date(Date.UTC(year, month, 1)),
})

export async function GET(req: Request) {
    const g = await guard(req, PERMS)
    if (g instanceof NextResponse) return g
    const { searchParams } = new URL(req.url)
    const month = Number(searchParams.get("month")), year = Number(searchParams.get("year"))
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000) {
        return NextResponse.json({ error: "Pick a month and year." }, { status: 400 })
    }
    const siteId = searchParams.get("siteId") || null
    try {
        const scope = await employeeScope(g.access)
        const employees = await prisma.employee.findMany({
            where: {
                AND: [
                    { dateOfLeaving: monthRange(month, year) },
                    // A leaver's posting is closed on exit, so match the last one.
                    ...(siteId ? [{ deployments: { some: { siteId } } }] : []),
                    ...(scope ? [scope] : []),
                ],
            },
            select: {
                id: true, employeeId: true, firstName: true, lastName: true, designation: true, status: true,
                dateOfJoining: true, dateOfLeaving: true,
                exitRequest: { select: { id: true, exitType: true, status: true, fnfPaidAt: true, fnfAmount: true } },
                deployments: { orderBy: { startDate: "desc" }, take: 1, select: { site: { select: { id: true, name: true } } } },
            },
            orderBy: [{ dateOfLeaving: "asc" }, { firstName: "asc" }],
        })
        return NextResponse.json({
            employees: employees.map(e => ({
                id: e.id, employeeId: e.employeeId, name: `${e.firstName} ${e.lastName ?? ""}`.trim(),
                designation: e.designation ?? "", status: e.status,
                doj: e.dateOfJoining?.toISOString() ?? null, dol: e.dateOfLeaving?.toISOString() ?? null,
                site: e.deployments[0]?.site?.name ?? "",
                exit: e.exitRequest ? { type: e.exitRequest.exitType, status: e.exitRequest.status, paidAt: e.exitRequest.fnfPaidAt?.toISOString() ?? null, paidAmount: e.exitRequest.fnfAmount } : null,
            })),
        })
    } catch (e) {
        console.error("[FNF_LIST]", e)
        return NextResponse.json({ error: "Could not load leavers." }, { status: 500 })
    }
}

export async function POST(req: Request) {
    const g = await guard(req, PERMS)
    if (g instanceof NextResponse) return g
    // Sensitive fields follow the role's switches (Roles → Sensitive fields).
    const seeKyc = g.access.isAdmin || g.access.permissions.includes("employees.viewKyc")
    const seePersonal = g.access.isAdmin || g.access.permissions.includes("employees.viewPersonal")
    const body = await req.json().catch(() => ({}))
    const ids: string[] = Array.from(new Set((Array.isArray(body?.employeeIds) ? body.employeeIds : []).filter((x: unknown): x is string => typeof x === "string")))
    if (!ids.length) return NextResponse.json({ error: "Select at least one employee." }, { status: 400 })
    // The page asks in small batches; this keeps one request inside the time limit.
    if (ids.length > 15) return NextResponse.json({ error: "At most 15 statements per request." }, { status: 400 })
    try {
        const scope = await employeeScope(g.access)
        const employees = await prisma.employee.findMany({
            where: { AND: [{ id: { in: ids } }, { dateOfLeaving: { not: null } }, ...(scope ? [scope] : [])] },
            select: {
                id: true, employeeId: true, firstName: true, lastName: true, designation: true, fathersName: true,
                dateOfJoining: true, dateOfLeaving: true, uan: true, esiNumber: true,
                department: { select: { name: true } },
                exitRequest: { select: { id: true, exitType: true, resignationDate: true, fnfPaidAt: true, fnfAmount: true } },
                deployments: { orderBy: { startDate: "desc" }, take: 1, select: { site: { select: { name: true } } } },
            },
        })

        const statements = []
        // A few at a time: each statement is several queries.
        for (let i = 0; i < employees.length; i += 4) {
            const part = await Promise.all(employees.slice(i, i + 4).map(async e => {
                const s = e.exitRequest
                    ? await computeSettlement(e.exitRequest.id)
                    : await previewSettlement({
                        employeeId: e.id, exitType: "RESIGNATION",
                        resignationDate: e.dateOfLeaving!, lastWorkingDate: e.dateOfLeaving!, noticePeriodDays: 0,
                    })
                return {
                    employee: {
                        id: e.id, employeeId: e.employeeId, name: `${e.firstName} ${e.lastName ?? ""}`.trim(),
                        designation: e.designation ?? "", department: e.department?.name ?? "", fatherName: seePersonal ? e.fathersName ?? "" : "",
                        site: e.deployments[0]?.site?.name ?? "", uan: seeKyc ? e.uan ?? "" : "", esicNo: seeKyc ? e.esiNumber ?? "" : "",
                        doj: e.dateOfJoining?.toISOString() ?? null, dol: e.dateOfLeaving?.toISOString() ?? null,
                    },
                    exitType: e.exitRequest?.exitType ?? "RESIGNATION",
                    paid: e.exitRequest?.fnfPaidAt ? { at: e.exitRequest.fnfPaidAt.toISOString(), amount: e.exitRequest.fnfAmount } : null,
                    settlement: s,
                }
            }))
            statements.push(...part)
        }
        // Same order the user ticked them in.
        statements.sort((a, b) => ids.indexOf(a.employee.id) - ids.indexOf(b.employee.id))
        return NextResponse.json({ statements })
    } catch (e) {
        console.error("[FNF_STATEMENTS]", e)
        return NextResponse.json({ error: "Could not work out the settlements." }, { status: 500 })
    }
}
