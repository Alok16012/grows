import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { ASSIGNABLE_USER_WHERE } from "@/lib/employee-filter"
import { perfCtx, perfErrorResponse, requireManager } from "@/lib/perf-hub-db"

// GET — who People & Roles can pick as a KPI reviewer.
//
// /api/users?role=MANAGER means "project manager" (approvals / assignments
// rights), which leaves out HR, supervisors and line managers who only review
// KPI reports. A reviewer here is any active staff login that carries a role
// beyond self-service (an active custom role), plus ADMIN — field staff who
// only log in for their own data stay out of the list. Anyone already set as
// a reviewer is kept so the current choice still shows.
export async function GET(req: Request) {
    try {
        const ctx = await perfCtx(req)
        requireManager(ctx)

        const current = await prisma.perfAssignment.findMany({
            where: { reviewerUserId: { not: null } },
            select: { reviewerUserId: true },
            distinct: ["reviewerUserId"],
        })
        const currentIds = current.map(c => c.reviewerUserId!).filter(Boolean)

        const users = await prisma.user.findMany({
            where: {
                isActive: true,
                OR: [
                    { role: "ADMIN" },
                    { ...ASSIGNABLE_USER_WHERE, customRole: { isActive: true } },
                    ...(currentIds.length ? [{ id: { in: currentIds } }] : []),
                ],
            },
            select: {
                id: true, name: true,
                employeeProfile: { select: { employeeId: true, designation: true } },
            },
            orderBy: { name: "asc" },
            take: 1000,
        })
        return NextResponse.json({
            users: users.map(u => ({
                id: u.id, name: u.name,
                employeeId: u.employeeProfile?.employeeId ?? null,
                designation: u.employeeProfile?.designation ?? null,
            })),
        })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_REVIEWERS_GET]")
    }
}
