
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { INSPECTION_PERMISSIONS } from "@/lib/permissions"
import bcrypt from "bcryptjs"

export async function GET(req: Request) {
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

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== Role.ADMIN) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await req.json()
        const { name, email, password, role, customRoleId } = body

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

        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: role as any,
                customRoleId: customRoleId || null,
            }
        })

        // Auto-create Employee record for inspectors so they appear in HR workflows
        // and inspector pickers — those match on a linked Employee record. Who counts
        // as an inspector comes from the assigned custom role's inspection permissions:
        // this screen always sends base role MANAGER alongside a custom role, so the
        // INSPECTION_BOY base role never identified a real inspector here.
        const isInspector = customRoleId
            ? !!(await prisma.customRole.findFirst({
                where: {
                    id: customRoleId,
                    permissions: { hasSome: INSPECTION_PERMISSIONS },
                },
                select: { id: true },
            }))
            : false

        if (isInspector) {
            const nameParts = name.trim().split(" ")
            const firstName = nameParts[0]
            const lastName = nameParts.slice(1).join(" ") || "-"
            // Generate unique employeeId: INS-<timestamp suffix>
            const empId = "INS-" + Date.now().toString().slice(-6)
            try {
                await prisma.employee.create({
                    data: {
                        employeeId: empId,
                        firstName,
                        lastName,
                        email,
                        phone: body.phone || null,
                        designation: "Inspector",
                        status: "ACTIVE",
                        userId: user.id,
                    }
                })
            } catch (empErr) {
                console.error("Failed to auto-create Employee for inspector:", empErr)
                // Non-fatal: user is created, employee will be linked manually if needed
            }
        }

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
