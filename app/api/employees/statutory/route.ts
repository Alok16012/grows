import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { randomUUID } from "crypto"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { checkAccess } from "@/lib/permissions"
import { isMissingTableErr } from "@/lib/asset-workflow"
import { audit, requestMetaOf } from "@/lib/access-audit"
import { parseStatutory, statutoryFlagsForMonth, upcomingStatutoryChanges, saveStatutoryChange, DEFAULT_STATUTORY, STATUTORY_MISSING_MESSAGE } from "@/lib/employee-statutory"
import { checkEffectiveMonth, effectiveWindow, openPayrollMonth } from "@/lib/payroll-change-control"

export const dynamic = "force-dynamic"

// Bulk PF / PF Pension (EPS) / ESIC applicability — Payroll → Compliance →
// Statutory Applicability. Same switches as Employee Master → Basic Info, for
// many people at once. They apply the next time payroll is processed; locked
// months are never recalculated.

// GET — active employees with their switches and current site.
export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "employees.view")) {
        return NextResponse.json({ error: "You need Employees (view) to see this." }, { status: 403 })
    }
    try {
        const employees = await prisma.employee.findMany({
            where: { status: { in: ["ACTIVE", "ON_LEAVE", "ONBOARDING"] } },
            select: {
                id: true, employeeId: true, firstName: true, lastName: true, designation: true,
                deployments: { where: { isActive: true }, select: { site: { select: { id: true, name: true } } }, take: 1 },
                employeeSalary: { select: { complianceType: true } },
            },
            orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        })
        let installed = true
        let flags = new Map<string, typeof DEFAULT_STATUTORY>()
        let upcoming = new Map<string, { fromYear: number; fromMonth: number; flags: typeof DEFAULT_STATUTORY }>()
        // Shown as they stand in the open payroll month, with any later change noted.
        const window = await effectiveWindow()
        try {
            await prisma.employeeStatutory.count()
            flags = await statutoryFlagsForMonth(employees.map(e => e.id), window.open)
            upcoming = await upcomingStatutoryChanges(employees.map(e => e.id), window.open)
        } catch (e) {
            if (!isMissingTableErr(e)) throw e
            installed = false
        }
        return NextResponse.json({
            installed, window,
            employees: employees.map(e => ({
                upcoming: upcoming.get(e.id) ?? null,
                id: e.id, employeeId: e.employeeId, name: `${e.firstName} ${e.lastName ?? ""}`.trim(),
                designation: e.designation, site: e.deployments[0]?.site ?? null,
                compliance: e.employeeSalary?.complianceType ?? "OR",
                ...(flags.get(e.id) ?? DEFAULT_STATUTORY),
            })),
        })
    } catch (e) {
        console.error("[STATUTORY_LIST]", e)
        return NextResponse.json({ error: "Could not load employees." }, { status: 500 })
    }
}

// POST { employeeIds: string[], pfApplicable?, pensionApplicable?, esicApplicable? }
// Sets the given switches for every listed employee. Turning PF off turns
// pension off too; pension can only be turned on for people who have PF.
export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "employees.edit")) {
        return NextResponse.json({ error: "You need Employees (edit) to change these." }, { status: 403 })
    }
    try {
        const body = await req.json().catch(() => ({}))
        const ids: string[] = Array.from(new Set((Array.isArray(body?.employeeIds) ? body.employeeIds : []).filter((x: unknown): x is string => typeof x === "string")))
        if (!ids.length) return NextResponse.json({ error: "Select at least one employee." }, { status: 400 })
        if (ids.length > 2000) return NextResponse.json({ error: "At most 2,000 employees at a time." }, { status: 400 })
        const patch = parseStatutory(body)
        if (!Object.keys(patch).length) return NextResponse.json({ error: "Choose what to change." }, { status: 400 })

        const valid = (await prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true } })).map(e => e.id)
        const userId = session.user.id ?? null
        // Change control: applies from the open payroll month (default) or the next.
        const open = await openPayrollMonth()
        const from = body?.effectiveMonth != null && body?.effectiveYear != null ? { month: Number(body.effectiveMonth), year: Number(body.effectiveYear) } : open
        const problem = await checkEffectiveMonth(from, { isAdmin: (session.user as any)?.role === "ADMIN" }, body?.backdateReason)
        if (problem) return NextResponse.json({ error: problem }, { status: 400 })

        const { saved, skippedPension } = await saveStatutoryChange(valid, patch, from, userId, typeof body?.backdateReason === "string" ? body.backdateReason.slice(0, 300) : null)
        await prisma.$transaction(async tx => {
            await audit(tx, {
                actorId: userId, actorName: session.user.name ?? null, action: "employee.statutory.bulk", targetType: "Employee",
                summary: `PF/pension/ESIC switches from ${from.month}/${from.year} for ${saved} employee(s): ${Object.entries(patch).map(([k, v]) => `${k.replace("Applicable", "")} ${v ? "on" : "off"}`).join(", ")}`,
                after: { employees: saved, from, ...patch }, batchId: randomUUID(), ...requestMetaOf(req),
            })
        })

        return NextResponse.json({ ok: true, updated: saved, skippedPension, from })
    } catch (e) {
        if (isMissingTableErr(e)) return NextResponse.json({ error: STATUTORY_MISSING_MESSAGE, code: "NOT_SET_UP" }, { status: 503 })
        console.error("[STATUTORY_BULK]", e)
        return NextResponse.json({ error: "Could not save the changes." }, { status: 500 })
    }
}
