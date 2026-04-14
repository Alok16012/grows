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
        const docs = await prisma.employeeDocument.findMany({
            include: {
                employee: {
                    select: {
                        id: true,
                        employeeId: true,
                        firstName: true,
                        lastName: true,
                        branch: { select: { name: true } },
                        department: { select: { name: true } },
                    }
                }
            },
            orderBy: { uploadedAt: "desc" },
        })
        return NextResponse.json(docs)
    } catch (error) {
        console.error("[ALL_DOCS_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
