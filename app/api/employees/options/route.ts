import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, employeeScope } from "@/lib/access"
import { buildEmployeeWhere, employeeFiltersFromParams } from "@/lib/employee-filter"

// Employee pickers (apply leave for, start an exit, raise a ticket for, enrol,
// send a letter to, issue an asset to, the attendance roster…). Returns who
// someone is and where they work — never KYC, bank, salary, personal details
// or the joining token — so a dropdown no longer needs the full record.
//
// Anyone whose work involves picking a colleague may call it; the list is cut
// to their data scope like every other employee list.
const PICKER_PERMISSIONS = [
    "employees.view", "attendance.view", "leaves.view", "leaves.approve", "expenses.view", "exit.view",
    "helpdesk.view", "helpdesk.manage", "lms.manage", "documents.view", "documents.send", "performance.view",
    "performance.manage", "assets.issue", "assets.approve", "assets.manage", "payroll.view", "onboarding.view",
]

const OPTION_SELECT = {
    id: true, employeeId: true, firstName: true, middleName: true, lastName: true,
    designation: true, status: true, photo: true, departmentId: true,
    // Lets month-based screens (attendance upload) tell who was on the rolls
    // that month — joined by its end, not left before its start.
    dateOfJoining: true, dateOfLeaving: true,
    department: { select: { id: true, name: true } },
    branch: { select: { id: true, name: true } },
    deployments: {
        where: { isActive: true },
        select: { siteId: true, site: { select: { id: true, name: true, code: true } } },
        take: 1,
        orderBy: { startDate: "desc" as const },
    },
    user: { select: { id: true, customRoleId: true } },
}

export async function GET(req: Request) {
    const g = await guard(req, PICKER_PERMISSIONS)
    if (g instanceof NextResponse) return g
    try {
        const { searchParams } = new URL(req.url)
        // Same filters as the employee list (status, siteId, departmentId, search…).
        const filtered = buildEmployeeWhere(employeeFiltersFromParams(searchParams))
        const scope = await employeeScope(g.access)
        const where = scope ? { AND: [filtered, scope] } : filtered
        const limitParam = parseInt(searchParams.get("limit") ?? "")
        const take = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 5000) : 5000

        const employees = await prisma.employee.findMany({
            where,
            select: OPTION_SELECT,
            orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
            take,
        })
        return NextResponse.json({ employees, total: employees.length, totalPages: 1, truncated: employees.length === take })
    } catch (error) {
        console.error("[EMPLOYEE_OPTIONS_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
