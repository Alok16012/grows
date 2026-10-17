import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { checkAccess } from "@/lib/permissions"
import { getLeavePolicy, getLeaveBalances } from "@/lib/leave-policy-server"
import { leaveYearRange, parseDateOnly } from "@/lib/leave-policy"

// GET /api/leaves/balance
//   ?employeeId=…   one employee (managers), or the caller's own when omitted
//   ?all=1          every active employee (managers) — the Balances tab
//   ?asOf=YYYY-MM-DD  which leave year (defaults to today)
export async function GET(req: Request) {
    const session = await getApiSession(req)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })

    try {
        const { searchParams } = new URL(req.url)
        const asOf = parseDateOnly(searchParams.get("asOf") || "") ?? new Date()
        const { policy } = await getLeavePolicy()
        const year = leaveYearRange(asOf, policy.yearStartMonth)
        const isManager = checkAccess(session, [], "leaves.view")

        let target: string[] | "ALL_ACTIVE"
        if (isManager && searchParams.get("all") === "1") {
            target = "ALL_ACTIVE"
        } else if (isManager && searchParams.get("employeeId")) {
            target = [searchParams.get("employeeId")!]
        } else {
            const me = await prisma.employee.findUnique({ where: { userId: session.user.id }, select: { id: true } })
            if (!me) return NextResponse.json({ year: year.label, employees: [] })
            target = [me.id]
        }

        const map = await getLeaveBalances(target, asOf, policy)
        return NextResponse.json({
            year: year.label,
            yearStart: year.start,
            yearEnd: year.end,
            employees: Array.from(map.values()),
        })
    } catch (error) {
        console.error("[LEAVE_BALANCE_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
