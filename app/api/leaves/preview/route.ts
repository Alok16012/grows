import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { checkAccess } from "@/lib/permissions"
import { checkLeaveRequest } from "@/lib/leave-policy-server"

// POST /api/leaves/preview — runs the exact checks a real application would,
// without saving, so the form can show working days, balance after and any
// problem before the employee presses Apply.
export async function POST(req: Request) {
    const session = await getApiSession(req)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })

    try {
        const body = await req.json()
        const isManager = checkAccess(session, [], "leaves.manage")
        let employeeId: string | undefined = isManager ? body.employeeId : undefined
        if (!employeeId) {
            const me = await prisma.employee.findUnique({ where: { userId: session.user.id }, select: { id: true } })
            if (!me) return NextResponse.json({ ok: false, error: isManager ? "Select an employee" : "No employee record linked to your login" })
            employeeId = me.id
        }

        const check = await checkLeaveRequest({
            employeeId, type: body.type, startDate: body.startDate, endDate: body.endDate,
            halfDay: !!body.halfDay, excludeLeaveId: body.excludeLeaveId, isManager,
        })
        if (!check.ok) return NextResponse.json({ ok: false, error: check.error })
        return NextResponse.json({
            ok: true,
            type: check.type,
            ...check.breakdown,
            balance: check.balance,
            balanceAfter: check.balance?.available === null || !check.balance ? null : check.balance.available - check.breakdown.days,
            warnings: check.warnings,
        })
    } catch (error) {
        console.error("[LEAVE_PREVIEW]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
