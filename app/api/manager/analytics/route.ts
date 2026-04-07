import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== Role.ADMIN && session.user.role !== Role.MANAGER)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    // Today boundaries
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

    // Last 14 days for attendance trend
    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13)
    fourteenDaysAgo.setHours(0, 0, 0, 0)

    // Six months ago for inspection trend
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const [
        // HR
        totalEmployees,
        activeEmployees,
        onLeave,
        newJoining,
        exited,

        // Attendance
        presentToday,
        absentToday,
        lateToday,
        monthlyAttendance,
        attendanceTrend,

        // Leave
        pendingLeaves,
        approvedLeavesThisMonth,
        leaveByType,

        // Payroll
        payrollData,

        // Billing
        invoicesThisMonth,
        overdueInvoices,

        // Expenses
        pendingExpenses,
        approvedExpensesThisMonth,

        // Recruitment
        allLeads,
        selectedLeads,
        rejectedLeads,
        leadsByStatus,

        // Onboarding
        onboardingInProgress,
        onboardingCompleted,
        onboardingNotStarted,

        // Exit
        activeExits,
        fnfPending,
        completedExits,

        // Sites
        totalSites,
        activeSites,
        allSites,
        totalDeployed,

        // Helpdesk
        openTickets,
        resolvedThisMonth,
        urgentOpen,

        // Inspection data (existing)
        inspectorUsers,
        recentInspections,
    ] = await Promise.all([
        // HR Overview
        prisma.employee.count(),
        prisma.employee.count({ where: { status: "ACTIVE" } }),
        prisma.employee.count({ where: { status: "ON_LEAVE" } }),
        prisma.employee.count({ where: { dateOfJoining: { gte: monthStart, lte: monthEnd } } }),
        prisma.employee.count({ where: { dateOfLeaving: { gte: monthStart, lte: monthEnd } } }),

        // Attendance - today
        prisma.attendance.count({ where: { date: { gte: todayStart, lte: todayEnd }, status: "PRESENT" } }),
        prisma.attendance.count({ where: { date: { gte: todayStart, lte: todayEnd }, status: "ABSENT" } }),
        prisma.attendance.count({ where: { date: { gte: todayStart, lte: todayEnd }, status: "LATE" } }),
        // Monthly attendance for avg %
        prisma.attendance.groupBy({
            by: ["status"],
            where: { date: { gte: monthStart, lte: monthEnd } },
            _count: { _all: true }
        }),
        // Attendance trend last 14 days
        prisma.attendance.findMany({
            where: { date: { gte: fourteenDaysAgo, lte: todayEnd } },
            select: { date: true, status: true },
            orderBy: { date: "asc" },
        }),

        // Leave
        prisma.leave.count({ where: { status: "PENDING" } }),
        prisma.leave.count({ where: { status: "APPROVED", approvedAt: { gte: monthStart, lte: monthEnd } } }),
        prisma.leave.groupBy({
            by: ["type"],
            where: { createdAt: { gte: monthStart, lte: monthEnd } },
            _count: { _all: true }
        }),

        // Payroll - current or last month processed
        prisma.payroll.findMany({
            where: {
                OR: [
                    { month: now.getMonth() + 1, year: now.getFullYear() },
                    { month: now.getMonth() === 0 ? 12 : now.getMonth(), year: now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear() },
                ]
            },
            select: {
                grossSalary: true,
                netSalary: true,
                pfEmployer: true,
                pfEmployee: true,
                status: true,
            }
        }),

        // Billing - this month
        prisma.invoice.findMany({
            where: {
                billingMonth: now.getMonth() + 1,
                billingYear: now.getFullYear(),
            },
            select: { totalAmount: true, paidAmount: true, status: true }
        }),
        prisma.invoice.count({ where: { status: "OVERDUE" } }),

        // Expenses
        prisma.expense.count({ where: { status: "SUBMITTED" } }),
        prisma.expense.aggregate({
            where: { status: "APPROVED", approvedAt: { gte: monthStart, lte: monthEnd } },
            _sum: { amount: true }
        }),

        // Recruitment
        prisma.lead.count(),
        prisma.lead.count({
            where: {
                status: "SELECTED",
                updatedAt: { gte: monthStart, lte: monthEnd }
            }
        }),
        prisma.lead.count({
            where: {
                status: "REJECTED",
                updatedAt: { gte: monthStart, lte: monthEnd }
            }
        }),
        prisma.lead.groupBy({
            by: ["status"],
            _count: { _all: true }
        }),

        // Onboarding
        prisma.onboardingRecord.count({ where: { status: "IN_PROGRESS" } }),
        prisma.onboardingRecord.count({ where: { status: "COMPLETED", completedAt: { gte: monthStart, lte: monthEnd } } }),
        prisma.onboardingRecord.count({ where: { status: "NOT_STARTED" } }),

        // Exit
        prisma.exitRequest.count({ where: { status: { notIn: ["COMPLETED", "CANCELLED"] } } }),
        prisma.exitRequest.count({ where: { status: "FULL_FINAL_PENDING" } }),
        prisma.exitRequest.count({ where: { status: "COMPLETED", completedAt: { gte: monthStart, lte: monthEnd } } }),

        // Sites
        prisma.site.count(),
        prisma.site.count({ where: { isActive: true } }),
        prisma.site.findMany({
            where: { isActive: true },
            select: {
                manpowerRequired: true,
                deployments: {
                    where: { isActive: true },
                    select: { id: true }
                }
            }
        }),
        prisma.deployment.count({ where: { isActive: true } }),

        // Helpdesk
        prisma.ticket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
        prisma.ticket.count({ where: { status: { in: ["RESOLVED", "CLOSED"] }, resolvedAt: { gte: monthStart, lte: monthEnd } } }),
        prisma.ticket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, priority: "URGENT" } }),

        // Inspection data (existing)
        prisma.user.findMany({
            where: { role: Role.INSPECTION_BOY, isActive: true },
            select: {
                id: true,
                name: true,
                email: true,
                inspections: {
                    select: {
                        id: true,
                        status: true,
                        submittedAt: true,
                        approvedAt: true,
                        createdAt: true,
                        sentBackCount: true,
                        startedAt: true,
                        assignment: {
                            select: {
                                project: {
                                    select: { name: true, company: { select: { name: true } } }
                                }
                            }
                        }
                    }
                }
            }
        }),
        prisma.inspection.findMany({
            where: { submittedAt: { gte: sixMonthsAgo } },
            select: { submittedAt: true, status: true }
        }),
    ])

    // ─── Process Attendance Trend ──────────────────────────────────────────────
    const trendMap: Record<string, { present: number; absent: number }> = {}
    for (let i = 0; i < 14; i++) {
        const d = new Date(fourteenDaysAgo)
        d.setDate(d.getDate() + i)
        const key = d.toISOString().split("T")[0]
        trendMap[key] = { present: 0, absent: 0 }
    }
    attendanceTrend.forEach(a => {
        const key = new Date(a.date).toISOString().split("T")[0]
        if (!trendMap[key]) return
        if (a.status === "PRESENT" || a.status === "LATE") trendMap[key].present++
        else if (a.status === "ABSENT") trendMap[key].absent++
    })
    const monthlyTrendAttendance = Object.entries(trendMap).map(([date, v]) => ({
        date: date.slice(5), // MM-DD
        present: v.present,
        absent: v.absent,
    }))

    // Avg attendance % this month
    const monthlyTotal = monthlyAttendance.reduce((s, g) => s + g._count._all, 0)
    const monthlyPresent = monthlyAttendance
        .filter(g => g.status === "PRESENT" || g.status === "LATE")
        .reduce((s, g) => s + g._count._all, 0)
    const avgAttendancePercent = monthlyTotal > 0 ? parseFloat(((monthlyPresent / monthlyTotal) * 100).toFixed(1)) : 0

    // ─── Process Payroll ──────────────────────────────────────────────────────
    const processedPayroll = payrollData.filter(p => p.status !== "DRAFT")
    const pendingPayroll = payrollData.filter(p => p.status === "DRAFT")
    const totalGross = processedPayroll.reduce((s, p) => s + p.grossSalary, 0)
    const totalNet = processedPayroll.reduce((s, p) => s + p.netSalary, 0)
    const totalPFLiability = processedPayroll.reduce((s, p) => s + (p.pfEmployer + p.pfEmployee), 0)

    // ─── Process Billing ──────────────────────────────────────────────────────
    const invoicedThisMonth = invoicesThisMonth.reduce((s, i) => s + i.totalAmount, 0)
    const collectedThisMonth = invoicesThisMonth.reduce((s, i) => s + i.paidAmount, 0)
    const outstanding = invoicesThisMonth.reduce((s, i) => s + Math.max(0, i.totalAmount - i.paidAmount), 0)

    // ─── Process Sites ────────────────────────────────────────────────────────
    const understaffed = allSites.filter(s => s.deployments.length < s.manpowerRequired).length

    // ─── Process Recruitment ─────────────────────────────────────────────────
    const activeLeadStatuses = ["APPLIED", "SCREENING", "INTERVIEW_SCHEDULED", "INTERVIEW_DONE"]
    const activeLeads = leadsByStatus
        .filter(l => activeLeadStatuses.includes(l.status))
        .reduce((s, l) => s + l._count._all, 0)

    // ─── Inspector Analytics (existing logic) ────────────────────────────────
    const inspectorAnalytics = inspectorUsers.map(inspector => {
        const inspections = inspector.inspections
        const total = inspections.length
        const approved = inspections.filter(i => i.status === "approved").length
        const rejected = inspections.filter(i => i.status === "rejected").length
        const pending = inspections.filter(i => i.status === "pending").length
        const draft = inspections.filter(i => i.status === "draft").length
        const avgSentBack = total > 0
            ? inspections.reduce((sum, i) => sum + (i.sentBackCount || 0), 0) / total
            : 0
        const completedWithTimes = inspections.filter(i => i.submittedAt && i.approvedAt)
        const avgTurnaround = completedWithTimes.length > 0
            ? completedWithTimes.reduce((sum, i) => {
                const diff = new Date(i.approvedAt!).getTime() - new Date(i.submittedAt!).getTime()
                return sum + diff / (1000 * 60 * 60)
            }, 0) / completedWithTimes.length
            : 0
        const acceptanceRate = total > 0 ? (approved / total) * 100 : 0
        return {
            id: inspector.id,
            name: inspector.name,
            email: inspector.email,
            total,
            approved,
            rejected,
            pending,
            draft,
            acceptanceRate: parseFloat(acceptanceRate.toFixed(1)),
            avgSentBack: parseFloat(avgSentBack.toFixed(2)),
            avgTurnaroundHours: parseFloat(avgTurnaround.toFixed(1)),
            recentInspections: inspections
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, 3)
                .map(i => ({
                    status: i.status,
                    project: i.assignment?.project?.name || "—",
                    company: i.assignment?.project?.company?.name || "—",
                    date: i.submittedAt || i.createdAt
                }))
        }
    })
    inspectorAnalytics.sort((a, b) => b.acceptanceRate - a.acceptanceRate)

    // Monthly inspection trend (existing logic)
    const monthlyMap: Record<string, { submitted: number; approved: number }> = {}
    recentInspections.forEach(i => {
        if (!i.submittedAt) return
        const key = `${new Date(i.submittedAt).getFullYear()}-${String(new Date(i.submittedAt).getMonth() + 1).padStart(2, "0")}`
        if (!monthlyMap[key]) monthlyMap[key] = { submitted: 0, approved: 0 }
        monthlyMap[key].submitted++
        if (i.status === "approved") monthlyMap[key].approved++
    })
    const monthlyInspectionTrend = Object.entries(monthlyMap)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, counts]) => ({
            month,
            submitted: counts.submitted,
            approved: counts.approved,
            rate: counts.submitted > 0 ? parseFloat(((counts.approved / counts.submitted) * 100).toFixed(1)) : 0
        }))

    return NextResponse.json({
        hr: {
            totalEmployees,
            activeEmployees,
            onLeave,
            newJoiningThisMonth: newJoining,
            exitedThisMonth: exited,
        },
        attendance: {
            avgAttendancePercent,
            presentToday,
            absentToday,
            lateToday,
            monthlyTrend: monthlyTrendAttendance,
        },
        leave: {
            pendingRequests: pendingLeaves,
            approvedThisMonth: approvedLeavesThisMonth,
            byType: leaveByType.map(l => ({ type: l.type, count: l._count._all })),
        },
        payroll: {
            totalGross: parseFloat(totalGross.toFixed(2)),
            totalNet: parseFloat(totalNet.toFixed(2)),
            totalPFLiability: parseFloat(totalPFLiability.toFixed(2)),
            processedCount: processedPayroll.length,
            pendingCount: pendingPayroll.length,
        },
        billing: {
            invoicedThisMonth: parseFloat(invoicedThisMonth.toFixed(2)),
            collectedThisMonth: parseFloat(collectedThisMonth.toFixed(2)),
            outstanding: parseFloat(outstanding.toFixed(2)),
            overdueCount: overdueInvoices,
        },
        expenses: {
            pendingApprovals: pendingExpenses,
            approvedThisMonth: parseFloat((approvedExpensesThisMonth._sum.amount || 0).toFixed(2)),
        },
        recruitment: {
            totalLeads: allLeads,
            activeLeads,
            selectedThisMonth: selectedLeads,
            rejectedThisMonth: rejectedLeads,
            byStatus: leadsByStatus.map(l => ({ status: l.status, count: l._count._all })),
        },
        onboarding: {
            inProgress: onboardingInProgress,
            completedThisMonth: onboardingCompleted,
            notStarted: onboardingNotStarted,
        },
        exit: {
            activeExits,
            fnfPending,
            completedThisMonth: completedExits,
        },
        sites: {
            totalSites,
            activeSites,
            understaffed,
            totalDeployed,
        },
        helpdesk: {
            openTickets,
            resolvedThisMonth,
            urgentOpen,
        },
        // Existing inspection data
        inspectors: inspectorAnalytics,
        monthlyTrend: monthlyInspectionTrend,
    })
}
