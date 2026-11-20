import type { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { istDay } from "@/lib/perf-hub"
import { PerfHubError } from "@/lib/perf-hub-db"
import { getDwmSettings } from "@/lib/dwm-settings"

export const MAX_BULK_ASSIGN = 1000

/**
 * How the reviewer is set:
 *  - { userId }      a specific person (null clears it → HR reviews)
 *  - "manager"       each employee's manager from their HR record
 *  - undefined       keep what each employee has; new assignments follow
 *                    DWM Settings → "Reviewer defaults to manager"
 */
export type ReviewerSpec = { userId: string | null } | "manager" | undefined

export type AssignResult = { created: number; updated: number; removed: number; fromManager: number; noManager: number }

/** Assign a template family and/or reviewer to many employees at once. */
export async function applyAssignments(opts: {
    employeeIds: string[]
    /** string = assign this family; null = remove assignments; undefined = keep the template */
    templateFamilyId: string | null | undefined
    reviewer: ReviewerSpec
    actorId: string
}): Promise<AssignResult> {
    const employeeIds = Array.from(new Set(opts.employeeIds.filter(Boolean)))
    if (!employeeIds.length) throw new PerfHubError(400, "Pick at least one employee")
    if (employeeIds.length > MAX_BULK_ASSIGN) throw new PerfHubError(400, `At most ${MAX_BULK_ASSIGN} employees at a time`)

    if (opts.templateFamilyId === null) {
        const res = await prisma.perfAssignment.deleteMany({ where: { employeeId: { in: employeeIds } } })
        return { created: 0, updated: 0, removed: res.count, fromManager: 0, noManager: 0 }
    }
    const familyId = opts.templateFamilyId
    if (familyId) {
        const exists = await prisma.perfTemplate.findFirst({ where: { familyId, status: { not: "ARCHIVED" } }, select: { id: true } })
        if (!exists) throw new PerfHubError(400, "Template not found")
    }

    const employees = await prisma.employee.findMany({
        where: { id: { in: employeeIds } },
        select: { id: true, userId: true, firstName: true, lastName: true, managerId: true },
    })
    if (employees.length !== employeeIds.length) throw new PerfHubError(400, "Employee not found")

    const spec = opts.reviewer
    if (spec && spec !== "manager" && spec.userId) {
        const u = await prisma.user.findUnique({ where: { id: spec.userId }, select: { isActive: true } })
        if (!u || !u.isActive) throw new PerfHubError(400, "Reviewer not found or inactive")
        const self = employees.find(e => e.userId === spec.userId)
        if (self) throw new PerfHubError(400, `${self.firstName} ${self.lastName} can't review their own reports`)
    }

    // The manager on each HR record, when it's an active login other than the employee.
    const settings = await getDwmSettings()
    const wantManager = spec === "manager" || (spec === undefined && settings.reviewer.defaultFromManager)
    const managerOf = new Map<string, string | null>()
    if (wantManager) {
        const ids = Array.from(new Set(employees.map(e => e.managerId).filter((x): x is string => !!x)))
        const active = new Set((await prisma.user.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true } })).map(u => u.id))
        for (const e of employees) managerOf.set(e.id, e.managerId && active.has(e.managerId) && e.managerId !== e.userId ? e.managerId : null)
    }

    const existing = await prisma.perfAssignment.findMany({ where: { employeeId: { in: employeeIds } } })
    const have = new Map(existing.map(a => [a.employeeId, a]))
    const toCreate = employeeIds.filter(id => !have.has(id))
    if (toCreate.length && !familyId) throw new PerfHubError(400, "Pick a template for employees who don't have one yet")

    /** Reviewer to write: a value, or undefined to leave it as it is. */
    const reviewerFor = (empId: string, isNew: boolean): string | null | undefined => {
        if (spec === "manager") return managerOf.get(empId) ?? null
        if (spec) return spec.userId
        return isNew ? (wantManager ? managerOf.get(empId) ?? null : null) : undefined
    }

    const today = istDay()
    const ops: Prisma.PrismaPromise<unknown>[] = []
    let fromManager = 0, noManager = 0
    const countManager = (empId: string, isNew: boolean) => {
        if (spec === "manager" || (isNew && spec === undefined && wantManager)) { if (managerOf.get(empId)) fromManager++; else noManager++ }
    }

    if (toCreate.length) {
        ops.push(prisma.perfAssignment.createMany({
            data: toCreate.map(employeeId => {
                countManager(employeeId, true)
                return { employeeId, templateFamilyId: familyId!, reviewerUserId: reviewerFor(employeeId, true) ?? null, effectiveFrom: today, createdBy: opts.actorId }
            }),
            skipDuplicates: true,
        }))
    }
    // Existing assignments, grouped by what changes, so each group is one updateMany.
    const groups = new Map<string, { ids: string[]; data: Prisma.PerfAssignmentUncheckedUpdateManyInput }>()
    for (const a of existing) {
        const switching = !!familyId && a.templateFamilyId !== familyId
        const rev = reviewerFor(a.employeeId, false)
        countManager(a.employeeId, false)
        if (!switching && rev === undefined) continue
        const data: Prisma.PerfAssignmentUncheckedUpdateManyInput = {}
        // A new template family starts its compliance clock today.
        if (switching) { data.templateFamilyId = familyId; data.effectiveFrom = today }
        if (rev !== undefined) data.reviewerUserId = rev
        const key = JSON.stringify(data)
        const g = groups.get(key) ?? { ids: [], data }
        g.ids.push(a.employeeId)
        groups.set(key, g)
    }
    for (const g of Array.from(groups.values())) ops.push(prisma.perfAssignment.updateMany({ where: { employeeId: { in: g.ids } }, data: g.data }))
    if (ops.length) await prisma.$transaction(ops)
    return { created: toCreate.length, updated: existing.length, removed: 0, fromManager, noManager }
}
