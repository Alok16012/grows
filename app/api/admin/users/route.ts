
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import bcrypt from "bcryptjs"

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== Role.ADMIN && session.user.role !== Role.MANAGER && session.user.role !== "HR_MANAGER")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const users = await prisma.user.findMany({
            include: {
                company: {
                    select: { name: true }
                }
            },
            orderBy: {
                createdAt: "desc"
            }
        })

        // Remove passwords from response
        const safeUsers = users.map(user => {
            const { password, ...safeUser } = user
            return safeUser
        })

        return NextResponse.json(safeUsers)
    } catch (error) {
        console.error("GET_ADMIN_USERS_ERROR", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== Role.ADMIN) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await req.json()
        const { name, email, password, role, companyId } = body

        if (!name || !email || !password || !role) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
        }

        const existingUser = await prisma.user.findUnique({
            where: { email }
        })

        if (existingUser) {
            return NextResponse.json({ error: "User already exists" }, { status: 400 })
        }

        const hashedPassword = await bcrypt.hash(password, 10)

        // Ensure companyId is null if not provided or empty string
        const finalCompanyId = (role === Role.CLIENT && companyId && companyId.trim() !== "") ? companyId : null

        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: role as any,
                company: finalCompanyId ? { connect: { id: finalCompanyId } } : undefined
            }
        })

        const { password: _, ...safeUser } = user
        return NextResponse.json(safeUser)
    } catch (error: any) {
        console.error("POST_ADMIN_USER_ERROR", error)
        return NextResponse.json({
            error: "Internal Error",
            message: error.message
        }, { status: 500 })
    }
}
