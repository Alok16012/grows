import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { UNASSIGNABLE_EMPLOYEE_STATUSES } from "@/lib/employee-filter"
import { perfCtx, perfErrorResponse, requireManager, jsonError, EMPLOYEE_SELECT } from "@/lib/perf-hub-db"
import { applyAssignments, type ReviewerSpec } from "@/lib/dwm-assign"

// GET — People & Roles: every active employee with their template + reviewer.
export async function GET(req: Request) {
    try {
        const ctx = await perfCtx(req)
        if (!ctx.canView) return jsonError(403, "Forbidden")
        const search = new URL(req.url).searchParams.get("search")?.trim()

        const where: Prisma.EmployeeWhereInput = {
            status: { notIn: [...UNASSIGNABLE_EMPLOYEE_STATUSES] },
            // Same rule as the employee list: pending onboarding isn't staff yet.
            NOT: { onboardingRecord: { is: { status: { not: "COMPLETED" } } } },
        }
        if (search) {
            const s = { contains: search, mode: "insensitive" as const }
            where.AND = search.split(/\s+/).map(w => {
                const sw = { ...s, contains: w }
                return { OR: [{ firstName: sw }, { lastName: sw }, { employeeId: sw }, { designation: sw }] }
            })
        }

        const employees = await prisma.employee.findMany({
            where,
            select: {
                ...EMPLOYEE_SELECT,
                managerId: true,
                perfAssignment: {
                    select: {
                        templateFamilyId: true, effectiveFrom: true,
                        reviewer: { select: { id: true, name: true } },
                    },
                },
            },
            orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
            take: 2000,
        })

        // Name each family by its live version, else its newest one.
        const familyIds = Array.from(new Set(employees.map(e => e.perfAssignment?.templateFamilyId).filter((x): x is string => !!x)))
        const versions = familyIds.length
            ? await prisma.perfTemplate.findMany({
                where: { familyId: { in: familyIds } },
                select: { familyId: true, name: true, version: true, status: true },
                orderBy: { version: "desc" },
            })
            : []
        const nameOf = new Map<string, string>()
        for (const v of versions) if (v.status === "PUBLISHED") nameOf.set(v.familyId, v.name)
        for (const v of versions) if (!nameOf.has(v.familyId)) nameOf.set(v.familyId, v.name)

        // The manager on each HR record (the default reviewer), with whether that login is active.
        const mgrIds = Array.from(new Set(employees.map(e => e.managerId).filter((x): x is string => !!x)))
        const mgrs = mgrIds.length ? await prisma.user.findMany({ where: { id: { in: mgrIds } }, select: { id: true, name: true, isActive: true } }) : []
        const mgrOf = new Map(mgrs.map(m => [m.id, m]))

        return NextResponse.json({
            rows: employees.map(({ perfAssignment: a, managerId, ...employee }) => ({
                employee,
                manager: managerId && mgrOf.get(managerId) ? { id: managerId, name: mgrOf.get(managerId)!.name, active: mgrOf.get(managerId)!.isActive } : null,
                assignment: a ? {
                    templateFamilyId: a.templateFamilyId,
                    templateName: nameOf.get(a.templateFamilyId) ?? null,
                    reviewer: a.reviewer,
                    effectiveFrom: a.effectiveFrom,
                } : null,
            })),
        })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_ASSIGNMENTS_GET]")
    }
}

// PUT — bulk assign. templateFamilyId null removes the assignment; a key left
// out keeps what each employee already has (e.g. change only the reviewer).
// reviewerUserId: a user id, or null/"" to clear; reviewerMode "manager" takes
// each employee's manager from their HR record.
export async function PUT(req: Request) {
    try {
        const ctx = await perfCtx(req)
        requireManager(ctx)
        const body = await req.json().catch(() => ({}))
        const employeeIds: string[] = Array.isArray(body?.employeeIds) ? (body.employeeIds as unknown[]).map(String) : []
        if (body?.templateFamilyId !== undefined && body.templateFamilyId !== null && typeof body.templateFamilyId !== "string") {
            return jsonError(400, "templateFamilyId must be a string or null")
        }
        const reviewer: ReviewerSpec = body?.reviewerMode === "manager" ? "manager"
            : body?.reviewerUserId === null || body?.reviewerUserId === "" ? { userId: null }
            : typeof body?.reviewerUserId === "string" ? { userId: body.reviewerUserId }
            : undefined
        const result = await applyAssignments({ employeeIds, templateFamilyId: body?.templateFamilyId, reviewer, actorId: ctx.userId })
        return NextResponse.json({ ok: true, ...result })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_ASSIGNMENTS_PUT]")
    }
}
