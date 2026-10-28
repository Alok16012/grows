import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { checkAccess } from "@/lib/permissions"
import { isMissingTableErr } from "@/lib/asset-workflow"
import { parseStatutory, statutoryFlagsOf, DEFAULT_STATUTORY, STATUTORY_MISSING_MESSAGE } from "@/lib/employee-statutory"

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
        return NextResponse.json(await statutoryFlagsOf(params.id))
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
        const patch = parseStatutory(await req.json().catch(() => ({})))
        if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
        const exists = await prisma.employee.count({ where: { id: params.id } })
        if (!exists) return NextResponse.json({ error: "Employee not found" }, { status: 404 })
        const row = await prisma.employeeStatutory.upsert({
            where: { employeeId: params.id },
            create: { employeeId: params.id, ...DEFAULT_STATUTORY, ...patch, updatedBy: session.user.id ?? null },
            update: { ...patch, updatedBy: session.user.id ?? null },
            select: { pfApplicable: true, pensionApplicable: true, esicApplicable: true },
        })
        return NextResponse.json({ installed: true, flags: row })
    } catch (e) {
        if (isMissingTableErr(e)) return NextResponse.json({ error: STATUTORY_MISSING_MESSAGE, code: "NOT_SET_UP" }, { status: 503 })
        console.error("[EMPLOYEE_STATUTORY_PUT]", e)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}
