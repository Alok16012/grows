import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { Prisma } from "@prisma/client"

// Key categories shown as columns in the dashboard summary table.
// All categories still contribute to each employee's total.
const COLS = [
    "TRAVEL", "TRANSPORTATION", "FUEL", "FOOD",
    "ACCOMMODATION", "SALARY_WAGES", "LABOUR", "CLIENT_PROJECT",
    "SAFETY_PPE", "REPAIR_MAINTENANCE", "MISCELLANEOUS",
] as const

/**
 * GET /api/expenses/team-summary?month=YYYY-MM
 *
 * Returns employee-wise expense breakdown for a given month.
 * One row per employee; columns = expense categories; last column = total.
 * Only submitted/approved/paid expenses are counted.
 */
export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "expenses.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const monthParam = searchParams.get("month") // "YYYY-MM"
        const now = new Date()
        const [y, m] = monthParam && /^\d{4}-\d{2}$/.test(monthParam)
            ? monthParam.split("-").map(Number)
            : [now.getFullYear(), now.getMonth() + 1]

        const monthStart = new Date(y, m - 1, 1)
        const monthEnd   = new Date(y, m, 0, 23, 59, 59, 999)

        // Fetch all non-draft/rejected expenses in the month
        let rawExpenses: any[]
        try {
            rawExpenses = await prisma.expense.findMany({
                where: {
                    date:   { gte: monthStart, lte: monthEnd },
                    status: { notIn: ["DRAFT", "REJECTED"] },
                },
                select: {
                    id: true, category: true, amount: true,
                    submittedBy: true, employeeId: true, status: true,
                },
            })
        } catch {
            // Pre-migration fallback: raw SQL with safe columns only
            rawExpenses = await (prisma as any).$queryRaw(
                Prisma.sql`SELECT id, category, amount, "submittedBy", "employeeId", status
                           FROM "Expense"
                           WHERE date >= ${monthStart} AND date <= ${monthEnd}
                           AND status NOT IN ('DRAFT','REJECTED')`
            )
        }

        // Fetch all active employees with their user ids
        const employees = await prisma.employee.findMany({
            where: { status: { not: "ONBOARDING" } },
            select: {
                id: true, firstName: true, lastName: true,
                employeeId: true, designation: true,
                department: { select: { name: true } },
                user: { select: { id: true } },
            },
            orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        })

        // Build userId → employee map
        const byUserId: Record<string, typeof employees[0]> = {}
        const byEmpId:  Record<string, typeof employees[0]> = {}
        for (const emp of employees) {
            if (emp.user?.id) byUserId[emp.user.id] = emp
            byEmpId[emp.id] = emp
        }

        // Aggregate per employee × category
        const totals: Record<string, Record<string, number>> = {}

        for (const exp of rawExpenses) {
            // Resolve employee: prefer explicit employeeId, fall back to submittedBy userId
            const emp = exp.employeeId
                ? byEmpId[exp.employeeId]
                : byUserId[exp.submittedBy]
            if (!emp) continue

            if (!totals[emp.id]) totals[emp.id] = {}
            const cat = exp.category as string
            totals[emp.id][cat] = (totals[emp.id][cat] ?? 0) + (exp.amount ?? 0)
        }

        // Build rows (only employees who have at least one expense)
        const rows = employees
            .filter(emp => totals[emp.id])
            .map(emp => {
                const t = totals[emp.id] || {}
                const total = Object.values(t).reduce((s, v) => s + v, 0)
                const row: Record<string, any> = {
                    id:          emp.id,
                    userId:      emp.user?.id ?? null,
                    name:        `${emp.firstName} ${emp.lastName}`,
                    employeeId:  emp.employeeId,
                    designation: emp.designation ?? "—",
                    department:  emp.department?.name ?? "—",
                    total,
                }
                for (const col of COLS) row[col] = t[col] ?? 0
                return row
            })
            .sort((a, b) => b.total - a.total) // highest spender first

        // Column totals row
        const colTotals: Record<string, number> = { total: 0 }
        for (const col of COLS) {
            colTotals[col] = rows.reduce((s, r) => s + (r[col] ?? 0), 0)
            colTotals.total += colTotals[col]
        }

        return NextResponse.json({
            month:     `${y}-${String(m).padStart(2, "0")}`,
            monthLabel: new Date(y, m - 1).toLocaleString("en-IN", { month: "long", year: "numeric" }),
            columns:   COLS,
            rows,
            totals:    colTotals,
        })
    } catch (error) {
        console.error("[TEAM_SUMMARY_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
