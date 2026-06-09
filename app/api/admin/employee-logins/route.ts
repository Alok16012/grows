import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { buildLoginEmail, defaultPassword } from "@/lib/credentials"
import bcrypt from "bcryptjs"

// List every employee alongside their login credentials (id + password + role).
export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== Role.ADMIN) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const employees = await prisma.employee.findMany({
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                employeeId: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                designation: true,
                user: {
                    select: {
                        id: true,
                        email: true,
                        plainPassword: true,
                        role: true,
                        isActive: true,
                        customRole: { select: { id: true, name: true, color: true } },
                    },
                },
            },
        })

        const rows = employees.map(e => ({
            employeeId: e.id,
            empCode: e.employeeId,
            name: `${e.firstName} ${e.lastName || ""}`.trim(),
            designation: e.designation,
            phone: e.phone,
            hasLogin: !!e.user,
            userId: e.user?.id || null,
            loginEmail: e.user?.email || null,
            password: e.user?.plainPassword || null,
            isActive: e.user?.isActive ?? null,
            systemRole: e.user?.role || null,
            customRole: e.user?.customRole || null,
        }))

        return NextResponse.json(rows)
    } catch (error) {
        console.error("GET_EMPLOYEE_LOGINS_ERROR", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}

// Ensure every employee has a login with a *visible* password.
//  - No user account      → create one (default Grow@<last4> password).
//  - User but no visible   → reset password to a fresh default so admin can see it.
//    plainPassword
//  - Already has visible   → leave untouched.
//    password
export async function POST() {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== Role.ADMIN) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const employees = await prisma.employee.findMany({
            select: {
                id: true, employeeId: true, firstName: true, lastName: true, email: true, phone: true,
                userId: true,
                user: { select: { id: true, plainPassword: true } },
            },
        })

        let created = 0
        let linked = 0
        let reset = 0
        let failed = 0

        for (const e of employees) {
            try {
                // Already has a login.
                if (e.user) {
                    // Password already visible → nothing to do.
                    if (e.user.plainPassword) continue
                    // Visible password missing → reset to a fresh default so it shows.
                    const plain = defaultPassword({ phone: e.phone })
                    await prisma.user.update({
                        where: { id: e.user.id },
                        data: { password: await bcrypt.hash(plain, 10), plainPassword: plain },
                    })
                    reset++
                    continue
                }

                const loginEmail = buildLoginEmail({ email: e.email, phone: e.phone, employeeId: e.employeeId })
                const existing = await prisma.user.findUnique({
                    where: { email: loginEmail },
                    include: { employeeProfile: { select: { id: true } } },
                })
                if (existing) {
                    if (!existing.employeeProfile) {
                        await prisma.employee.update({ where: { id: e.id }, data: { userId: existing.id } })
                        linked++
                    }
                    // Backfill a visible password if it doesn't have one.
                    if (!existing.plainPassword) {
                        const plain = defaultPassword({ phone: e.phone })
                        await prisma.user.update({
                            where: { id: existing.id },
                            data: { password: await bcrypt.hash(plain, 10), plainPassword: plain },
                        })
                        reset++
                    }
                    continue
                }

                const plain = defaultPassword({ phone: e.phone })
                const hashed = await bcrypt.hash(plain, 10)
                const user = await prisma.user.create({
                    data: {
                        name: `${e.firstName} ${e.lastName || ""}`.trim(),
                        email: loginEmail,
                        password: hashed,
                        plainPassword: plain,
                        phone: e.phone || null,
                        role: "INSPECTION_BOY",
                    },
                })
                await prisma.employee.update({ where: { id: e.id }, data: { userId: user.id } })
                created++
            } catch (err) {
                console.error("BULK_LOGIN_FAIL", e.id, err)
                failed++
            }
        }

        return NextResponse.json({ created, linked, reset, failed, total: employees.length })
    } catch (error) {
        console.error("POST_EMPLOYEE_LOGINS_ERROR", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}
