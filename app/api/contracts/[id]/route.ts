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

        const contract = await prisma.clientContract.findUnique({
            where: { id: params.id },
            include: {
                renewals: { orderBy: { renewedAt: "desc" } },
            },
        })

        if (!contract) return new NextResponse("Not Found", { status: 404 })

        const now = new Date()
        let daysUntilExpiry: number | null = null
        if (contract.endDate) {
            const diff = contract.endDate.getTime() - now.getTime()
            daysUntilExpiry = Math.ceil(diff / (1000 * 60 * 60 * 24))
        }

        return NextResponse.json({ ...contract, daysUntilExpiry })
    } catch (error) {
        console.error("[CONTRACT_GET]", error)
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

        const existing = await prisma.clientContract.findUnique({ where: { id: params.id } })
        if (!existing) return new NextResponse("Not Found", { status: 404 })

        const body = await req.json()
        const {
            clientName,
            clientCompanyId,
            contactPerson,
            contactEmail,
            contactPhone,
            contractType,
            status,
            serviceType,
            startDate,
            endDate,
            value,
            monthlyValue,
            manpowerCount,
            slaTerms,
            billingCycle,
            paymentTerms,
            notes,
        } = body

        // Validate status transitions
        const validTransitions: Record<string, string[]> = {
            DRAFT: ["ACTIVE"],
            ACTIVE: ["EXPIRED", "TERMINATED", "RENEWED"],
            EXPIRED: [],
            TERMINATED: [],
            RENEWED: ["ACTIVE", "TERMINATED"],
        }

        if (status && status !== existing.status) {
            const allowed = validTransitions[existing.status] || []
            if (!allowed.includes(status)) {
                return new NextResponse(
                    `Invalid status transition from ${existing.status} to ${status}`,
                    { status: 400 }
                )
            }
        }

        const updated = await prisma.clientContract.update({
            where: { id: params.id },
            data: {
                clientName: clientName ?? existing.clientName,
                clientCompanyId: clientCompanyId !== undefined ? (clientCompanyId || null) : existing.clientCompanyId,
                contactPerson: contactPerson !== undefined ? (contactPerson || null) : existing.contactPerson,
                contactEmail: contactEmail !== undefined ? (contactEmail || null) : existing.contactEmail,
                contactPhone: contactPhone !== undefined ? (contactPhone || null) : existing.contactPhone,
                contractType: contractType ?? existing.contractType,
                status: status ?? existing.status,
                serviceType: serviceType !== undefined ? (serviceType || null) : existing.serviceType,
                startDate: startDate ? new Date(startDate) : existing.startDate,
                endDate: endDate !== undefined ? (endDate ? new Date(endDate) : null) : existing.endDate,
                value: value !== undefined ? (value ? parseFloat(value) : null) : existing.value,
                monthlyValue: monthlyValue !== undefined ? (monthlyValue ? parseFloat(monthlyValue) : null) : existing.monthlyValue,
                manpowerCount: manpowerCount !== undefined ? (manpowerCount ? parseInt(manpowerCount) : null) : existing.manpowerCount,
                slaTerms: slaTerms !== undefined ? (slaTerms || null) : existing.slaTerms,
                billingCycle: billingCycle !== undefined ? (billingCycle || null) : existing.billingCycle,
                paymentTerms: paymentTerms !== undefined ? (paymentTerms || null) : existing.paymentTerms,
                notes: notes !== undefined ? (notes || null) : existing.notes,
            },
        })

        return NextResponse.json(updated)
    } catch (error) {
        console.error("[CONTRACT_PUT]", error)
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

        const existing = await prisma.clientContract.findUnique({ where: { id: params.id } })
        if (!existing) return new NextResponse("Not Found", { status: 404 })

        if (existing.status !== "DRAFT") {
            return new NextResponse("Only DRAFT contracts can be deleted", { status: 400 })
        }

        await prisma.clientContract.delete({ where: { id: params.id } })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[CONTRACT_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
