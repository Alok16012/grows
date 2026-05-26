
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { checkAccess } from "@/lib/permissions"

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)

    if (!checkAccess(session, ["MANAGER"], "employees.view")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const role = searchParams.get("role")
    const ids = searchParams.get("ids")

    try {
        // Get users by IDs
        if (ids) {
            const userIds = ids.split(",")
            const users = await prisma.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, name: true, email: true }
            })
            return NextResponse.json(users)
        }

        if (role === "INSPECTION_BOY") {
            const users = await prisma.user.findMany({
                where: {
                    role: Role.INSPECTION_BOY,
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                },
            })
            return NextResponse.json(users)
        }

        if (role === "MANAGER") {
            const users = await prisma.user.findMany({
                where: {
                    role: Role.MANAGER,
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                },
            })
            return NextResponse.json(users)
        }

        return NextResponse.json({ error: "Invalid role filter" }, { status: 400 })
    } catch (error) {
        console.error("GET_USERS_ERROR", error)
        return NextResponse.json({
            error: "Database Connection Error",
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 })
    }
}
