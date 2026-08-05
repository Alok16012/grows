import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

const VALID_TYPES = ["RESUME", "AADHAAR", "PAN", "PHOTO", "BANK_DETAILS", "CERTIFICATE", "OFFER_LETTER", "OTHER"]

// These documents are KYC (Aadhaar / PAN / bank proof), so anyone without the
// relevant documents.* permission may only touch their OWN employee record.
async function isSelf(userId: string, employeeId: string) {
    const self = await prisma.employee.findFirst({
        where: { userId },
        select: { id: true },
    })
    return self?.id === employeeId
}

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role === "CLIENT") {
            return new NextResponse("Forbidden", { status: 403 })
        }
        if (!checkAccess(session, [], "documents.view")
            && !(await isSelf(session.user.id, params.id))) {
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
        if (session.user.role === "CLIENT") {
            return new NextResponse("Forbidden", { status: 403 })
        }
        if (!checkAccess(session, [], "documents.upload")
            && !(await isSelf(session.user.id, params.id))) {
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

        // Keep the employee's profile photo in sync so the avatar shows up
        // everywhere (list view, board view, detail page, HR logins, etc.)
        if (type === "PHOTO") {
            try {
                await prisma.employee.update({
                    where: { id: params.id },
                    data: { photo: fileUrl },
                })
            } catch (e) {
                console.error("[EMPLOYEE_DOCS_PHOTO_SYNC]", e)
            }
        }

        return NextResponse.json(document)
    } catch (error) {
        console.error("[EMPLOYEE_DOCS_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
