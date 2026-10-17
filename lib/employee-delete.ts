import prisma from "@/lib/prisma"
import { randomUUID } from "crypto"

// The shared client is $extends-ed (lib/prisma.ts), so Prisma.TransactionClient
// is not assignable to it; derive the tx type from the callback instead.
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

// Hard-deleting an employee must also remove every record that points at them.
// We do NOT rely on DB-level ON DELETE CASCADE because production migrations are
// applied out-of-band and may predate the cascade rules in schema.prisma — a
// single missing cascade would otherwise make the whole delete fail and leave a
// "ghost" employee (and their login) lingering in lists. So we purge dependents
// explicitly.
//
// This runs inside the caller's transaction, so there is no per-step
// swallow-and-continue: on Postgres a failed statement aborts the whole
// transaction anyway, and the point of the transaction is that a purge which
// cannot complete leaves the employee — and every record under them — intact,
// rather than half-stripped.
async function purgeDependents(tx: Tx, ids: string[]) {
    // Grandchildren first (reference a child, not the employee directly).
    await tx.kPI.deleteMany({ where: { review: { employeeId: { in: ids } } } })
    await tx.kRA.deleteMany({ where: { review: { employeeId: { in: ids } } } })
    await tx.exitClearanceTask.deleteMany({ where: { exitRequest: { employeeId: { in: ids } } } })
    // Direct children. Check-ins before tasks, tasks before their parent record.
    await tx.fieldCheckIn.deleteMany({ where: { employeeId: { in: ids } } })
    await tx.fieldTask.deleteMany({ where: { employeeId: { in: ids } } })
    await tx.onboardingTask.deleteMany({ where: { employeeId: { in: ids } } })
    await tx.onboardingRecord.deleteMany({ where: { employeeId: { in: ids } } })
    await tx.performanceReview.deleteMany({ where: { employeeId: { in: ids } } })
    await tx.pIP.deleteMany({ where: { employeeId: { in: ids } } })
    await tx.exitRequest.deleteMany({ where: { employeeId: { in: ids } } })
    await tx.attendance.deleteMany({ where: { employeeId: { in: ids } } })
    await tx.leave.deleteMany({ where: { employeeId: { in: ids } } })
    await tx.payroll.deleteMany({ where: { employeeId: { in: ids } } })
    await tx.advanceAndReimbursement.deleteMany({ where: { employeeId: { in: ids } } })
    await tx.quizAttempt.deleteMany({ where: { employeeId: { in: ids } } })
    await tx.courseEnrollment.deleteMany({ where: { employeeId: { in: ids } } })
    await tx.courseFeedback.deleteMany({ where: { employeeId: { in: ids } } })
    await tx.iLTAttendance.deleteMany({ where: { employeeId: { in: ids } } })
    await tx.policyAcknowledgment.deleteMany({ where: { employeeId: { in: ids } } })
    await tx.employeeAsset.deleteMany({ where: { employeeId: { in: ids } } })
    await tx.employeeDocument.deleteMany({ where: { employeeId: { in: ids } } })
    await tx.hrDocument.deleteMany({ where: { employeeId: { in: ids } } })
    await tx.employeeSalary.deleteMany({ where: { employeeId: { in: ids } } })
    await tx.deployment.deleteMany({ where: { employeeId: { in: ids } } })
}

// Remove a linked login. Best-effort hard delete; if the account owns
// operational records the DB won't let us drop, fall back to fully disabling it
// (wipe password + visible password, free the email, flag inactive).
async function removeLogin(userId: string): Promise<boolean> {
    try {
        await prisma.notification.deleteMany({ where: { userId } }).catch(() => {})
        await prisma.user.delete({ where: { id: userId } })
        return true
    } catch (delErr) {
        console.warn("[EMPLOYEE_DELETE] user hard-delete blocked, disabling login instead", delErr)
        try {
            await prisma.user.update({
                where: { id: userId },
                data: {
                    isActive: false,
                    password: `disabled-${randomUUID()}`,
                    plainPassword: null,
                    email: `deleted_${userId}@deleted.local`,
                    customRoleId: null,
                },
            })
            return true
        } catch (disableErr) {
            console.error("[EMPLOYEE_DELETE] failed to disable login", disableErr)
            return false
        }
    }
}

// Delete the given employees together with all their dependent records and their
// linked login accounts. Returns how many employees and logins were removed.
export async function deleteEmployeesAndLogins(ids: string[]): Promise<{ deleted: number; loginsRemoved: number }> {
    if (ids.length === 0) return { deleted: 0, loginsRemoved: 0 }

    // Capture linked logins before the employees disappear.
    const linked = await prisma.employee.findMany({
        where: { id: { in: ids }, userId: { not: null } },
        select: { userId: true },
    })
    const userIds = linked.map(l => l.userId).filter(Boolean) as string[]

    // Purge and the final delete commit together: previously a failing employee
    // delete (an FK we forgot, a timeout) left the person with no attendance,
    // payroll or documents but still listed as an employee.
    const { count: deleted } = await prisma.$transaction(async tx => {
        await purgeDependents(tx, ids)
        return tx.employee.deleteMany({ where: { id: { in: ids } } })
    }, {
        // A bulk delete across 25 tables for a few hundred ids is slow; the
        // default 5s would abort legitimately large selections.
        maxWait: 10_000,
        timeout: 60_000,
    })

    // Logins are removed after the commit: the employee rows are already gone,
    // and removeLogin has its own disable fallback for accounts the DB won't
    // let us drop.
    let loginsRemoved = 0
    for (const userId of userIds) {
        if (await removeLogin(userId)) loginsRemoved++
    }

    return { deleted, loginsRemoved }
}
