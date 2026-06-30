import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    if (!["ADMIN", "MANAGER", "HR_MANAGER"].includes(session.user.role)) {
        return new NextResponse("Forbidden", { status: 403 })
    }

    try {
        // IMPORTANT: never select `fileUrl` here. Documents are stored as base64
        // data URLs, so shipping the blob for every document made this endpoint
        // return hundreds of MB and load times hit ~15s. The master documents
        // grid only needs to know WHICH doc types exist per employee (+ name /
        // status). The actual file is fetched on demand when the user clicks
        // View/Download (GET /api/employees/[id]/documents/[docId]).
        const docs = await prisma.employeeDocument.findMany({
            select: {
                id: true,
                type: true,
                fileName: true,
                status: true,
                uploadedAt: true,
                employee: { select: { id: true } },
            },
            orderBy: { uploadedAt: "desc" },
        })
        return NextResponse.json(docs)
    } catch (error) {
        console.error("[ALL_DOCS_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
