import prisma from "@/lib/prisma"
import { istDateOnly } from "@/lib/attendance-policy"

// Rules for HR marking / editing attendance (client report, Nov 2026:
// "attendance marked / edited before time").
//   - no future dates (India time)
//   - no check-in / check-out later than now (5 minutes' grace for clocks)
//   - check-out after check-in
const GRACE_MS = 5 * 60_000

/** `day` is the attendance date at UTC midnight (as the routes store it). */
export function attendanceTimeError(day: Date, checkIn: Date | null, checkOut: Date | null, now = new Date()): string | null {
    if (day.getTime() > istDateOnly(now).getTime()) return "Attendance can't be marked for a future date."
    if (checkIn && checkIn.getTime() > now.getTime() + GRACE_MS) return "Check-in time can't be later than the current time."
    if (checkOut && checkOut.getTime() > now.getTime() + GRACE_MS) return "Check-out time can't be later than the current time."
    if (checkIn && checkOut && checkOut.getTime() <= checkIn.getTime()) return "Check-out must be after check-in."
    return null
}

/** Each employee's current posting (newest active deployment), for attendance rows marked without a site. */
export async function postedSites(employeeIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>()
    if (!employeeIds.length) return out
    const rows = await prisma.deployment.findMany({
        where: { employeeId: { in: Array.from(new Set(employeeIds)) }, isActive: true },
        orderBy: { startDate: "desc" },
        select: { employeeId: true, siteId: true },
    })
    for (const r of rows) if (!out.has(r.employeeId)) out.set(r.employeeId, r.siteId)
    return out
}
