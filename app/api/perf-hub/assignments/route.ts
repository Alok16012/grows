import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { UNASSIGNABLE_EMPLOYEE_STATUSES } from "@/lib/employee-filter"
import { istDay } from "@/lib/perf-hub"
import { perfCtx, perfErrorResponse, requireManager, jsonError, EMPLOYEE_SELECT } from "@/lib/perf-hub-db"

const MAX_BULK = 500

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

        return NextResponse.json({
            rows: employees.map(({ perfAssignment: a, ...employee }) => ({
                employee,
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
export async function PUT(req: Request) {
    try {
        const ctx = await perfCtx(req)
        requireManager(ctx)
        const body = await req.json().catch(() => ({}))
        const employeeIds: string[] = Array.isArray(body?.employeeIds)
            ? Array.from(new Set((body.employeeIds as unknown[]).map(String).filter(Boolean)))
            : []
        if (employeeIds.length === 0) return jsonError(400, "Pick at least one employee")
        if (employeeIds.length > MAX_BULK) return jsonError(400, `At most ${MAX_BULK} employees at a time`)

        if (body?.templateFamilyId === null) {
            const res = await prisma.perfAssignment.deleteMany({ where: { employeeId: { in: employeeIds } } })
            return NextResponse.json({ ok: true, updated: 0, created: 0, removed: res.count })
        }

        const familyId: string | undefined = typeof body?.templateFamilyId === "string" ? body.templateFamilyId : undefined
        if (body?.templateFamilyId !== undefined && !familyId) return jsonError(400, "templateFamilyId must be a string or null")
        if (familyId) {
            const exists = await prisma.perfTemplate.findFirst({ where: { familyId, status: { not: "ARCHIVED" } }, select: { id: true } })
            if (!exists) return jsonError(400, "Template not found")
        }

        let reviewerUserId: string | null | undefined = undefined
        if (body?.reviewerUserId === null || body?.reviewerUserId === "") reviewerUserId = null
        else if (typeof body?.reviewerUserId === "string") {
            const u = await prisma.user.findUnique({ where: { id: body.reviewerUserId }, select: { id: true, isActive: true, name: true } })
            if (!u || !u.isActive) return jsonError(400, "Reviewer not found or inactive")
            reviewerUserId = u.id
        }

        const employees = await prisma.employee.findMany({
            where: { id: { in: employeeIds } },
            select: { id: true, userId: true, firstName: true, lastName: true },
        })
        if (employees.length !== employeeIds.length) return jsonError(400, "Employee not found")
        if (reviewerUserId) {
            const self = employees.find(e => e.userId === reviewerUserId)
            if (self) return jsonError(400, `${self.firstName} ${self.lastName} can't review their own reports`)
        }

        const existing = await prisma.perfAssignment.findMany({ where: { employeeId: { in: employeeIds } } })
        const have = new Map(existing.map(a => [a.employeeId, a]))
        const toCreate = employeeIds.filter(id => !have.has(id))
        if (toCreate.length && !familyId) return jsonError(400, "Pick a template for employees who don't have one yet")

        const today = istDay()
        const reviewerData = reviewerUserId !== undefined ? { reviewerUserId } : {}
        const switching = familyId ? existing.filter(a => a.templateFamilyId !== familyId).map(a => a.employeeId) : []
        const staying = existing.map(a => a.employeeId).filter(id => !switching.includes(id))

        const ops: Prisma.PrismaPromise<unknown>[] = []
        if (toCreate.length) {
            ops.push(prisma.perfAssignment.createMany({
                data: toCreate.map(employeeId => ({
                    employeeId, templateFamilyId: familyId!, reviewerUserId: reviewerUserId ?? null,
                    effectiveFrom: today, createdBy: ctx.userId,
                })),
                skipDuplicates: true,
            }))
        }
        // A new template family starts its compliance clock today.
        if (switching.length) {
            ops.push(prisma.perfAssignment.updateMany({
                where: { employeeId: { in: switching } },
                data: { templateFamilyId: familyId, effectiveFrom: today, ...reviewerData },
            }))
        }
        if (staying.length && reviewerUserId !== undefined) {
            ops.push(prisma.perfAssignment.updateMany({ where: { employeeId: { in: staying } }, data: { reviewerUserId } }))
        }
        await prisma.$transaction(ops)
        return NextResponse.json({ ok: true, created: toCreate.length, updated: existing.length, removed: 0 })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_ASSIGNMENTS_PUT]")
    }
}
