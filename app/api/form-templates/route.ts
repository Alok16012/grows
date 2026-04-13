
import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const { searchParams } = new URL(req.url)
        const projectId = searchParams.get("projectId")

        if (!projectId) return new NextResponse("projectId is required", { status: 400 })

        const fields = await prisma.formTemplate.findMany({
            where: { projectId },
            orderBy: { displayOrder: "asc" },
        })

        return NextResponse.json(fields)
    } catch (error) {
        console.error("[FORM_TEMPLATES_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { projectId, fieldLabel, fieldType, options, defaultValue, isRequired, displayOrder } = body

        if (!projectId || !fieldLabel || !fieldType) {
            return new NextResponse("projectId, fieldLabel, and fieldType are required", { status: 400 })
        }

        const field = await prisma.formTemplate.create({
            data: {
                projectId,
                fieldLabel,
                fieldType,
                options: options || null,
                defaultValue: defaultValue || null,
                isRequired: isRequired ?? false,
                displayOrder: displayOrder ?? 0,
            },
        })

        return NextResponse.json(field)
    } catch (error) {
        console.error("[FORM_TEMPLATES_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
