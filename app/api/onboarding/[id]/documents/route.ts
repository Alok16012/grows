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
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const record = await prisma.onboardingRecord.findUnique({ where: { id: params.id } })
        if (!record) return new NextResponse("Onboarding record not found", { status: 404 })

        const documents = await prisma.employeeDocument.findMany({
            where: { employeeId: record.employeeId },
            orderBy: { uploadedAt: "desc" },
        })

        return NextResponse.json(documents)
    } catch (error) {
        console.error("[ONBOARDING_DOCS_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const record = await prisma.onboardingRecord.findUnique({ where: { id: params.id } })
        if (!record) return new NextResponse("Onboarding record not found", { status: 404 })

        const body = await req.json()
        const { type, fileName, fileUrl } = body

        if (!type || !fileName || !fileUrl) {
            return new NextResponse("type, fileName, and fileUrl are required", { status: 400 })
        }

        const doc = await prisma.employeeDocument.create({
            data: {
                employeeId: record.employeeId,
                type,
                fileName,
                fileUrl,
                status: "PENDING",
            },
        })

        return NextResponse.json(doc)
    } catch (error) {
        console.error("[ONBOARDING_DOCS_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { docId, status, rejectionReason } = body

        if (!docId || !status) {
            return new NextResponse("docId and status are required", { status: 400 })
        }

        const doc = await prisma.employeeDocument.update({
            where: { id: docId },
            data: {
                status,
                rejectionReason: rejectionReason || null,
                verifiedBy: session.user.name || session.user.email || null,
            },
        })

        return NextResponse.json(doc)
    } catch (error) {
        console.error("[ONBOARDING_DOCS_PATCH]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
