import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(
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
            include: {
                items: true,
                payments: { orderBy: { paymentDate: "desc" } },
            },
        })

        if (!invoice) return new NextResponse("Not Found", { status: 404 })

        return NextResponse.json(invoice)
    } catch (error) {
        console.error("[BILLING_GET_ID]", error)
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

        const isPrivileged = session.user.role === "ADMIN" || session.user.role === "MANAGER"
        if (!isPrivileged) return new NextResponse("Forbidden", { status: 403 })

        const body = await req.json()
        const {
            status,
            dueDate,
            notes,
            clientName,
            clientEmail,
            clientAddress,
            clientGST,
            items,
            taxRate,
        } = body

        const existing = await prisma.invoice.findUnique({ where: { id: params.id } })
        if (!existing) return new NextResponse("Not Found", { status: 404 })

        const updateData: Record<string, unknown> = {}

        if (status !== undefined) updateData.status = status
        if (dueDate !== undefined) updateData.dueDate = new Date(dueDate)
        if (notes !== undefined) updateData.notes = notes
        if (clientName !== undefined) updateData.clientName = clientName
        if (clientEmail !== undefined) updateData.clientEmail = clientEmail
        if (clientAddress !== undefined) updateData.clientAddress = clientAddress
        if (clientGST !== undefined) updateData.clientGST = clientGST

        // If updating items, recalculate totals
        if (items !== undefined && Array.isArray(items)) {
            // Delete old items and recreate
            await prisma.invoiceItem.deleteMany({ where: { invoiceId: params.id } })
            const newItems = await prisma.invoiceItem.createMany({
                data: items.map((item: {
                    description: string
                    employeeCount: number
                    ratePerHead: number
                    days: number
                    amount: number
                }) => ({
                    invoiceId: params.id,
                    description: item.description,
                    employeeCount: item.employeeCount || 1,
                    ratePerHead: item.ratePerHead || 0,
                    days: item.days || 26,
                    amount: item.amount || 0,
                })),
            })
            const subtotal = items.reduce((s: number, i: { amount: number }) => s + (i.amount || 0), 0)
            const rate = taxRate !== undefined ? taxRate : existing.taxRate
            const taxAmount = subtotal * rate / 100
            updateData.subtotal = subtotal
            updateData.taxRate = rate
            updateData.taxAmount = taxAmount
            updateData.totalAmount = subtotal + taxAmount
            // recalculate paidAmount from payments
            const payments = await prisma.payment.findMany({ where: { invoiceId: params.id } })
            const paid = payments.reduce((s, p) => s + p.amount, 0)
            updateData.paidAmount = paid
            void newItems
        }

        const invoice = await prisma.invoice.update({
            where: { id: params.id },
            data: updateData,
            include: {
                items: true,
                payments: { orderBy: { paymentDate: "desc" } },
            },
        })

        return NextResponse.json(invoice)
    } catch (error) {
        console.error("[BILLING_PUT]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        if (session.user.role !== "ADMIN") return new NextResponse("Forbidden", { status: 403 })

        const existing = await prisma.invoice.findUnique({ where: { id: params.id } })
        if (!existing) return new NextResponse("Not Found", { status: 404 })

        if (existing.status !== "DRAFT") {
            return new NextResponse("Only DRAFT invoices can be deleted", { status: 400 })
        }

        await prisma.invoice.delete({ where: { id: params.id } })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[BILLING_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
