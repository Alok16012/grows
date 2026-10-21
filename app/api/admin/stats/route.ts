import { NextResponse } from "next/server"
import prisma, { ensureProjectSchema } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { unstable_cache } from "next/cache"
import { todayAttendance, EMPTY_TODAY, PRESENT_WHERE } from "@/lib/attendance-today"

export const dynamic = "force-dynamic"
export const maxDuration = 30

// One guarded query: prod migrations are manual, so any table may be missing
// there — a single failed count must not sink the whole dashboard.
function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
    return p.catch(() => fallback)
}

// IST day window expressed as UTC instants (server runs in UTC on Vercel).
function istDayRange(offsetDays = 0) {
    const IST_MS = 330 * 60 * 1000
    const nowIst = new Date(Date.now() + IST_MS)
    const dayStartIstAsUtc = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate() + offsetDays)
    const start = new Date(dayStartIstAsUtc - IST_MS)
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
    return { start, end }
}

// Cached server-side for 30s — counts don't change second-to-second and this
// endpoint fans out ~20 queries.
const getStats = unstable_cache(
    async () => {
        await ensureProjectSchema()

        const now = new Date()
        const today = istDayRange(0)
        const yesterday = istDayRange(-1)
        const week = istDayRange(-6) // start of the 7-day attendance window
        const in30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
        const ago30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        const ago60d = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
        const month = now.getMonth() + 1
        const year = now.getFullYear()

        // Shared so the attendance summary can use the same count without a second query.
        const activeEmployeesQ = safe(prisma.employee.count({ where: { status: "ACTIVE" } }), 0)

        const [
            activeEmployees,
            newEmployees30d,
            att,
            pendingLeaves,
            pendingExpenses,
            pendingDocs,
            pendingInspections,
            inspectionsToday,
            inspectionsYesterday,
            trendRows,
            completed30d,
            completedPrev30d,
            onboardingInProgress,
            onboardingNotStarted,
            onboardingOnHold,
            exitsPending,
            exitsClearance,
            payrollTotal,
            payrollProcessed,
            contractsExpiring,
            docExpiries,
            recentInspections,
            projectStatusRows,
            weekAttendanceRows,
        ] = await Promise.all([
            activeEmployeesQ,
            safe(prisma.employee.count({ where: { status: "ACTIVE", createdAt: { gte: ago30d } } }), 0),
            // Today's present/leave/absent + site breakdown, same definition as the
            // permission-driven dashboard so phone and desktop agree.
            safe(activeEmployeesQ.then(n => todayAttendance(prisma, { gte: today.start, lt: today.end }, n)), EMPTY_TODAY),
            safe(prisma.leave.count({ where: { status: "PENDING" } }), 0),
            safe(prisma.expense.count({ where: { status: "SUBMITTED" } }), 0),
            safe(prisma.hrDocument.count({ where: { status: "PENDING_APPROVAL" } }), 0),
            safe(prisma.inspection.count({ where: { status: "pending" } }), 0),
            // Drafts excluded so the tile matches the /approvals?date=today list it opens.
            safe(prisma.inspection.count({ where: { status: { not: "draft" }, submittedAt: { gte: today.start, lt: today.end } } }), 0),
            safe(prisma.inspection.count({ where: { status: { not: "draft" }, submittedAt: { gte: yesterday.start, lt: yesterday.end } } }), 0),
            // Daily submitted counts for the 30-day chart
            safe(
                (prisma as any).$queryRawUnsafe(
                    // Bucketed on IST days, matching the 7-day attendance trend
                    // below. date_trunc alone truncates in the session timezone
                    // (UTC here), which put an inspection submitted before
                    // 05:30 IST on the previous day's bar.
                    `SELECT to_char(date_trunc('day', "submittedAt" + interval '330 minutes'), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
                     FROM "Inspection" WHERE "submittedAt" >= $1 GROUP BY 1 ORDER BY 1`,
                    ago30d
                ) as Promise<{ day: string; count: number }[]>,
                []
            ),
            safe(prisma.inspection.count({ where: { submittedAt: { gte: ago30d } } }), 0),
            safe(prisma.inspection.count({ where: { submittedAt: { gte: ago60d, lt: ago30d } } }), 0),
            safe(prisma.onboardingRecord.count({ where: { status: "IN_PROGRESS" } }), 0),
            safe(prisma.onboardingRecord.count({ where: { status: "NOT_STARTED" } }), 0),
            safe(prisma.onboardingRecord.count({ where: { status: "ON_HOLD" } }), 0),
            safe(prisma.exitRequest.count({
                where: { status: { in: ["INITIATED", "NOTICE_PERIOD", "CLEARANCE_PENDING", "FULL_FINAL_PENDING"] } },
            }), 0),
            safe(prisma.exitRequest.count({ where: { status: "CLEARANCE_PENDING" } }), 0),
            safe(prisma.payroll.count({ where: { month, year } }), 0),
            safe(prisma.payroll.count({ where: { month, year, status: { in: ["PROCESSED", "PAID"] } } }), 0),
            // Clients & Finance module removed — no contract expiry alerts.
            Promise.resolve(0),
            safe(prisma.employee.count({
                where: { status: "ACTIVE", labourCardExpDate: { gte: now, lte: in30d } },
            }), 0),
            safe(prisma.inspection.findMany({
                take: 6,
                orderBy: { submittedAt: "desc" },
                where: { status: { not: "draft" } },
                select: {
                    id: true,
                    status: true,
                    submittedAt: true,
                    assignment: { select: { project: { select: { name: true } } } },
                    submitter: { select: { name: true } },
                },
            }), [] as any[]),
            // Projects grouped by workflow status — feeds the status donut
            safe(
                prisma.project.groupBy({ by: ["status"], _count: { _all: true } }) as Promise<{ status: string; _count: { _all: number } }[]>,
                []
            ),
            // Present rows over the last 7 IST days — feeds the trend bars. Same
            // "present" rule as today's tile so the two are comparable.
            safe(prisma.attendance.findMany({
                where: { date: { gte: week.start, lt: today.end }, ...PRESENT_WHERE },
                select: { date: true },
            }), [] as { date: Date }[]),
        ])

        // ── Attendance aggregation ──
        const { present, absent, onLeave: onLeaveToday, attendancePct } = att

        // Same rule as the overall figure: present ÷ (deployed − on leave).
        // bySite is already sorted by expected headcount, largest first.
        const topSites = att.bySite.slice(0, 5).map(s => ({
            siteId: s.siteId,
            name: s.name,
            present: s.present,
            absent: s.absent,
            onLeave: s.onLeave,
            expected: s.expected,
            notMarked: s.notMarked,
            pct: s.pct,
        }))
        // Only grade sites that have mostly been marked — an unmarked site is a
        // "not marked yet" problem, not a low-attendance one.
        const lowAttendanceSites = att.bySite.filter(s =>
            s.pct !== null && s.notMarked <= s.expected / 2 && s.pct < 80
        ).length

        // ── 30-day inspection trend, missing days filled with 0 ──
        // Keys must be IST days to match the shifted bucketing in the SQL above;
        // a plain toISOString() here would look up UTC keys and silently miss.
        const IST_OFFSET_MS = 330 * 60 * 1000
        const istKey = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
        const byDay = new Map(trendRows.map(r => [r.day, Number(r.count)]))
        const trend: { day: string; count: number }[] = []
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
            const key = istKey(d)
            trend.push({ day: key, count: byDay.get(key) ?? 0 })
        }
        const completedDeltaPct = completedPrev30d > 0
            ? Math.round(((completed30d - completedPrev30d) / completedPrev30d) * 100)
            : null

        const approvalsTotal = pendingLeaves + pendingExpenses + pendingDocs + pendingInspections

        // ── Projects by status (missing status column on old rows = ACTIVE) ──
        const projectsByStatus: Record<string, number> = {}
        for (const r of projectStatusRows) {
            const key = r.status || "ACTIVE"
            projectsByStatus[key] = (projectsByStatus[key] ?? 0) + (r._count?._all ?? 0)
        }

        // ── 7-day attendance trend, bucketed on IST day boundaries ──
        const dayKey = istKey
        const weekCounts = new Map<string, number>()
        for (const r of weekAttendanceRows) {
            const k = dayKey(new Date(r.date))
            weekCounts.set(k, (weekCounts.get(k) ?? 0) + 1)
        }
        const attendanceTrend7d: { day: string; count: number }[] = []
        for (let i = -6; i <= 0; i++) {
            const { start } = istDayRange(i)
            const k = dayKey(new Date(start.getTime() + 1000))
            attendanceTrend7d.push({ day: k, count: weekCounts.get(k) ?? 0 })
        }

        return {
            activeEmployees,
            newEmployees30d,
            // pct stays numeric for older consumers; attendancePct is null until
            // someone is marked so the UI can say "Not marked yet" instead of 0%.
            attendanceToday: {
                present, absent, onLeave: onLeaveToday, pct: att.pct ?? 0,
                attendancePct, unmarked: att.unmarked, late: att.late, halfDay: att.halfDay,
                expected: att.expected, notMarked: att.notMarked,
            },
            topSites,
            approvals: {
                total: approvalsTotal,
                leaves: pendingLeaves,
                expenses: pendingExpenses,
                documents: pendingDocs,
                inspections: pendingInspections,
            },
            inspectionsToday,
            inspectionsYesterday,
            // previous30d lets the UI show an absolute change when the base is too small for a % to mean anything.
            inspectionTrend: { days: trend, completed30d, previous30d: completedPrev30d, deltaPct: completedDeltaPct },
            onboarding: {
                inProgress: onboardingInProgress,
                notStarted: onboardingNotStarted,
                onHold: onboardingOnHold,
            },
            exits: { pending: exitsPending, clearancePending: exitsClearance },
            payroll: {
                total: payrollTotal,
                processed: payrollProcessed,
                pending: Math.max(0, payrollTotal - payrollProcessed),
                pct: payrollTotal > 0 ? Math.round((payrollProcessed / payrollTotal) * 100) : 0,
            },
            alerts: { contractsExpiring, docExpiries, lowAttendanceSites },
            projectsByStatus,
            attendanceTrend7d,
            recentInspections: recentInspections.map((i: any) => ({
                id: i.id,
                projectName: i.assignment?.project?.name ?? "—",
                inspectorName: i.submitter?.name ?? "—",
                submittedAt: i.submittedAt,
                status: i.status,
            })),
        }
    },
    ["admin-stats-v4"],
    { revalidate: 30, tags: ["admin-stats"] },
)

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== Role.ADMIN) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    try {
        const stats = await getStats()
        return NextResponse.json(stats, {
            headers: {
                "Cache-Control": "private, max-age=15, stale-while-revalidate=60",
            },
        })
    } catch (error) {
        console.error("ADMIN_STATS_ERROR", error)
        return NextResponse.json({ error: "Failed to load stats" }, { status: 500 })
    }
}
