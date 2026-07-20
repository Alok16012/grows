import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { unstable_cache } from "next/cache"

export const dynamic = "force-dynamic"
export const maxDuration = 30

// Universal permission-driven dashboard stats.
// Returns ONLY the blocks the caller's permissions allow, so the page can
// render exactly the widgets this user is entitled to see. ADMIN gets all.

// Swallow individual query failures so one broken table never kills the page.
async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
    try { return await p } catch { return fallback }
}

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const isAdmin = session.user.role === "ADMIN"
    const perms: string[] = (session.user as any).permissions || []

    // 30-second server cache, keyed by the permission set (NOT the user) — all
    // users sharing a role hit the same cached snapshot instead of re-running
    // 15+ DB queries per dashboard load. Data contains no user-specific values.
    const cacheKey = isAdmin ? "ADMIN" : [...perms].sort().join(",")
    const getStats = unstable_cache(
        () => computeStats(isAdmin, perms),
        ["dashboard-stats", cacheKey],
        { revalidate: 30 }
    )
    return NextResponse.json(await getStats())
}

async function computeStats(isAdmin: boolean, perms: string[]) {
    const has = (p: string) => isAdmin || perms.includes(p)

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1)
    const ago7d = new Date(todayStart); ago7d.setDate(ago7d.getDate() - 6)
    const ago30d = new Date(now); ago30d.setDate(ago30d.getDate() - 30)
    const month = now.getMonth() + 1
    const year = now.getFullYear()

    const out: Record<string, unknown> = {}
    const jobs: Promise<void>[] = []

    // ── Employees ────────────────────────────────────────────────────────────
    if (has("employees.view")) {
        jobs.push((async () => {
            const [active, new30d] = await Promise.all([
                safe(prisma.employee.count({ where: { status: "ACTIVE" } }), 0),
                safe(prisma.employee.count({ where: { status: "ACTIVE", createdAt: { gte: ago30d } } }), 0),
            ])
            out.employees = { active, new30d }
        })())
    }

    // ── Attendance (today + 7-day trend) ─────────────────────────────────────
    if (has("attendance.view")) {
        jobs.push((async () => {
            const [todayRows, weekRows, activeCount] = await Promise.all([
                safe(prisma.attendance.findMany({
                    where: { date: { gte: todayStart, lt: todayEnd } },
                    select: { status: true },
                }), [] as { status: string }[]),
                safe(prisma.attendance.findMany({
                    where: { date: { gte: ago7d, lt: todayEnd }, status: { notIn: ["ABSENT"] } },
                    select: { date: true },
                }), [] as { date: Date }[]),
                safe(prisma.employee.count({ where: { status: "ACTIVE" } }), 0),
            ])
            const present = todayRows.filter(r => ["PRESENT", "HALF_DAY", "WFH", "LATE"].includes(r.status)).length
            const onLeave = todayRows.filter(r => ["LEAVE", "ON_LEAVE"].includes(r.status)).length
            const absentMarked = todayRows.filter(r => r.status === "ABSENT").length
            const absent = Math.max(absentMarked, activeCount > 0 ? activeCount - present - onLeave : 0)
            const denom = activeCount > 0 ? activeCount : present + absent + onLeave
            const pct = denom > 0 ? Math.round((present / denom) * 100) : 0

            const byDay = new Map<string, number>()
            for (let i = 0; i < 7; i++) {
                const d = new Date(ago7d); d.setDate(d.getDate() + i)
                byDay.set(d.toISOString().slice(0, 10), 0)
            }
            for (const r of weekRows) {
                const k = new Date(r.date).toISOString().slice(0, 10)
                if (byDay.has(k)) byDay.set(k, (byDay.get(k) || 0) + 1)
            }
            out.attendanceToday = { present, absent, onLeave, pct }
            out.attendanceTrend7d = Array.from(byDay.entries()).map(([day, count]) => ({ day, count }))
        })())
    }

    // ── Approvals (composed from what the user can act on) ───────────────────
    jobs.push((async () => {
        const [leaves, expenses, inspections] = await Promise.all([
            has("leaves.view") || has("leaves.approve")
                ? safe(prisma.leave.count({ where: { status: "PENDING" } }), 0) : Promise.resolve(-1),
            has("expenses.view") || has("expenses.manage")
                ? safe(prisma.expense.count({ where: { status: "SUBMITTED" } }), 0) : Promise.resolve(-1),
            has("approvals.view")
                ? safe(prisma.inspection.count({ where: { status: "pending" } }), 0) : Promise.resolve(-1),
        ])
        if (leaves >= 0 || expenses >= 0 || inspections >= 0) {
            out.approvals = {
                leaves: Math.max(0, leaves),
                expenses: Math.max(0, expenses),
                inspections: Math.max(0, inspections),
                total: Math.max(0, leaves) + Math.max(0, expenses) + Math.max(0, inspections),
                hasLeaves: leaves >= 0, hasExpenses: expenses >= 0, hasInspections: inspections >= 0,
            }
        }
    })())

    // ── Onboarding pipeline ──────────────────────────────────────────────────
    if (has("onboarding.view")) {
        jobs.push((async () => {
            const [inProgress, notStarted, onHold] = await Promise.all([
                safe(prisma.onboardingRecord.count({ where: { status: "IN_PROGRESS" } }), 0),
                safe(prisma.onboardingRecord.count({ where: { status: "NOT_STARTED" } }), 0),
                safe(prisma.onboardingRecord.count({ where: { status: "ON_HOLD" } }), 0),
            ])
            out.onboarding = { inProgress, notStarted, onHold }
        })())
    }

    // ── Exits ────────────────────────────────────────────────────────────────
    if (has("exit.view")) {
        jobs.push((async () => {
            const [pending, clearancePending] = await Promise.all([
                safe(prisma.exitRequest.count({ where: { status: { in: ["INITIATED", "NOTICE_PERIOD"] } } }), 0),
                safe(prisma.exitRequest.count({ where: { status: "CLEARANCE_PENDING" } }), 0),
            ])
            out.exits = { pending, clearancePending }
        })())
    }

    // ── Payroll (current month) ──────────────────────────────────────────────
    if (has("payroll.view")) {
        jobs.push((async () => {
            const [total, processed] = await Promise.all([
                safe(prisma.payroll.count({ where: { month, year } }), 0),
                safe(prisma.payroll.count({ where: { month, year, status: { in: ["PROCESSED", "PAID"] } } }), 0),
            ])
            out.payroll = {
                total, processed,
                pending: Math.max(0, total - processed),
                pct: total > 0 ? Math.round((processed / total) * 100) : 0,
            }
        })())
    }

    // ── Recruitment ──────────────────────────────────────────────────────────
    if (has("recruitment.view")) {
        jobs.push((async () => {
            const [newLeads30d, joined30d, activeLeads] = await Promise.all([
                safe(prisma.lead.count({ where: { createdAt: { gte: ago30d } } }), 0),
                safe(prisma.lead.count({ where: { status: { in: ["JOINED", "ON_SITE_JOINED"] } as any, updatedAt: { gte: ago30d } } }), 0),
                safe(prisma.lead.count({ where: { status: { notIn: ["JOINED", "ON_SITE_JOINED", "REJECTED", "NOT_INTERESTED"] } as any } }), 0),
            ])
            out.recruitment = { newLeads30d, joined30d, activeLeads }
        })())
    }

    // ── Projects / Sites / Assignments ───────────────────────────────────────
    if (has("projects.view")) {
        jobs.push((async () => {
            const rows = await safe(
                prisma.project.groupBy({ by: ["status"], _count: { _all: true } }) as Promise<{ status: string; _count: { _all: number } }[]>,
                [] as { status: string; _count: { _all: number } }[]
            )
            const map: Record<string, number> = {}
            for (const r of rows) map[r.status?.toUpperCase?.() || r.status] = r._count._all
            out.projectsByStatus = map
        })())
    }
    if (has("sites.view")) {
        jobs.push((async () => {
            out.activeSites = await safe(prisma.site.count({ where: { isActive: true } }), 0)
        })())
    }
    if (has("assignments.view")) {
        jobs.push((async () => {
            out.activeAssignments = await safe(prisma.assignment.count({ where: { status: "active" } }), 0)
        })())
    }

    // ── Helpdesk ─────────────────────────────────────────────────────────────
    if (has("helpdesk.view")) {
        jobs.push((async () => {
            out.openTickets = await safe(prisma.ticket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } as any } }), 0)
        })())
    }

    // ── Employee Logins (users.manage) ───────────────────────────────────────
    if (has("users.manage")) {
        jobs.push((async () => {
            const [totalEmployees, withLogin] = await Promise.all([
                safe(prisma.employee.count({
                    where: { status: { not: "ONBOARDING" }, NOT: { onboardingRecord: { is: { status: { not: "COMPLETED" } } } } },
                }), 0),
                safe(prisma.employee.count({
                    where: {
                        status: { not: "ONBOARDING" },
                        NOT: { onboardingRecord: { is: { status: { not: "COMPLETED" } } } },
                        userId: { not: null },
                    },
                }), 0),
            ])
            out.logins = { totalEmployees, withLogin, withoutLogin: Math.max(0, totalEmployees - withLogin) }
        })())
    }

    await Promise.all(jobs)
    return out
}
