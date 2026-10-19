import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { buildLoginEmail, NO_PASSWORD } from "@/lib/credentials"
import { checkAccess } from "@/lib/permissions"
import { resetLogin } from "@/lib/login-security"

// Update (or create) the login for a single employee: login id, role, status.
// Admins never set a password. `{ action: "reset-login" }` wipes the password
// and MPIN (and any lockout) so the employee signs in with an OTP and starts
// over. A `password` field in the body is ignored.
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
        const { action, loginEmail, customRoleId, isActive } = body as {
            action?: string
            loginEmail?: string
            customRoleId?: string | null
            isActive?: boolean
        }

        const employee = await prisma.employee.findUnique({
            where: { id: params.employeeId },
            select: { id: true, employeeId: true, firstName: true, lastName: true, email: true, phone: true, userId: true },
        })
        if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 })

        if (action === "reset-login") {
            if (!employee.userId) return NextResponse.json({ error: "This employee has no login yet" }, { status: 400 })
            await resetLogin([employee.userId])
            return NextResponse.json({ reset: true })
        }

        const normalizedEmail = loginEmail?.trim().toLowerCase()

        // The base system role is vestigial — access comes from the custom role's
        // permissions, so every provisioned login gets MANAGER regardless.
        const systemRole = "MANAGER"

        // No login yet → create one, without a password.
        if (!employee.userId) {
            const email = normalizedEmail || buildLoginEmail({ email: employee.email, phone: employee.phone, employeeId: employee.employeeId })
            const collision = await prisma.user.findFirst({ where: { email } })
            if (collision) return NextResponse.json({ error: "Email already in use" }, { status: 400 })

            const user = await prisma.user.create({
                data: {
                    name: `${employee.firstName} ${employee.lastName || ""}`.trim(),
                    email,
                    password: NO_PASSWORD,
                    plainPassword: null,
                    phone: employee.phone || null,
                    role: systemRole as Role,
                    customRoleId: customRoleId || null,
                    isActive: isActive ?? true,
                },
            })
            await prisma.employee.update({ where: { id: employee.id }, data: { userId: user.id } })
            return NextResponse.json({ created: true, email })
        }

        // Existing login → patch the requested fields.
        const updateData: Record<string, unknown> = {}

        if (normalizedEmail) {
            const collision = await prisma.user.findFirst({ where: { email: normalizedEmail, NOT: { id: employee.userId } } })
            if (collision) return NextResponse.json({ error: "Email already in use" }, { status: 400 })
            updateData.email = normalizedEmail
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
        return NextResponse.json({ created: false, email: user.email })
    } catch (error) {
        console.error("PATCH_EMPLOYEE_LOGIN_ERROR", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}
