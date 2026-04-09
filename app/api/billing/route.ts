import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { resolveUserId } from "@/lib/resolveUserId"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const isPrivileged = session.user.role === "ADMIN" || session.user.role === "MANAGER"
        if (!isPrivileged) return new NextResponse("Forbidden", { status: 403 })

        const { searchParams } = new URL(req.url)
        const status = searchParams.get("status")
        const month = searchParams.get("month")
        const year = searchParams.get("year")
        const search = searchParams.get("search")

        const where: Record<string, unknown> = {}

        // Don't filter by OVERDUE in DB — compute it at response time
        if (status && status !== "ALL" && status !== "OVERDUE") where.status = status
        if (month && month !== "ALL") where.billingMonth = parseInt(month)
        if (year && year !== "ALL") where.billingYear = parseInt(year)

        if (search) {
            where.OR = [
                { clientName: { contains: search, mode: "insensitive" } },
                { invoiceNo: { contains: search, mode: "insensitive" } },
            ]
        }

        const invoices = await prisma.invoice.findMany({
            where,
            orderBy: { createdAt: "desc" },
            include: {
                _count: { select: { items: true, payments: true } },
                payments: { select: { amount: true } },
            },
        })

        const now = new Date()

        const result = invoices.map(inv => {
            const paidAmount = inv.payments.reduce((s, p) => s + p.amount, 0)
            // Compute effective status: if past due and not PAID/CANCELLED → OVERDUE
            let effectiveStatus = inv.status as string
            if (
                inv.status !== "PAID" &&
                inv.status !== "CANCELLED" &&
                inv.status !== "DRAFT" &&
                new Date(inv.dueDate) < now
            ) {
                effectiveStatus = "OVERDUE"
            }
            return {
                ...inv,
                paidAmount,
                effectiveStatus,
            }
        })

        // If filtering by OVERDUE, filter post-compute
        const filtered = status === "OVERDUE"
            ? result.filter(i => i.effectiveStatus === "OVERDUE")
            : result

        return NextResponse.json(filtered)
    } catch (error) {
        console.error("[BILLING_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        // Resolve real DB user ID
        const actorId = await resolveUserId(session)
        if (!actorId) return NextResponse.json({ error: "User not found. Please log in again." }, { status: 403 })

        const isPrivileged = session.user.role === "ADMIN" || session.user.role === "MANAGER"
        if (!isPrivileged) return new NextResponse("Forbidden", { status: 403 })

        const body = await req.json()
        const {
            clientName,
            clientEmail,
            clientAddress,
            clientGST,
            companyId,
            billingMonth,
            billingYear,
            issueDate,
            dueDate,
            taxRate = 18,
            notes,
            items = [],
        } = body

        if (!clientName || !billingMonth || !billingYear || !dueDate) {
            return new NextResponse("clientName, billingMonth, billingYear, and dueDate are required", { status: 400 })
        }

        if (!items || items.length === 0) {
            return new NextResponse("At least one line item is required", { status: 400 })
        }

        // Generate invoice number: INV-YYYY-NNNN
        const yearStr = billingYear?.toString() ?? new Date().getFullYear().toString()
        const count = await prisma.invoice.count()
        const invoiceNo = `INV-${yearStr}-${String(count + 1).padStart(4, "0")}`

        // Calculate totals
        const subtotal = items.reduce((sum: number, item: { amount: number }) => sum + (item.amount || 0), 0)
        const taxAmount = subtotal * taxRate / 100
        const totalAmount = subtotal + taxAmount

        const invoice = await prisma.invoice.create({
            data: {
                invoiceNo,
                clientName,
                clientEmail: clientEmail || null,
                clientAddress: clientAddress || null,
                clientGST: clientGST || null,
                companyId: companyId || null,
                billingMonth: parseInt(billingMonth),
                billingYear: parseInt(billingYear),
                issueDate: issueDate ? new Date(issueDate) : new Date(),
                dueDate: new Date(dueDate),
                status: "DRAFT",
                subtotal,
                taxRate,
                taxAmount,
                totalAmount,
                paidAmount: 0,
                notes: notes || null,
                createdBy: actorId!,
                items: {
                    create: items.map((item: {
                        description: string
                        employeeCount: number
                        ratePerHead: number
                        days: number
                        amount: number
                    }) => ({
                        description: item.description,
                        employeeCount: item.employeeCount || 1,
                        ratePerHead: item.ratePerHead || 0,
                        days: item.days || 26,
                        amount: item.amount || 0,
                    })),
                },
            },
            include: { items: true, payments: true },
        })

        return NextResponse.json(invoice)
    } catch (error) {
        console.error("[BILLING_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
