import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function POST(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const isPrivileged = session.user.role === "ADMIN" || session.user.role === "MANAGER"
        if (!isPrivileged) return new NextResponse("Forbidden", { status: 403 })

        const invoice = await prisma.invoice.findUnique({
            where: { id: params.id },
            include: { payments: true },
        })
        if (!invoice) return new NextResponse("Not Found", { status: 404 })

        if (invoice.status === "CANCELLED") {
            return new NextResponse("Cannot record payment for a cancelled invoice", { status: 400 })
        }

        const body = await req.json()
        const { amount, paymentDate, paymentMode, referenceNo, remarks } = body

        if (!amount || !paymentDate || !paymentMode) {
            return new NextResponse("amount, paymentDate, and paymentMode are required", { status: 400 })
        }

        const paymentAmount = parseFloat(amount)
        if (isNaN(paymentAmount) || paymentAmount <= 0) {
            return new NextResponse("amount must be a positive number", { status: 400 })
        }

        // Create payment record
        const payment = await prisma.payment.create({
            data: {
                invoiceId: params.id,
                amount: paymentAmount,
                paymentDate: new Date(paymentDate),
                paymentMode,
                referenceNo: referenceNo || null,
                remarks: remarks || null,
                recordedBy: session.user.id,
            },
        })

        // Recalculate paidAmount from all payments
        const allPayments = await prisma.payment.findMany({ where: { invoiceId: params.id } })
        const newPaidAmount = allPayments.reduce((s, p) => s + p.amount, 0)

        // Determine new status
        let newStatus: "PARTIALLY_PAID" | "PAID" = "PARTIALLY_PAID"
        if (newPaidAmount >= invoice.totalAmount) {
            newStatus = "PAID"
        }

        const updatedInvoice = await prisma.invoice.update({
            where: { id: params.id },
            data: {
                paidAmount: newPaidAmount,
                status: newStatus,
            },
            include: {
                items: true,
                payments: { orderBy: { paymentDate: "desc" } },
            },
        })

        return NextResponse.json({ payment, invoice: updatedInvoice })
    } catch (error) {
        console.error("[BILLING_PAYMENT_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
