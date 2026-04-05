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

        const existing = await prisma.clientContract.findUnique({ where: { id: params.id } })
        if (!existing) return new NextResponse("Not Found", { status: 404 })

        if (existing.status !== "ACTIVE") {
            return new NextResponse("Only ACTIVE contracts can be renewed", { status: 400 })
        }

        const body = await req.json()
        const { newEndDate, newValue, notes } = body

        if (!newEndDate) {
            return new NextResponse("newEndDate is required", { status: 400 })
        }

        // Create renewal record and update contract in a transaction
        const [renewal] = await prisma.$transaction([
            prisma.contractRenewal.create({
                data: {
                    contractId: params.id,
                    newEndDate: new Date(newEndDate),
                    newValue: newValue ? parseFloat(newValue) : null,
                    notes: notes || null,
                    renewedBy: session.user.id,
                },
            }),
            prisma.clientContract.update({
                where: { id: params.id },
                data: {
                    endDate: new Date(newEndDate),
                    monthlyValue: newValue ? parseFloat(newValue) : existing.monthlyValue,
                    status: "ACTIVE",
                },
            }),
        ])

        return NextResponse.json(renewal)
    } catch (error) {
        console.error("[CONTRACT_RENEW]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
