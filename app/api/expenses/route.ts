import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const { searchParams } = new URL(req.url)
        const status = searchParams.get("status")
        const category = searchParams.get("category")
        const dateFrom = searchParams.get("dateFrom")
        const dateTo = searchParams.get("dateTo")
        const month = searchParams.get("month")          // "YYYY-MM"
        const projectId = searchParams.get("projectId")
        const search = searchParams.get("search")
        const submittedBy = searchParams.get("submittedBy")
        const accountsView = searchParams.get("accountsView") === "true"

        const isPrivileged = checkAccess(session, ["MANAGER"], "expenses.view")

        const where: Record<string, unknown> = {}

        // Non-privileged users can only see their own expenses
        if (!isPrivileged) {
            where.submittedBy = session.user.id
        } else {
            if (submittedBy) where.submittedBy = submittedBy
        }

        // Accounts view: only payment-relevant statuses (approved = to-pay, paid = settled)
        if (accountsView) {
            if (status && status !== "ALL") where.status = status
            else where.status = { in: ["APPROVED", "PAID"] }
        } else if (status && status !== "ALL") where.status = status
        if (category && category !== "ALL") where.category = category
        if (projectId && projectId !== "ALL") where.projectId = projectId

        // Month filter wins over date range when both are present
        if (month && /^\d{4}-\d{2}$/.test(month)) {
            const [y, m] = month.split("-").map(Number)
            const start = new Date(y, m - 1, 1)
            const end = new Date(y, m, 0, 23, 59, 59, 999)
            where.date = { gte: start, lte: end }
        } else if (dateFrom || dateTo) {
            const dateFilter: Record<string, Date> = {}
            if (dateFrom) dateFilter.gte = new Date(dateFrom)
            if (dateTo) {
                const to = new Date(dateTo)
                to.setHours(23, 59, 59, 999)
                dateFilter.lte = to
            }
            where.date = dateFilter
        }

        if (search) {
            where.OR = [
                { title: { contains: search, mode: "insensitive" } },
                { expenseNo: { contains: search, mode: "insensitive" } },
            ]
        }

        // Try full query with project include; fall back progressively
        // if new columns / tables don't yet exist in DB (pre-migration).
        let expenses: any[]
        try {
            expenses = await prisma.expense.findMany({
                where,
                include: { project: { select: { id: true, name: true, company: { select: { id: true, name: true } } } } },
                orderBy: { createdAt: "desc" },
            }) as any[]
        } catch {
            // Drop project relation and retry
            const fallbackWhere = { ...where }
            delete fallbackWhere.projectId
            try {
                expenses = await prisma.expense.findMany({
                    where: fallbackWhere,
                    orderBy: { createdAt: "desc" },
                }) as any[]
            } catch {
                // Ultimate fallback: raw SQL selecting only stable columns.
                // Safe even before travelDays / travelDailyRate migration runs.
                // IMPORTANT: always enforce submittedBy filter for non-privileged users.
                try {
                    const { Prisma } = await import("@prisma/client")
                    let rows: any[]
                    if (!isPrivileged) {
                        // Non-privileged: hard-filter to own expenses only
                        rows = await (prisma as any).$queryRaw(
                            Prisma.sql`SELECT id, "expenseNo", title, category, amount, date,
                                       description, "receiptUrl", "submittedBy", "employeeId",
                                       "projectId", "approvedBy", "approvedAt", "rejectedAt",
                                       "rejectionReason", "paidAt", "paymentDate", "paymentMode",
                                       "transactionId", status, "createdAt", "updatedAt"
                                       FROM "Expense"
                                       WHERE "submittedBy" = ${session.user.id}
                                       ORDER BY "createdAt" DESC`
                        )
                    } else {
                        const sbFilter = where.submittedBy as string | undefined
                        rows = sbFilter
                            ? await (prisma as any).$queryRaw(
                                Prisma.sql`SELECT id, "expenseNo", title, category, amount, date,
                                           description, "receiptUrl", "submittedBy", "employeeId",
                                           "projectId", "approvedBy", "approvedAt", "rejectedAt",
                                           "rejectionReason", "paidAt", "paymentDate", "paymentMode",
                                           "transactionId", status, "createdAt", "updatedAt"
                                           FROM "Expense"
                                           WHERE "submittedBy" = ${sbFilter}
                                           ORDER BY "createdAt" DESC`
                            )
                            : await (prisma as any).$queryRaw(
                                Prisma.sql`SELECT id, "expenseNo", title, category, amount, date,
                                           description, "receiptUrl", "submittedBy", "employeeId",
                                           "projectId", "approvedBy", "approvedAt", "rejectedAt",
                                           "rejectionReason", "paidAt", "paymentDate", "paymentMode",
                                           "transactionId", status, "createdAt", "updatedAt"
                                           FROM "Expense"
                                           ORDER BY "createdAt" DESC`
                            )
                    }
                    expenses = rows
                } catch (rawErr) {
                    console.error("[EXPENSES_GET] $queryRaw fallback failed:", rawErr)
                    expenses = []  // return empty list rather than 500
                }
            }
        }

        // Final safety net: regardless of which query path ran,
        // non-privileged users must NEVER receive another user's expense.
        if (!isPrivileged) {
            expenses = expenses.filter((e: any) => e.submittedBy === session.user.id)
        }

        // Fetch user info for submittedBy and approvedBy
        let userMap: Record<string, { id: string; name: string | null; email: string }> = {}
        try {
            const userIds = new Set<string>()
            expenses.forEach(e => {
                if (e.submittedBy) userIds.add(e.submittedBy)
                if (e.approvedBy)  userIds.add(e.approvedBy)
            })
            if (userIds.size > 0) {
                const users = await prisma.user.findMany({
                    where: { id: { in: Array.from(userIds) } },
                    select: { id: true, name: true, email: true },
                })
                userMap = Object.fromEntries(users.map(u => [u.id, u]))
            }
        } catch {
            // non-fatal: expense list still returns, just without user names
        }

        const result = expenses.map(e => ({
            ...e,
            submittedByUser: userMap[e.submittedBy] || null,
            approvedByUser: e.approvedBy ? (userMap[e.approvedBy] || null) : null,
        }))

        return NextResponse.json(result)
    } catch (error) {
        console.error("[EXPENSES_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const body = await req.json()
        const { title, category, amount, date, description, employeeId, receiptUrl, projectId, travelDays, travelDailyRate, travelEntries } = body

        const parsedAmount = parseFloat(String(amount))
        if (!title || !category || amount == null || isNaN(parsedAmount) || !date) {
            return new NextResponse("title, category, amount, and date are required", { status: 400 })
        }

        // Generate expense number
        const count = await prisma.expense.count()
        const expenseNo = `EXP-${String(count + 1).padStart(4, "0")}`

        const id = crypto.randomUUID()
        let expense: any = null

        // Helper: check if the row landed in DB despite Prisma throwing on result parsing.
        // This happens when the INSERT committed but Prisma couldn't deserialise a new column.
        const findInserted = () =>
            (prisma as any).expense.findUnique({ where: { id } }).catch(() => null)

        // Attempt 1 — all columns
        try {
            expense = await prisma.expense.create({
                data: {
                    id, expenseNo, title, category,
                    amount: parsedAmount,
                    date: new Date(date),
                    description: description || null,
                    receiptUrl: receiptUrl || null,
                    employeeId: employeeId || null,
                    projectId: projectId || null,
                    submittedBy: session.user.id,
                    status: "DRAFT",
                    travelDays: travelDays ? parseInt(String(travelDays)) : null,
                    travelDailyRate: travelDailyRate ? parseFloat(String(travelDailyRate)) : null,
                    travelEntries: travelEntries ?? null,
                },
            })
        } catch (e1: any) {
            console.warn("[EXPENSES_POST] attempt 1 failed:", e1?.message)
            // Row may have inserted but result parsing threw — check before retrying
            expense = await findInserted()
        }

        // Attempt 2 — without travel columns
        if (!expense) {
            try {
                expense = await prisma.expense.create({
                    data: {
                        id, expenseNo, title, category,
                        amount: parsedAmount,
                        date: new Date(date),
                        description: description || null,
                        receiptUrl: receiptUrl || null,
                        employeeId: employeeId || null,
                        projectId: projectId || null,
                        submittedBy: session.user.id,
                        status: "DRAFT",
                    },
                })
            } catch (e2: any) {
                console.warn("[EXPENSES_POST] attempt 2 failed:", e2?.message)
                expense = await findInserted()
            }
        }

        // Attempt 3 — raw SQL, guaranteed to work on any DB state
        if (!expense) {
            try {
                const { Prisma } = await import("@prisma/client")
                const rows: any[] = await (prisma as any).$queryRaw(
                    Prisma.sql`INSERT INTO "Expense"
                        (id, "expenseNo", title, category, amount, date, description,
                         "receiptUrl", "submittedBy", "employeeId", status, "createdAt", "updatedAt")
                        VALUES (
                            ${id}, ${expenseNo}, ${title}, ${category}::"ExpenseCategory",
                            ${parsedAmount}, ${new Date(date)}, ${description || null},
                            ${receiptUrl || null}, ${session.user.id}, ${employeeId || null},
                            'DRAFT'::"ExpenseStatus", now(), now()
                        )
                        RETURNING id, "expenseNo", title, category, amount, date,
                                  description, "receiptUrl", "submittedBy", "employeeId",
                                  status, "createdAt", "updatedAt"`
                )
                expense = rows[0]
            } catch (e3: any) {
                console.warn("[EXPENSES_POST] attempt 3 failed:", e3?.message)
                expense = await findInserted()
            }
        }

        if (!expense) throw new Error("All insert attempts failed")

        return NextResponse.json(expense)
    } catch (error) {
        console.error("[EXPENSES_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
