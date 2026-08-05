
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
            // Anyone who can actually do inspection work, not just the base role.
            // Assigning a custom role sets the system role to MANAGER, so a
            // "Quality Inspector" never matched here — they could not be picked
            // for a project team at all, and once removed there was no way to add
            // them back.
            const users = await prisma.user.findMany({
                where: {
                    // Only real staff — users with a linked Employee record.
                    employeeProfile: { isNot: null },
                    OR: [
                        { role: Role.INSPECTION_BOY },
                        {
                            customRole: {
                                isActive: true,
                                permissions: {
                                    hasSome: ["inspection.view", "inspection.submit", "inspection.history"],
                                },
                            },
                        },
                    ],
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                },
            })
            return NextResponse.json(users)
        }

        if (role === "MANAGER") {
            const users = await prisma.user.findMany({
                where: {
                    role: Role.MANAGER,
                    // Only real staff — users with a linked Employee record.
                    employeeProfile: { isNot: null },
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
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
