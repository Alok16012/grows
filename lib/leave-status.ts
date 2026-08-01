import prisma from "@/lib/prisma"

// Employee.status doubles as a leave flag (ON_LEAVE), so it has to be kept in
// step with the Leave table. Approving a leave used to set ON_LEAVE immediately
// and unconditionally — a leave starting next month flipped the employee right
// away — and nothing ever set them back once the leave ended, so anyone who took
// a single day off stayed badged ON_LEAVE until an admin edited them by hand.
//
// Only ACTIVE ↔ ON_LEAVE is ever touched here. TERMINATED / RESIGNED / INACTIVE /
// ONBOARDING are terminal or pre-employment states and must never be overwritten
// by a leave record.
const LEAVE_MANAGED_STATUSES = ["ACTIVE", "ON_LEAVE"]

function todayRange() {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
    return { start, end }
}

// Recompute one employee's status from their approved leaves.
// Returns the status it settled on, or null if the employee wasn't eligible.
export async function syncLeaveStatus(employeeId: string): Promise<string | null> {
    const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { id: true, status: true },
    })
    if (!employee || !LEAVE_MANAGED_STATUSES.includes(employee.status)) return null

    const { start, end } = todayRange()
    const onLeaveToday = await prisma.leave.count({
        where: {
            employeeId,
            status: "APPROVED",
            startDate: { lt: end },
            endDate: { gte: start },
        },
    })

    const next = onLeaveToday > 0 ? "ON_LEAVE" : "ACTIVE"
    if (next !== employee.status) {
        await prisma.employee.update({ where: { id: employeeId }, data: { status: next } })
    }
    return next
}

// Same rule applied across the workforce — used by the daily cron so employees
// move into and out of ON_LEAVE on the right day without anyone touching them.
export async function syncAllLeaveStatuses(): Promise<{ toOnLeave: number; toActive: number }> {
    const { start, end } = todayRange()

    const onLeaveTodayIds = new Set(
        (
            await prisma.leave.findMany({
                where: { status: "APPROVED", startDate: { lt: end }, endDate: { gte: start } },
                select: { employeeId: true },
                distinct: ["employeeId"],
            })
        ).map(l => l.employeeId)
    )

    const employees = await prisma.employee.findMany({
        where: { status: { in: LEAVE_MANAGED_STATUSES as any } },
        select: { id: true, status: true },
    })

    const toOnLeave = employees
        .filter(e => e.status === "ACTIVE" && onLeaveTodayIds.has(e.id))
        .map(e => e.id)
    const toActive = employees
        .filter(e => e.status === "ON_LEAVE" && !onLeaveTodayIds.has(e.id))
        .map(e => e.id)

    if (toOnLeave.length) {
        await prisma.employee.updateMany({ where: { id: { in: toOnLeave } }, data: { status: "ON_LEAVE" } })
    }
    if (toActive.length) {
        await prisma.employee.updateMany({ where: { id: { in: toActive } }, data: { status: "ACTIVE" } })
    }

    return { toOnLeave: toOnLeave.length, toActive: toActive.length }
}
