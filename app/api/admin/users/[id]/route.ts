import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import bcrypt from "bcryptjs"

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } }
) {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== Role.ADMIN) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = params.id

    try {
        const body = await req.json()
        const { isActive, password, name, email, role, customRoleId } = body

        const updateData: any = {}

        if (typeof isActive === "boolean") {
            updateData.isActive = isActive
        }
        if (password) {
            updateData.password = await bcrypt.hash(password, 10)
        }
        if (name) {
            updateData.name = name
        }
        if (email) {
            // Check email uniqueness
            const existing = await prisma.user.findFirst({ where: { email, NOT: { id: userId } } })
            if (existing) {
                return NextResponse.json({ error: "Email already in use" }, { status: 400 })
            }
            updateData.email = email
        }
        if (role && Object.values(Role).includes(role as Role)) {
            updateData.role = role as Role
        }
        if (customRoleId !== undefined) {
            updateData.customRoleId = customRoleId || null
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: "No data provided" }, { status: 400 })
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: updateData
        })

        const { password: _, ...safeUser } = user
        return NextResponse.json(safeUser)
    } catch (error) {
        console.error("PATCH_USER_ERROR", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } }
) {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== Role.ADMIN) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = params.id

    // Prevent self-deletion
    if (session.user.id === userId) {
        return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 })
    }

    try {
        await prisma.user.delete({ where: { id: userId } })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("DELETE_USER_ERROR", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}
