// Dated employee movements (People → Movements): a transfer to another site,
// a promotion / new designation, a department or reporting-manager change,
// each with an effective date. Due ones are applied by the daily job (or at
// once when the date is today or earlier); the before values are kept.
import prisma from "@/lib/prisma"
import { recordSiteChange } from "@/lib/site-history"
import { standardDesignation } from "@/lib/people-masters-server"
import { assignAfterEmployeeChange } from "@/lib/lms-auto"

export type MoveValues = { siteId?: string | null; designation?: string | null; departmentId?: string | null; managerId?: string | null }
export const MOVE_TYPES = ["TRANSFER", "PROMOTION", "REDESIGNATION", "DEPARTMENT", "MANAGER"] as const

export async function currentValues(employeeId: string): Promise<MoveValues> {
    const [e, dep] = await Promise.all([
        prisma.employee.findUnique({ where: { id: employeeId }, select: { designation: true, departmentId: true, managerId: true } }),
        prisma.deployment.findFirst({ where: { employeeId, isActive: true }, orderBy: { startDate: "desc" }, select: { siteId: true } }),
    ])
    return { siteId: dep?.siteId ?? null, designation: e?.designation ?? null, departmentId: e?.departmentId ?? null, managerId: e?.managerId ?? null }
}

/** Applies one scheduled movement. */
export async function applyMovement(id: string, actor: { id: string | null; name: string | null }) {
    const m = await prisma.employeeMovement.findUnique({ where: { id } })
    if (!m || m.status !== "SCHEDULED") return false
    const to = (m.toValues ?? {}) as MoveValues
    const before = await currentValues(m.employeeId)
    const data: any = {}
    if (to.designation) data.designation = await standardDesignation(to.designation)
    if (to.departmentId !== undefined && to.departmentId) data.departmentId = to.departmentId
    if (to.managerId !== undefined && to.managerId) data.managerId = to.managerId
    if (Object.keys(data).length) await prisma.employee.update({ where: { id: m.employeeId }, data })
    if (to.siteId && to.siteId !== before.siteId) {
        await prisma.deployment.updateMany({ where: { employeeId: m.employeeId, isActive: true }, data: { isActive: false, endDate: m.effectiveDate } })
        await prisma.deployment.create({ data: { employeeId: m.employeeId, siteId: to.siteId, startDate: m.effectiveDate, isActive: true, createdBy: actor.id ?? undefined, notes: `Transfer (movement ${m.type.toLowerCase()})` } })
        recordSiteChange({ action: before.siteId ? "deployment.move" : "deployment.assign", employeeId: m.employeeId, siteId: to.siteId, fromSiteId: before.siteId, startDate: m.effectiveDate, source: "Deployments", actorId: actor.id, actorName: actor.name, extra: { movement: m.id } })
    }
    await prisma.employeeMovement.update({ where: { id }, data: { status: "APPLIED", appliedAt: new Date(), fromValues: before as any } })
    if (data.designation || data.departmentId || to.siteId) await assignAfterEmployeeChange([m.employeeId], actor.id).catch(() => {})
    return true
}

/** Applies every movement whose date has come. */
export async function applyDueMovements(now = new Date()) {
    const due = await prisma.employeeMovement.findMany({ where: { status: "SCHEDULED", effectiveDate: { lte: now } }, select: { id: true }, orderBy: { effectiveDate: "asc" } })
    let n = 0
    for (const d of due) { try { if (await applyMovement(d.id, { id: null, name: "Scheduled movement" })) n++ } catch (e) { console.error("[MOVEMENT_APPLY]", d.id, e) } }
    return n
}
