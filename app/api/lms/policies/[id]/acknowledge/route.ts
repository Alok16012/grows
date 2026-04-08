import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const policy = await prisma.policy.findUnique({
            where: { id: params.id },
        })

        if (!policy) return new NextResponse("Policy not found", { status: 404 })
        if (!policy.isActive) return new NextResponse("Policy is not active", { status: 400 })

        const existing = await prisma.policyAcknowledgment.findUnique({
            where: {
                policyId_employeeId: {
                    policyId: params.id,
                    employeeId: session.user.id,
                },
            },
        })

        if (existing) {
            return NextResponse.json({ acknowledged: true, message: "Already acknowledged" })
        }

        const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown"

        await prisma.policyAcknowledgment.create({
            data: {
                policyId: params.id,
                employeeId: session.user.id,
                ipAddress: ip,
            },
        })

        return NextResponse.json({ acknowledged: true, acknowledgedAt: new Date().toISOString() })
    } catch (error) {
        console.error("[POLICY_ACKNOWLEDGE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
