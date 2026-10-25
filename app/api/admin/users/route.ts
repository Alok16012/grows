
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { usersTable, createUser } from "./_table"

export async function GET(req: Request) {
    // The Users screen asks for one page at a time (?page=…) with its filters.
    if (new URL(req.url).searchParams.has("page")) return usersTable(req)

    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Two audiences. Admins and users.manage holders get the directory the
    // System Users page needs. Everyone else gets a name list for assignee
    // dropdowns (recruitment, helpdesk) and nothing more: the old check let
    // any signed-in employee through (every account carries "self.view"),
    // and the full rows — including the stored plain password — went with it.
    const full = session.user.role === Role.ADMIN || (session.user.permissions ?? []).includes("users.manage")

    try {
        if (!full) {
            // The name list is only for staff who assign work (helpdesk,
            // recruitment). A self-service login — every field worker has
            // one — must not be able to pull every colleague's email and role.
            const perms = session.user.permissions ?? []
            const ASSIGNERS = ["helpdesk.manage", "helpdesk.view", "recruitment.view", "recruitment.manage", "onboarding.manage"]
            if (!ASSIGNERS.some(p => perms.includes(p))) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 })
            }
            const users = await prisma.user.findMany({
                where: { isActive: true },
                select: { id: true, name: true, email: true, role: true, customRole: { select: { id: true, name: true, color: true } } },
                orderBy: { name: "asc" },
            })
            return NextResponse.json(users)
        }

        const users = await prisma.user.findMany({
            include: {
                customRole: {
                    select: { id: true, name: true, color: true }
                },
                // Lets the System Users page distinguish employee-linked logins
                // from clients/admins/legacy accounts.
                employeeProfile: {
                    select: { id: true, employeeId: true, designation: true }
                }
            },
            orderBy: {
                createdAt: "desc"
            }
        })

        // Neither password column ever leaves the server.
        const safeUsers = users.map(user => {
            const { password, plainPassword, ...safeUser } = user
            void password; void plainPassword
            return safeUser
        })

        return NextResponse.json(safeUsers)
    } catch (error) {
        console.error("GET_ADMIN_USERS_ERROR", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}

// Create user (Users → Create user). Rules in ./_table.
export async function POST(req: Request) {
    return createUser(req)
}
