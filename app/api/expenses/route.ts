import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const { searchParams } = new URL(req.url)
        const status = searchParams.get("status")
        const category = searchParams.get("category")
        const dateFrom = searchParams.get("dateFrom")
        const dateTo = searchParams.get("dateTo")
        const search = searchParams.get("search")
        const submittedBy = searchParams.get("submittedBy")

        const isPrivileged = session.user.role === "ADMIN" || session.user.role === "MANAGER"

        const where: Record<string, unknown> = {}

        // Non-privileged users can only see their own expenses
        if (!isPrivileged) {
            where.submittedBy = session.user.id
        } else {
            if (submittedBy) where.submittedBy = submittedBy
        }

        if (status && status !== "ALL") where.status = status
        if (category && category !== "ALL") where.category = category

        if (dateFrom || dateTo) {
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

        const expenses = await prisma.expense.findMany({
            where,
            orderBy: { createdAt: "desc" },
        })

        // Fetch user info for submittedBy and approvedBy
        const userIds = new Set<string>()
        expenses.forEach(e => {
            userIds.add(e.submittedBy)
            if (e.approvedBy) userIds.add(e.approvedBy)
        })

        const users = await prisma.user.findMany({
            where: { id: { in: Array.from(userIds) } },
            select: { id: true, name: true, email: true },
        })
        const userMap = Object.fromEntries(users.map(u => [u.id, u]))

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
        const { title, category, amount, date, description, employeeId } = body

        if (!title || !category || !amount || !date) {
            return new NextResponse("title, category, amount, and date are required", { status: 400 })
        }

        // Generate expense number
        const count = await prisma.expense.count()
        const expenseNo = `EXP-${String(count + 1).padStart(4, "0")}`

        const expense = await prisma.expense.create({
            data: {
                expenseNo,
                title,
                category,
                amount: parseFloat(amount),
                date: new Date(date),
                description: description || null,
                employeeId: employeeId || null,
                submittedBy: session.user.id,
                status: "DRAFT",
            },
        })

        return NextResponse.json(expense)
    } catch (error) {
        console.error("[EXPENSES_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
