import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { checkAccess, canReportPolicies } from "@/lib/permissions"
import { policyErrorResponse, PolicyError, signoffReady, statusFor } from "@/lib/policy-signoff"

// GET — one employee's policy sign-off status (no policy text), for HR screens
// such as onboarding review.
export async function GET(req: Request, { params }: { params: { employeeId: string } }) {
    try {
        const session = await getApiSession(req)
        if (!session?.user?.id) throw new PolicyError(401, "UNAUTHORIZED", "Unauthorized")
        const allowed = canReportPolicies(session) || checkAccess(session, [], "onboarding.view") || checkAccess(session, [], "employees.view")
        if (!allowed) throw new PolicyError(403, "FORBIDDEN", "Forbidden")
        if (!(await signoffReady())) return NextResponse.json({ ready: false, policies: [] })
        const emp = await prisma.employee.findUnique({ where: { id: params.employeeId }, select: { id: true, designation: true } })
        if (!emp) throw new PolicyError(404, "NOT_FOUND", "Employee not found")
        const list = await statusFor(emp.id, emp.designation)
        return NextResponse.json({
            ready: true,
            designation: emp.designation,
            pending: list.filter(p => p.status !== "SIGNED").length,
            policies: list.map(({ content: _c, ...p }) => p),
        })
    } catch (e) {
        return policyErrorResponse(e, "[POLICY_EMPLOYEE_STATUS]")
    }
}
