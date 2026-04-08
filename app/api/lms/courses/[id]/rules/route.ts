import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const rules = await prisma.courseAssignmentRule.findMany({
            where: { courseId: params.id },
            orderBy: { createdAt: "asc" },
        })

        return NextResponse.json(rules)
    } catch (error) {
        console.error("[LMS_RULES_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { assignTo, value, dueDays } = body

        if (!assignTo || !value) {
            return new NextResponse("assignTo and value are required", { status: 400 })
        }

        const validAssignTo = ["ROLE", "DESIGNATION", "SITE", "CLIENT", "BRANCH", "ALL"]
        if (!validAssignTo.includes(assignTo)) {
            return new NextResponse("Invalid assignTo value", { status: 400 })
        }

        const rule = await prisma.courseAssignmentRule.create({
            data: {
                courseId: params.id,
                assignTo,
                value,
                dueDays: dueDays ? parseInt(dueDays) : null,
            },
        })

        return NextResponse.json(rule)
    } catch (error) {
        console.error("[LMS_RULES_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const ruleId = searchParams.get("ruleId")

        if (!ruleId) return new NextResponse("ruleId is required", { status: 400 })

        await prisma.courseAssignmentRule.delete({ where: { id: ruleId } })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[LMS_RULES_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
