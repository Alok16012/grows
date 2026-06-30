import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { buildLoginEmail, defaultPassword } from "@/lib/credentials"
import { checkAccess } from "@/lib/permissions"
import bcrypt from "bcryptjs"

// Update (or create) the login for a single employee: email, password, role, status.
export async function PATCH(
    req: Request,
    { params }: { params: { employeeId: string } }
) {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, [], "users.manage")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await req.json()
        const { loginEmail, password, customRoleId, isActive } = body as {
            loginEmail?: string
            password?: string
            customRoleId?: string | null
            isActive?: boolean
        }

        const employee = await prisma.employee.findUnique({
            where: { id: params.employeeId },
            select: { id: true, employeeId: true, firstName: true, lastName: true, email: true, phone: true, userId: true },
        })
        if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 })

        const normalizedEmail = loginEmail?.trim().toLowerCase()

        // Custom role decides the system role: MANAGER (dashboard) vs INSPECTION_BOY (field).
        const systemRole = customRoleId ? "MANAGER" : "INSPECTION_BOY"

        // No login yet → create one.
        if (!employee.userId) {
            const email = normalizedEmail || buildLoginEmail({ email: employee.email, phone: employee.phone, employeeId: employee.employeeId })
            const collision = await prisma.user.findFirst({ where: { email } })
            if (collision) return NextResponse.json({ error: "Email already in use" }, { status: 400 })

            const plain = password?.trim() || defaultPassword({ phone: employee.phone })
            const hashed = await bcrypt.hash(plain, 10)
            const user = await prisma.user.create({
                data: {
                    name: `${employee.firstName} ${employee.lastName || ""}`.trim(),
                    email,
                    password: hashed,
                    plainPassword: plain,
                    phone: employee.phone || null,
                    role: systemRole as Role,
                    customRoleId: customRoleId || null,
                    isActive: isActive ?? true,
                },
            })
            await prisma.employee.update({ where: { id: employee.id }, data: { userId: user.id } })
            return NextResponse.json({ created: true, email, password: plain })
        }

        // Existing login → patch the requested fields.
        const updateData: Record<string, unknown> = {}

        if (normalizedEmail) {
            const collision = await prisma.user.findFirst({ where: { email: normalizedEmail, NOT: { id: employee.userId } } })
            if (collision) return NextResponse.json({ error: "Email already in use" }, { status: 400 })
            updateData.email = normalizedEmail
        }
        if (password && password.trim()) {
            updateData.password = await bcrypt.hash(password.trim(), 10)
            updateData.plainPassword = password.trim()
        }
        if (customRoleId !== undefined) {
            updateData.customRoleId = customRoleId || null
            updateData.role = systemRole as Role
        }
        if (typeof isActive === "boolean") {
            updateData.isActive = isActive
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: "No data provided" }, { status: 400 })
        }

        const user = await prisma.user.update({ where: { id: employee.userId }, data: updateData })
        return NextResponse.json({ created: false, email: user.email, password: user.plainPassword })
    } catch (error) {
        console.error("PATCH_EMPLOYEE_LOGIN_ERROR", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}
