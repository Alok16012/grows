import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { Prisma } from "@prisma/client"

// Prod DB sometimes lags behind migrations (DIRECT_URL not set on Vercel, so
// `prisma migrate deploy` is skipped). Reading a row via the Prisma client
// selects every scalar column, which throws P2022 when a column is missing.
// Fall back to a raw `SELECT *`, which only returns columns that actually
// exist and never fails on schema drift.
async function findExpenseSafe(id: string): Promise<any | null> {
    try {
        return await prisma.expense.findUnique({ where: { id } })
    } catch (err: any) {
        const msg = String(err?.message || "").toLowerCase()
        if (!(msg.includes("does not exist") || err?.code === "P2022")) throw err
        const rows = await (prisma as any).$queryRaw(
            Prisma.sql`SELECT * FROM "Expense" WHERE id = ${id} LIMIT 1`
        )
        return rows?.[0] ?? null
    }
}

// Map an updateData object to a raw, parameterised UPDATE. The Prisma client's
// update() does `UPDATE ... RETURNING *`, which selects every scalar column and
// fails with P2022 when prod is missing a migrated column — and on a pooled
// connection a failed write can leave a lock that makes the retry hang (the
// observed FUNCTION_INVOCATION_TIMEOUT). A single raw UPDATE only touches the
// columns we set and returns nothing, so it survives schema drift cleanly.
//
// Enum/JSON columns need explicit casts since values are bound as text params.
const COLUMN_CASTS: Record<string, string> = {
    status: '"ExpenseStatus"',
    category: '"ExpenseCategory"',
}
async function rawUpdateExpense(id: string, data: Record<string, unknown>): Promise<void> {
    const assignments = Object.entries(data).map(([col, val]) => {
        const colSql = Prisma.raw(`"${col}"`)
        if (col === "travelEntries") {
            return val == null
                ? Prisma.sql`${colSql} = ${null}`
                : Prisma.sql`${colSql} = ${JSON.stringify(val)}::jsonb`
        }
        const cast = COLUMN_CASTS[col]
        return cast
            ? Prisma.sql`${colSql} = ${val as any}::${Prisma.raw(cast)}`
            : Prisma.sql`${colSql} = ${val as any}`
    })
    if (assignments.length === 0) return
    await (prisma as any).$executeRaw(
        Prisma.sql`UPDATE "Expense" SET ${Prisma.join(assignments)} WHERE id = ${id}`
    )
}

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const expense = await findExpenseSafe(params.id)
        if (!expense) return new NextResponse("Not Found", { status: 404 })

        const isPrivileged = checkAccess(session, ["MANAGER"], "expenses.view")
        if (!isPrivileged && expense.submittedBy !== session.user.id) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const userIds = new Set<string>()
        userIds.add(expense.submittedBy)
        if (expense.approvedBy) userIds.add(expense.approvedBy)

        const users = await prisma.user.findMany({
            where: { id: { in: Array.from(userIds) } },
            select: { id: true, name: true, email: true },
        })
        const userMap = Object.fromEntries(users.map(u => [u.id, u]))

        return NextResponse.json({
            ...expense,
            submittedByUser: userMap[expense.submittedBy] || null,
            approvedByUser: expense.approvedBy ? (userMap[expense.approvedBy] || null) : null,
        })
    } catch (error) {
        console.error("[EXPENSE_GET_ONE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function PUT(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const expense = await findExpenseSafe(params.id)
        if (!expense) return new NextResponse("Not Found", { status: 404 })

        const isPrivileged = checkAccess(session, ["MANAGER"], "expenses.manage")
        const isOwner = expense.submittedBy === session.user.id

        if (!isPrivileged && !isOwner) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { action, title, category, amount, date, description, receiptUrl, projectId, rejectionReason, paymentMode, transactionId, paymentDate, travelDays, travelDailyRate, travelEntries } = body

        const updateData: Record<string, unknown> = {}

        if (isOwner && (expense.status === "DRAFT" || expense.status === "SUBMITTED")) {
            // Owner can edit fields while the expense is still DRAFT or SUBMITTED
            // (i.e. before a manager approves/rejects it).
            if (title !== undefined) updateData.title = title
            if (category !== undefined) updateData.category = category
            if (amount !== undefined) updateData.amount = parseFloat(String(amount))
            if (date !== undefined) updateData.date = new Date(date)
            if (description !== undefined) updateData.description = description || null
            if (receiptUrl !== undefined) updateData.receiptUrl = receiptUrl || null
            if (projectId !== undefined) updateData.projectId = projectId || null
            if (travelDays !== undefined) updateData.travelDays = travelDays ? parseInt(String(travelDays)) : null
            if (travelDailyRate !== undefined) updateData.travelDailyRate = travelDailyRate ? parseFloat(String(travelDailyRate)) : null
            if (travelEntries !== undefined) updateData.travelEntries = travelEntries ?? null
        }

        // Action-based transitions
        if (action === "SUBMIT") {
            // Owner submits DRAFT → SUBMITTED
            if (!isOwner) return new NextResponse("Only the owner can submit", { status: 403 })
            if (expense.status !== "DRAFT") return new NextResponse("Only DRAFT can be submitted", { status: 400 })
            updateData.status = "SUBMITTED"
        } else if (action === "APPROVE") {
            // Admin/Manager approves SUBMITTED → APPROVED
            if (!isPrivileged) return new NextResponse("Forbidden", { status: 403 })
            if (expense.status !== "SUBMITTED") return new NextResponse("Only SUBMITTED can be approved", { status: 400 })
            updateData.status = "APPROVED"
            updateData.approvedBy = session.user.id
            updateData.approvedAt = new Date()
        } else if (action === "REJECT") {
            // Admin/Manager rejects SUBMITTED → REJECTED
            if (!isPrivileged) return new NextResponse("Forbidden", { status: 403 })
            if (expense.status !== "SUBMITTED") return new NextResponse("Only SUBMITTED can be rejected", { status: 400 })
            if (!rejectionReason) return new NextResponse("rejectionReason is required", { status: 400 })
            updateData.status = "REJECTED"
            updateData.rejectionReason = rejectionReason
            updateData.rejectedAt = new Date()
        } else if (action === "PAID") {
            // Admin/Manager marks APPROVED → PAID
            if (!isPrivileged) return new NextResponse("Forbidden", { status: 403 })
            if (expense.status !== "APPROVED") return new NextResponse("Only APPROVED can be marked paid", { status: 400 })
            if (!paymentMode) return new NextResponse("paymentMode is required", { status: 400 })
            updateData.status = "PAID"
            updateData.paidAt = new Date()
            updateData.paymentMode = paymentMode
            updateData.transactionId = transactionId || null
            updateData.paymentDate = paymentDate ? new Date(paymentDate) : new Date()
        }

        if (Object.keys(updateData).length === 0) {
            return new NextResponse("No valid updates", { status: 400 })
        }

        // Primary path: the Prisma client, which casts enums (status/category)
        // and other column types correctly. The schema is now synced in prod, so
        // this just works. Only if a column is genuinely missing (schema drift on
        // some other environment) do we fall back to a raw UPDATE + safe re-read.
        let updated: any
        try {
            updated = await prisma.expense.update({ where: { id: params.id }, data: updateData })
        } catch (err: any) {
            const msg = String(err?.message || "").toLowerCase()
            const missingColumn = msg.includes("does not exist") || err?.code === "P2022"
            if (!missingColumn) throw err
            await rawUpdateExpense(params.id, updateData)
            updated = await findExpenseSafe(params.id)
        }

        // ── Fire in-app notifications ──
        try {
            const expTitle = expense.title
            const expNo = expense.expenseNo
            const actorName = session.user.name || "Someone"

            if (action === "SUBMIT") {
                // Notify admins/managers that a new expense needs approval
                const managers = await prisma.user.findMany({
                    where: { role: { in: ["ADMIN", "MANAGER"] }, isActive: true },
                    select: { id: true },
                })
                await prisma.notification.createMany({
                    data: managers.map(m => ({
                        userId: m.id,
                        title: "Expense Submitted",
                        message: `${actorName} submitted ${expNo} — ${expTitle}`,
                        type: "expense",
                        link: "/expenses",
                    })),
                })
            } else if (action === "APPROVE") {
                await prisma.notification.create({
                    data: {
                        userId: expense.submittedBy,
                        title: "Expense Approved ✓",
                        message: `Your expense ${expNo} (${expTitle}) has been approved`,
                        type: "expense",
                        link: "/expenses",
                    },
                })
            } else if (action === "REJECT") {
                await prisma.notification.create({
                    data: {
                        userId: expense.submittedBy,
                        title: "Expense Rejected ✗",
                        message: `Your expense ${expNo} (${expTitle}) was rejected: ${rejectionReason}`,
                        type: "expense",
                        link: "/expenses",
                    },
                })
            } else if (action === "PAID") {
                await prisma.notification.create({
                    data: {
                        userId: expense.submittedBy,
                        title: "Payment Completed 💰",
                        message: `Your expense ${expNo} (${expTitle}) has been paid via ${paymentMode}`,
                        type: "expense",
                        link: "/expenses",
                    },
                })
            }
        } catch (notifErr) {
            console.error("[EXPENSE_NOTIF]", notifErr)
        }

        return NextResponse.json(updated)
    } catch (error: any) {
        console.error("[EXPENSE_PUT]", error)
        // Internal admin app — surface the real reason so the client can show it.
        const detail = error?.code ? `${error.code} ${error?.message ?? ""}`.trim() : (error?.message ?? "Internal Error")
        return new NextResponse(detail, { status: 500 })
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const expense = await prisma.expense.findUnique({ where: { id: params.id } })
        if (!expense) return new NextResponse("Not Found", { status: 404 })

        // Only the owner can delete, and only DRAFT status
        if (expense.submittedBy !== session.user.id) {
            return new NextResponse("Forbidden", { status: 403 })
        }
        if (expense.status !== "DRAFT") {
            return new NextResponse("Only DRAFT expenses can be deleted", { status: 400 })
        }

        await prisma.expense.delete({ where: { id: params.id } })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[EXPENSE_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
