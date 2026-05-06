import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import bcrypt from "bcryptjs"

// POST /api/employees/[id]/fix-login
// Admin utility: activate user account, set correct role, reset password to phone number
export async function POST(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session || session.user.role !== "ADMIN") {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        const emp = await prisma.employee.findUnique({
            where: { id: params.id },
            select: { userId: true, phone: true, firstName: true, lastName: true },
        })
        if (!emp) return new NextResponse("Employee not found", { status: 404 })
        if (!emp.userId) return new NextResponse("No linked user account", { status: 400 })

        const body = await req.json().catch(() => ({}))
        const { role, newPassword } = body

        const phone = emp.phone || "123456"
        const password = newPassword || phone
        const hash = await bcrypt.hash(password, 10)

        const updated = await prisma.user.update({
            where: { id: emp.userId },
            data: {
                isActive: true,
                password: hash,
                ...(role ? { role } : {}),
                name: `${emp.firstName} ${emp.lastName}`.trim(),
            },
            select: { id: true, email: true, role: true, isActive: true },
        })

        return NextResponse.json({
            success: true,
            user: updated,
            loginEmail: updated.email,
            loginPassword: password,
        })
    } catch (error) {
        console.error("[FIX_LOGIN]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
