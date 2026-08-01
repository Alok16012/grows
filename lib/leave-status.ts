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

// Leave.startDate / endDate are date-only values stored at UTC midnight
// (`new Date("2026-08-05")`), so "does this leave cover today" is a calendar-date
// comparison, not an instant comparison.
//
// Today has to be the IST date, not the server's. Vercel runs UTC and the cron
// fires at 18:45 UTC to land at 00:15 IST — at that moment the UTC date is still
// yesterday, so a server-local day would apply leave a day late and clear it a
// day late.
const IST_OFFSET_MS = 330 * 60 * 1000

function istToday(): Date {
    const nowIst = new Date(Date.now() + IST_OFFSET_MS)
    return new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate()))
}

// Recompute one employee's status from their approved leaves.
// Returns the status it settled on, or null if the employee wasn't eligible.
export async function syncLeaveStatus(employeeId: string): Promise<string | null> {
    const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { id: true, status: true },
    })
    if (!employee || !LEAVE_MANAGED_STATUSES.includes(employee.status)) return null

    const today = istToday()
    const onLeaveToday = await prisma.leave.count({
        where: {
            employeeId,
            status: "APPROVED",
            startDate: { lte: today },
            endDate: { gte: today },
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
    const today = istToday()

    const onLeaveTodayIds = new Set(
        (
            await prisma.leave.findMany({
                where: { status: "APPROVED", startDate: { lte: today }, endDate: { gte: today } },
                select: { employeeId: true },
                distinct: ["employeeId"],
            })
        ).map(l => l.employeeId)
    )

    // ON_LEAVE is also set by hand from Employee Master for absences this table
    // doesn't model — maternity, suspension, long medical leave. Those have no
    // Leave row, so clearing every ON_LEAVE without one would silently undo HR's
    // choice overnight. Only clear people whose leave we can see just ended.
    const recentlyEndedIds = new Set(
        (
            await prisma.leave.findMany({
                where: {
                    status: "APPROVED",
                    endDate: { lt: today, gte: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000) },
                },
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
        .filter(e => e.status === "ON_LEAVE" && !onLeaveTodayIds.has(e.id) && recentlyEndedIds.has(e.id))
        .map(e => e.id)

    if (toOnLeave.length) {
        await prisma.employee.updateMany({ where: { id: { in: toOnLeave } }, data: { status: "ON_LEAVE" } })
    }
    if (toActive.length) {
        await prisma.employee.updateMany({ where: { id: { in: toActive } }, data: { status: "ACTIVE" } })
    }

    return { toOnLeave: toOnLeave.length, toActive: toActive.length }
}
