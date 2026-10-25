import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { buildLoginEmail, NO_PASSWORD } from "@/lib/credentials"
import { checkAccess } from "@/lib/permissions"
import { resetLogin } from "@/lib/login-security"
import { accessFrom, auditLater, requestMeta, bumpAccessVersion } from "@/lib/access"
import { assertCanAssignRole, assertKeepsAnAdmin, RuleError } from "@/lib/role-rules"

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

        const access = accessFrom(session!)
        const meta = requestMeta(req)
        if (action === "reset-login") {
            if (!employee.userId) return NextResponse.json({ error: "This employee has no login yet" }, { status: 400 })
            await resetLogin([employee.userId])
            auditLater({ actorId: access.userId, actorName: access.name, action: "user.resetLogin", targetType: "User", targetId: employee.userId, targetName: `${employee.firstName} ${employee.lastName ?? ""}`.trim(), summary: "Login reset from Employee Logins", ...meta })
            return NextResponse.json({ reset: true })
        }

        // Same rules as the Users screen: no role above the caller's own.
        if (customRoleId !== undefined) await assertCanAssignRole(access, customRoleId || null)
        if (isActive === false && employee.userId) await assertKeepsAnAdmin([employee.userId])

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
            auditLater({ actorId: access.userId, actorName: access.name, action: "user.create", targetType: "User", targetId: user.id, targetName: user.name, summary: `${user.name}: login created from Employee Logins`, after: { role: customRoleId || null, status: user.isActive ? "Active" : "Disabled" }, ...meta })
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

        const before = await prisma.user.findUnique({ where: { id: employee.userId }, select: { customRoleId: true, isActive: true, email: true } })
        const user = await prisma.user.update({ where: { id: employee.userId }, data: updateData })
        if ("customRoleId" in updateData || "isActive" in updateData) {
            await bumpAccessVersion(prisma, [user.id]).catch(() => { /* table not installed yet */ })
        }
        auditLater({ actorId: access.userId, actorName: access.name, action: "user.update", targetType: "User", targetId: user.id, targetName: user.name, summary: `${user.name}: changed from Employee Logins`, before, after: { customRoleId: user.customRoleId, isActive: user.isActive, email: user.email }, ...meta })
        return NextResponse.json({ created: false, email: user.email })
    } catch (error) {
        if (error instanceof RuleError) return NextResponse.json({ error: error.message }, { status: error.status })
        console.error("PATCH_EMPLOYEE_LOGIN_ERROR", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}
