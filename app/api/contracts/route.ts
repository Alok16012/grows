import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const isPrivileged = session.user.role === "ADMIN" || session.user.role === "MANAGER"
        if (!isPrivileged) return new NextResponse("Forbidden", { status: 403 })

        const { searchParams } = new URL(req.url)
        const status = searchParams.get("status")
        const contractType = searchParams.get("contractType")
        const search = searchParams.get("search")

        const where: Record<string, unknown> = {}

        if (status && status !== "ALL") where.status = status
        if (contractType && contractType !== "ALL") where.contractType = contractType

        if (search) {
            where.OR = [
                { clientName: { contains: search, mode: "insensitive" } },
                { contractNo: { contains: search, mode: "insensitive" } },
            ]
        }

        const contracts = await prisma.clientContract.findMany({
            where,
            orderBy: { createdAt: "desc" },
            include: {
                _count: { select: { renewals: true } },
            },
        })

        const now = new Date()

        const result = contracts.map(c => {
            let daysUntilExpiry: number | null = null
            if (c.endDate) {
                const diff = c.endDate.getTime() - now.getTime()
                daysUntilExpiry = Math.ceil(diff / (1000 * 60 * 60 * 24))
            }
            return {
                ...c,
                daysUntilExpiry,
                renewalsCount: c._count.renewals,
            }
        })

        return NextResponse.json(result)
    } catch (error) {
        console.error("[CONTRACTS_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const isPrivileged = session.user.role === "ADMIN" || session.user.role === "MANAGER"
        if (!isPrivileged) return new NextResponse("Forbidden", { status: 403 })

        const body = await req.json()
        const {
            clientName,
            clientCompanyId,
            contactPerson,
            contactEmail,
            contactPhone,
            contractType,
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

        if (!clientName || !startDate) {
            return new NextResponse("clientName and startDate are required", { status: 400 })
        }

        // Auto-generate contract number CTR-NNNN
        const count = await prisma.clientContract.count()
        const contractNo = `CTR-${String(count + 1).padStart(4, "0")}`

        const contract = await prisma.clientContract.create({
            data: {
                contractNo,
                clientName,
                clientCompanyId: clientCompanyId || null,
                contactPerson: contactPerson || null,
                contactEmail: contactEmail || null,
                contactPhone: contactPhone || null,
                contractType: contractType || "FIXED_TERM",
                status: "DRAFT",
                startDate: new Date(startDate),
                endDate: endDate ? new Date(endDate) : null,
                value: value ? parseFloat(value) : null,
                monthlyValue: monthlyValue ? parseFloat(monthlyValue) : null,
                manpowerCount: manpowerCount ? parseInt(manpowerCount) : null,
                serviceType: serviceType || null,
                slaTerms: slaTerms || null,
                billingCycle: billingCycle || null,
                paymentTerms: paymentTerms || null,
                notes: notes || null,
                createdBy: session.user.id,
            },
        })

        return NextResponse.json(contract)
    } catch (error) {
        console.error("[CONTRACTS_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
