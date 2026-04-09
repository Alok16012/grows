import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { resolveUserId } from "@/lib/resolveUserId"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const { searchParams } = new URL(req.url)
        const category = searchParams.get("category")
        const employeeId = searchParams.get("employeeId")

        const where: Record<string, unknown> = { isActive: true }
        if (category) where.category = category

        const policies = await prisma.policy.findMany({
            where,
            orderBy: { createdAt: "desc" },
        })

        let acknowledgments: Record<string, Date> = {}
        if (session.user.role === "ADMIN" || session.user.role === "MANAGER") {
            if (employeeId) {
                const acks = await prisma.policyAcknowledgment.findMany({
                    where: { employeeId },
                    select: { policyId: true, acknowledgedAt: true },
                })
                acknowledgments = Object.fromEntries(acks.map(a => [a.policyId, a.acknowledgedAt]))
            }
        } else {
            const acks = await prisma.policyAcknowledgment.findMany({
                where: { employeeId: session.user.id },
                select: { policyId: true, acknowledgedAt: true },
            })
            acknowledgments = Object.fromEntries(acks.map(a => [a.policyId, a.acknowledgedAt]))
        }

        const result = policies.map(p => ({
            ...p,
            acknowledged: !!acknowledgments[p.id],
            acknowledgedAt: acknowledgments[p.id]?.toISOString() || null,
        }))

        return NextResponse.json(result)
    } catch (error) {
        console.error("[POLICIES_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }
        // Resolve real DB user ID
        const actorId = await resolveUserId(session)
        if (!actorId) return NextResponse.json({ error: "User not found. Please log in again." }, { status: 403 })


        const body = await req.json()
        const { title, description, category, fileUrl, isRequired } = body

        if (!title || !category) {
            return new NextResponse("title and category are required", { status: 400 })
        }

        const policy = await prisma.policy.create({
            data: {
                title,
                description: description || null,
                category,
                fileUrl: fileUrl || null,
                isRequired: isRequired ?? true,
                createdBy: actorId!,
            },
        })

        return NextResponse.json(policy)
    } catch (error) {
        console.error("[POLICIES_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
