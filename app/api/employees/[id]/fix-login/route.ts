import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import bcrypt from "bcryptjs"

export async function POST(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const { customRoleId } = await req.json()

        const employee = await prisma.employee.findUnique({
            where: { id: params.id },
            select: { id: true, firstName: true, lastName: true, email: true, phone: true, userId: true }
        })

        if (!employee) return new NextResponse("Employee not found", { status: 404 })

        // If employee already has a linked user → just update the role
        if (employee.userId) {
            await prisma.user.update({
                where: { id: employee.userId },
                data: { customRoleId: customRoleId || null }
            })
            return NextResponse.json({ created: false, message: "Role updated" })
        }

        // No user account — create one
        const loginEmail = employee.email || `${employee.phone}@cims.app`
        const tempPassword = `Grow@${employee.phone?.slice(-4) || "1234"}`
        const hashed = await bcrypt.hash(tempPassword, 10)

        // Check if user with this email already exists
        let user = await prisma.user.findUnique({ where: { email: loginEmail } })
        if (user) {
            // Link existing user to employee
            await prisma.employee.update({
                where: { id: params.id },
                data: { userId: user.id }
            })
            if (customRoleId) {
                await prisma.user.update({ where: { id: user.id }, data: { customRoleId } })
            }
            return NextResponse.json({ created: false, message: "Existing user linked" })
        }

        // Create new user
        user = await prisma.user.create({
            data: {
                name: `${employee.firstName} ${employee.lastName}`,
                email: loginEmail,
                password: hashed,
                role: "INSPECTION_BOY",
                customRoleId: customRoleId || null,
            }
        })

        // Link user to employee
        await prisma.employee.update({
            where: { id: params.id },
            data: { userId: user.id }
        })

        return NextResponse.json({ created: true, email: loginEmail, password: tempPassword })
    } catch (error) {
        console.error("[FIX_LOGIN]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
