import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { buildLoginEmail, NO_PASSWORD } from "@/lib/credentials"
import { accessFrom } from "@/lib/access"
import { assertCanAssignRole, assertMayChangeLogin, RuleError } from "@/lib/role-rules"

export async function POST(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        // This route assigns system roles and custom roles. Without a permission
        // gate any signed-in employee could promote themselves to MANAGER with an
        // arbitrary custom role, so it needs the same `users.manage` gate as the
        // Employee Logins screen it backs.
        if (!checkAccess(session, ["ADMIN"], "users.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const { customRoleId } = await req.json()
        // No role above the caller's own (lib/role-rules).
        try {
            await assertCanAssignRole(accessFrom(session!), customRoleId || null)
        } catch (e) {
            if (e instanceof RuleError) return NextResponse.json({ error: e.message }, { status: e.status })
            throw e
        }

        const employee = await prisma.employee.findUnique({
            where: { id: params.id },
            select: { id: true, employeeId: true, firstName: true, lastName: true, email: true, phone: true, userId: true }
        })

        if (!employee) return new NextResponse("Employee not found", { status: 404 })

        // The base system role is vestigial — access comes from the custom role's
        // permissions, so every provisioned login gets MANAGER regardless.
        const systemRole = "MANAGER"

        const access = accessFrom(session!)
        const refuse = (e: unknown) => e instanceof RuleError ? NextResponse.json({ error: e.message }, { status: e.status }) : null

        // If employee already has a linked user → update customRole + system role
        if (employee.userId) {
            // Never on an Admin's login unless an Admin asks: this sets the role
            // to MANAGER, which demoted an Admin (QA audit F5).
            try {
                assertMayChangeLogin(access, await prisma.user.findUnique({ where: { id: employee.userId }, select: { role: true } }))
            } catch (e) { const r = refuse(e); if (r) return r; throw e }
            await prisma.user.update({
                where: { id: employee.userId },
                data: {
                    customRoleId: customRoleId || null,
                    role: systemRole as any,
                }
            })
            return NextResponse.json({ created: false, message: "Role updated" })
        }

        // No user account — create one. Same login-id rule as everywhere else;
        // no password: the employee signs in with an OTP and sets an MPIN.
        const loginEmail = buildLoginEmail({ email: employee.email, phone: employee.phone, employeeId: employee.employeeId })

        // Check if user with this email already exists
        let user = await prisma.user.findUnique({ where: { email: loginEmail } })
        if (user) {
            // Setting an employee's email to someone else's login id must not
            // hand that login over: refused for an Admin's login (QA audit F5)
            // and for one that already belongs to another employee.
            try {
                assertMayChangeLogin(access, user)
            } catch (e) { const r = refuse(e); if (r) return r; throw e }
            const owner = await prisma.employee.findFirst({ where: { userId: user.id, NOT: { id: params.id } }, select: { employeeId: true } })
            if (owner) {
                return NextResponse.json({ error: `That login id already belongs to ${owner.employeeId}. Give this employee a different email or mobile.` }, { status: 409 })
            }
            // Link existing user to employee & update role
            await prisma.employee.update({
                where: { id: params.id },
                data: { userId: user.id }
            })
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    customRoleId: customRoleId || null,
                    role: systemRole as any,
                }
            })
            return NextResponse.json({ created: false, message: "Existing user linked" })
        }

        // Create new user
        user = await prisma.user.create({
            data: {
                name: `${employee.firstName} ${employee.lastName}`,
                email: loginEmail,
                password: NO_PASSWORD,
                plainPassword: null,
                phone: employee.phone || null,
                role: systemRole as any,
                customRoleId: customRoleId || null,
            }
        })

        // Link user to employee
        await prisma.employee.update({
            where: { id: params.id },
            data: { userId: user.id }
        })

        return NextResponse.json({ created: true, email: loginEmail })
    } catch (error) {
        console.error("[FIX_LOGIN]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
