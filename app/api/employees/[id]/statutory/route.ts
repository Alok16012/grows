import { NextResponse } from "next/server"
import { recalcDraftPayroll } from "@/lib/payroll-recalc"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { checkAccess } from "@/lib/permissions"
import { isMissingTableErr } from "@/lib/asset-workflow"
import { parseStatutory, statutoryFlagsOf, statutoryFlagsForMonth, upcomingStatutoryChanges, saveStatutoryChange, DEFAULT_STATUTORY, STATUTORY_MISSING_MESSAGE } from "@/lib/employee-statutory"
import { checkEffectiveMonth, effectiveWindow, openPayrollMonth } from "@/lib/payroll-change-control"

export const dynamic = "force-dynamic"

type Params = { params: { id: string } }

// GET — this employee's PF / pension / ESIC switches. `installed: false` until
// scripts/employee-statutory.sql has run (all three then count as applicable).
export async function GET(_req: Request, { params }: Params) {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "employees.view")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    try {
        // As they stand in the open payroll month, with any later change noted.
        const base = await statutoryFlagsOf(params.id)
        const window = await effectiveWindow()
        const flags = base.installed ? (await statutoryFlagsForMonth([params.id], window.open)).get(params.id) ?? base.flags : base.flags
        const upcoming = base.installed ? (await upcomingStatutoryChanges([params.id], window.open)).get(params.id) ?? null : null
        return NextResponse.json({ installed: base.installed, flags, upcoming, window })
    } catch (e) {
        console.error("[EMPLOYEE_STATUTORY_GET]", e)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}

// PUT { pfApplicable?, pensionApplicable?, esicApplicable? } — same permission
// as editing the employee. Takes effect the next time payroll is processed;
// locked months are never recalculated.
export async function PUT(req: Request, { params }: Params) {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "employees.edit")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    try {
        const body = await req.json().catch(() => ({}))
        const patch = parseStatutory(body)
        if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
        const exists = await prisma.employee.count({ where: { id: params.id } })
        if (!exists) return NextResponse.json({ error: "Employee not found" }, { status: 404 })
        // Change control: applies from the open payroll month (default) or the next.
        const open = await openPayrollMonth()
        const from = body?.effectiveMonth != null && body?.effectiveYear != null ? { month: Number(body.effectiveMonth), year: Number(body.effectiveYear) } : open
        const problem = await checkEffectiveMonth(from, { isAdmin: (session.user as any)?.role === "ADMIN" }, body?.backdateReason)
        if (problem) return NextResponse.json({ error: problem }, { status: 400 })
        await saveStatutoryChange([params.id], patch, from, session.user.id ?? null, typeof body?.backdateReason === "string" ? body.backdateReason.slice(0, 300) : null)
        const flags = (await statutoryFlagsForMonth([params.id], open)).get(params.id) ?? { ...DEFAULT_STATUTORY }
        const recalculated = await recalcDraftPayroll({ from, employeeIds: [params.id] })
        return NextResponse.json({ installed: true, flags, from, recalculated })
    } catch (e) {
        if (isMissingTableErr(e)) return NextResponse.json({ error: STATUTORY_MISSING_MESSAGE, code: "NOT_SET_UP" }, { status: 503 })
        console.error("[EMPLOYEE_STATUTORY_PUT]", e)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}
