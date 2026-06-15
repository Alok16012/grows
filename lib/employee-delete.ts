import prisma from "@/lib/prisma"
import { randomUUID } from "crypto"

// Hard-deleting an employee must also remove every record that points at them.
// We do NOT rely on DB-level ON DELETE CASCADE because production migrations are
// applied out-of-band and may predate the cascade rules in schema.prisma — a
// single missing cascade would otherwise make the whole delete fail and leave a
// "ghost" employee (and their login) lingering in lists. So we purge dependents
// explicitly and best-effort: a table that doesn't exist or is already empty is
// harmless and must not abort the rest.
async function purgeDependents(ids: string[]) {
    const ops: Array<() => Promise<unknown>> = [
        // Grandchildren first (reference a child, not the employee directly).
        () => prisma.kPI.deleteMany({ where: { review: { employeeId: { in: ids } } } }),
        () => prisma.kRA.deleteMany({ where: { review: { employeeId: { in: ids } } } }),
        () => prisma.exitClearanceTask.deleteMany({ where: { exitRequest: { employeeId: { in: ids } } } }),
        // Direct children. Check-ins before tasks, tasks before their parent record.
        () => prisma.fieldCheckIn.deleteMany({ where: { employeeId: { in: ids } } }),
        () => prisma.fieldTask.deleteMany({ where: { employeeId: { in: ids } } }),
        () => prisma.onboardingTask.deleteMany({ where: { employeeId: { in: ids } } }),
        () => prisma.onboardingRecord.deleteMany({ where: { employeeId: { in: ids } } }),
        () => prisma.performanceReview.deleteMany({ where: { employeeId: { in: ids } } }),
        () => prisma.pIP.deleteMany({ where: { employeeId: { in: ids } } }),
        () => prisma.exitRequest.deleteMany({ where: { employeeId: { in: ids } } }),
        () => prisma.attendance.deleteMany({ where: { employeeId: { in: ids } } }),
        () => prisma.leave.deleteMany({ where: { employeeId: { in: ids } } }),
        () => prisma.payroll.deleteMany({ where: { employeeId: { in: ids } } }),
        () => prisma.advanceAndReimbursement.deleteMany({ where: { employeeId: { in: ids } } }),
        () => prisma.quizAttempt.deleteMany({ where: { employeeId: { in: ids } } }),
        () => prisma.courseEnrollment.deleteMany({ where: { employeeId: { in: ids } } }),
        () => prisma.courseFeedback.deleteMany({ where: { employeeId: { in: ids } } }),
        () => prisma.iLTAttendance.deleteMany({ where: { employeeId: { in: ids } } }),
        () => prisma.policyAcknowledgment.deleteMany({ where: { employeeId: { in: ids } } }),
        () => prisma.employeeAsset.deleteMany({ where: { employeeId: { in: ids } } }),
        () => prisma.employeeDocument.deleteMany({ where: { employeeId: { in: ids } } }),
        () => prisma.hrDocument.deleteMany({ where: { employeeId: { in: ids } } }),
        () => prisma.employeeSalary.deleteMany({ where: { employeeId: { in: ids } } }),
        () => prisma.deployment.deleteMany({ where: { employeeId: { in: ids } } }),
    ]
    for (const op of ops) {
        try {
            await op()
        } catch (e) {
            console.warn("[EMPLOYEE_DELETE] dependent purge step failed (continuing)", e)
        }
    }
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

    await purgeDependents(ids)

    const { count: deleted } = await prisma.employee.deleteMany({ where: { id: { in: ids } } })

    let loginsRemoved = 0
    for (const userId of userIds) {
        if (await removeLogin(userId)) loginsRemoved++
    }

    return { deleted, loginsRemoved }
}
