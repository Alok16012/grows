import prisma from "@/lib/prisma"

// In-app notifications for HR workflows (leave, attendance, exit, LMS …).
// Best effort: a notification failing must never fail the action that caused it.

type Note = { title: string; message: string; type: string; link?: string }

/** Everyone who can act on this kind of request: admins plus any active user
 *  whose custom role carries one of the permissions. */
export async function notifyApprovers(permissions: string[], note: Note, exceptUserId?: string) {
    try {
        const users = await prisma.user.findMany({
            where: {
                isActive: true,
                OR: [
                    { role: "ADMIN" },
                    { customRole: { isActive: true, permissions: { hasSome: permissions } } },
                ],
                ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
            },
            select: { id: true },
            take: 200,
        })
        if (!users.length) return
        await prisma.notification.createMany({ data: users.map(u => ({ userId: u.id, ...note })) })
    } catch (e) {
        console.error("[HR_NOTIFY_APPROVERS]", e)
    }
}

/** The login linked to an employee record, if they have one. */
export async function notifyEmployee(employeeId: string, note: Note) {
    try {
        const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { userId: true } })
        if (!emp?.userId) return
        await prisma.notification.create({ data: { userId: emp.userId, ...note } })
    } catch (e) {
        console.error("[HR_NOTIFY_EMPLOYEE]", e)
    }
}
