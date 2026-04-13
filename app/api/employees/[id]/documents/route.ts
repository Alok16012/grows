import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

const VALID_TYPES = ["RESUME", "AADHAAR", "PAN", "PHOTO", "CERTIFICATE", "OFFER_LETTER", "OTHER"]

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

        const documents = await prisma.employeeDocument.findMany({
            where: { employeeId: params.id },
            orderBy: { uploadedAt: "desc" },
        })

        return NextResponse.json(documents)
    } catch (error) {
        console.error("[EMPLOYEE_DOCS_GET]", error)
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

        const body = await req.json()
        const { type, fileName, fileUrl } = body

        if (!type || !fileName || !fileUrl) {
            return new NextResponse("type, fileName and fileUrl are required", { status: 400 })
        }
        if (!VALID_TYPES.includes(type)) {
            return new NextResponse("Invalid document type", { status: 400 })
        }

        // Verify employee exists
        const employee = await prisma.employee.findUnique({ where: { id: params.id } })
        if (!employee) return new NextResponse("Employee not found", { status: 404 })

        const document = await prisma.employeeDocument.create({
            data: {
                employeeId: params.id,
                type,
                fileName,
                fileUrl,
                status: "PENDING",
            },
        })

        return NextResponse.json(document)
    } catch (error) {
        console.error("[EMPLOYEE_DOCS_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
