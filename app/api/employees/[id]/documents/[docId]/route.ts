import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

const VALID_STATUSES = ["PENDING", "VERIFIED", "REJECTED"]

export async function PATCH(
    req: Request,
    { params }: { params: { id: string; docId: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { status, rejectionReason } = body

        if (!status) {
            return new NextResponse("status is required", { status: 400 })
        }
        if (!VALID_STATUSES.includes(status)) {
            return new NextResponse("Invalid status. Must be PENDING, VERIFIED, or REJECTED", { status: 400 })
        }
        if (status === "REJECTED" && !rejectionReason) {
            return new NextResponse("rejectionReason is required when rejecting", { status: 400 })
        }

        // Verify document belongs to this employee
        const existing = await prisma.employeeDocument.findFirst({
            where: { id: params.docId, employeeId: params.id },
        })
        if (!existing) return new NextResponse("Document not found", { status: 404 })

        const document = await prisma.employeeDocument.update({
            where: { id: params.docId },
            data: {
                status,
                rejectionReason: status === "REJECTED" ? rejectionReason : null,
                verifiedBy: status === "VERIFIED" ? session.user.id : null,
            },
        })

        return NextResponse.json(document)
    } catch (error) {
        console.error("[EMPLOYEE_DOC_PATCH]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string; docId: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const existing = await prisma.employeeDocument.findFirst({
            where: { id: params.docId, employeeId: params.id },
        })
        if (!existing) return new NextResponse("Document not found", { status: 404 })

        await prisma.employeeDocument.delete({ where: { id: params.docId } })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[EMPLOYEE_DOC_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
