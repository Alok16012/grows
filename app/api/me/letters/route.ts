import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })

    try {
        const emp = await prisma.employee.findFirst({
            where: { userId: session.user.id },
            select: { id: true }
        })
        if (!emp) return NextResponse.json([])

        const letters = await prisma.hrDocument.findMany({
            where: { employeeId: emp.id, status: "ISSUED" },
            include: { type: { select: { id: true, name: true } } },
            orderBy: { issuedAt: "desc" },
        })

        return NextResponse.json(letters)
    } catch (error) {
        console.error("[ME_LETTERS_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
