import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { getRelease, isVisible } from "@/lib/payslip-release"
import { getLeavePolicy, getLeaveBalances } from "@/lib/leave-policy-server"
import { audienceWhere } from "@/lib/audience"
import { istDateOnly, dayWindow } from "@/lib/attendance-policy"
import { PRESENT_WHERE } from "@/lib/attendance-today"
import { pickPhotoUrl } from "@/lib/employee-photo"

export const dynamic = "force-dynamic"

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> { try { return await p } catch (e) { console.error("[ME_HOME]", e); return fallback } }

// GET — everything the phone home page shows about the signed-in person, in one call:
// today's attendance, this month's days, leave left, latest sent payslip, tasks,
// next holiday, today's birthdays / work anniversaries, latest announcements.
// Only the caller's own records; holidays/announcements follow the usual audience rules.
export async function GET(req: Request) {
    const session = await getApiSession(req)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const userId = session.user.id
    const emp = await prisma.employee.findFirst({
        where: { userId },
        select: { id: true, firstName: true, lastName: true, photo: true, employeeId: true, designation: true, deployments: { where: { isActive: true }, select: { site: { select: { name: true } } }, take: 1 } },
    })

    // Profile photo for the desktop home card; falls back to an uploaded Photo document.
    let photo: string | null = emp?.photo ?? null
    if (emp && !photo) photo = await safe(prisma.employeeDocument.findMany({ where: { employeeId: emp.id }, select: { type: true, fileName: true, fileUrl: true, uploadedAt: true } }).then(pickPhotoUrl), null)

    const now = new Date()
    const { gte: dayStart, lt: dayEnd } = dayWindow(istDateOnly(now))
    const ist = new Date(now.getTime() + 330 * 60_000)
    const monthStart = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - 330 * 60_000)
    const aud = await safe(audienceWhere(session), null)

    const monthEnd = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() + 1, 1) - 330 * 60_000)
    const [today, presentDays, leaveDays, absentDays, payslip, leave, myOpen, myOverdue, awaitingMine, holiday, announcements, celebrations, monthHolidays] = await Promise.all([
        emp ? safe(prisma.attendance.findFirst({ where: { employeeId: emp.id, date: { gte: dayStart, lt: dayEnd } }, select: { checkIn: true, checkOut: true, status: true, workingHrs: true } }), null) : null,
        emp ? safe(prisma.attendance.count({ where: { employeeId: emp.id, date: { gte: monthStart, lt: dayEnd }, ...PRESENT_WHERE } }), 0) : 0,
        emp ? safe(prisma.attendance.count({ where: { employeeId: emp.id, date: { gte: monthStart, lt: dayEnd }, status: { in: ["ON_LEAVE", "LEAVE"] } } }), 0) : 0,
        emp ? safe(prisma.attendance.count({ where: { employeeId: emp.id, date: { gte: monthStart, lt: dayEnd }, status: "ABSENT" } }), 0) : 0,
        emp ? safe((async () => {
            const release = await getRelease()
            const rows = await prisma.payroll.findMany({ where: { employeeId: emp.id, status: { not: "DRAFT" } }, orderBy: [{ year: "desc" }, { month: "desc" }], take: 8, select: { month: true, year: true, status: true, siteId: true, netSalary: true, paidAt: true } })
            const p = rows.find(r => isVisible({ ...r, status: String(r.status) }, release))
            return p ? { month: p.month, year: p.year, net: p.netSalary, paid: !!p.paidAt } : null
        })(), null) : null,
        emp ? safe((async () => {
            const { policy } = await getLeavePolicy()
            const b = (await getLeaveBalances([emp.id], now, policy)).get(emp.id)?.balances ?? []
            const shown = b.filter(x => x.available !== null)
            return { total: shown.reduce((s, x) => s + Math.max(0, x.available ?? 0), 0), items: shown.map(x => ({ code: x.code, name: x.name, available: Math.max(0, x.available ?? 0), color: x.color })) }
        })(), null) : null,
        safe(prisma.workTask.count({ where: { assigneeId: userId, status: { in: ["TODO", "IN_PROGRESS", "AWAITING_APPROVAL"] } } }), 0),
        safe(prisma.workTask.count({ where: { assigneeId: userId, status: { in: ["TODO", "IN_PROGRESS"] }, dueAt: { lt: now } } }), 0),
        safe(prisma.workTask.count({ where: { createdBy: userId, status: "AWAITING_APPROVAL" } }), 0),
        safe(prisma.holiday.findFirst({ where: { ...(aud ?? {}), date: { gte: dayStart } }, orderBy: { date: "asc" }, select: { name: true, date: true, type: true } }), null),
        safe(prisma.announcement.findMany({ where: aud ? { isActive: true, ...aud } : { isActive: true }, orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }], take: 5, select: { id: true, title: true, category: true, publishedAt: true } }), []),
        // Birthdays and work anniversaries today (IST), active employees only. First names only.
        safe(prisma.$queryRawUnsafe<{ firstName: string; lastName: string | null; kind: string; years: number | null }[]>(`
            SELECT "firstName", "lastName", 'birthday' AS kind, NULL::int AS years FROM "Employee"
             WHERE status = 'ACTIVE' AND "dateOfBirth" IS NOT NULL
               AND EXTRACT(MONTH FROM ("dateOfBirth" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')) = $1 AND EXTRACT(DAY FROM ("dateOfBirth" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')) = $2
            UNION ALL
            SELECT "firstName", "lastName", 'work' AS kind, ($3 - EXTRACT(YEAR FROM ("dateOfJoining" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')))::int AS years FROM "Employee"
             WHERE status = 'ACTIVE' AND "dateOfJoining" IS NOT NULL
               AND EXTRACT(MONTH FROM ("dateOfJoining" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')) = $1 AND EXTRACT(DAY FROM ("dateOfJoining" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')) = $2
               AND EXTRACT(YEAR FROM ("dateOfJoining" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')) < $3
            LIMIT 30`, ist.getUTCMonth() + 1, ist.getUTCDate(), ist.getUTCFullYear()), []),
        // This month's holidays, for the calendar on the desktop home.
        safe(prisma.holiday.findMany({ where: { ...(aud ?? {}), date: { gte: monthStart, lt: monthEnd } }, orderBy: { date: "asc" }, take: 15, select: { name: true, date: true, type: true } }), []),
    ])

    return NextResponse.json({
        employee: emp ? { firstName: emp.firstName, name: [emp.firstName, emp.lastName].filter(Boolean).join(" "), photo, code: emp.employeeId, designation: emp.designation, site: emp.deployments[0]?.site?.name ?? null } : null,
        today, month: { present: presentDays, leave: leaveDays, absent: absentDays },
        leave, payslip,
        tasks: { myOpen, myOverdue, awaitingMine },
        holiday, announcements, monthHolidays,
        celebrations: celebrations.map(c => ({ name: [c.firstName, c.lastName].filter(Boolean).join(" "), kind: c.kind, years: c.years })),
    })
}
