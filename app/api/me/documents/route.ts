import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

// Find employee linked to logged-in user
async function getMyEmployee(userId: string) {
    return prisma.employee.findFirst({
        where: { userId }
    })
}

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })

    const emp = await getMyEmployee(session.user.id)
    if (!emp) return NextResponse.json([])

    const docs = await prisma.employeeDocument.findMany({
        where: { employeeId: emp.id },
        orderBy: { uploadedAt: "desc" }
    })
    return NextResponse.json(docs)
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })

    const emp = await getMyEmployee(session.user.id)
    if (!emp) return new NextResponse("Employee profile not found", { status: 404 })

    const body = await req.json()
    const { type, fileName, fileUrl } = body

    if (!type || !fileName || !fileUrl) {
        return new NextResponse("type, fileName, fileUrl required", { status: 400 })
    }

    // Replace existing doc of same type (re-upload)
    await prisma.employeeDocument.deleteMany({
        where: { employeeId: emp.id, type }
    })

    const doc = await prisma.employeeDocument.create({
        data: {
            employeeId: emp.id,
            type,
            fileName,
            fileUrl,
            status: "PENDING"
        }
    })

    // Keep the employee's profile photo in sync so the avatar shows up
    // everywhere (list view, board view, detail page, HR logins, etc.)
    if (type === "PHOTO") {
        try {
            await prisma.employee.update({
                where: { id: emp.id },
                data: { photo: fileUrl },
            })
        } catch (e) {
            console.error("[ME_DOCS_PHOTO_SYNC]", e)
        }
    }

    return NextResponse.json(doc)
}
