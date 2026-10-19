import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { buildLoginEmail, hasOwnPassword, NO_PASSWORD } from "@/lib/credentials"
import { getCredential, lockMinutesLeft, resetLogin } from "@/lib/login-security"

// GET /api/debug-login?input=9322059808
// Login diagnostic for any employee — ADMIN only. Reports which lookup finds
// the account and its state (active, has a self-set password, has an MPIN,
// locked). Never returns a password or hash.
const userSelect = { id: true, email: true, role: true, isActive: true, name: true, password: true } as const

async function describe(user: { id: string; isActive: boolean; password: string } | null | undefined) {
    if (!user) return { hasUser: false }
    const cred = await getCredential(user.id)
    return {
        hasUser: true,
        isActive: user.isActive,
        hasPassword: hasOwnPassword(user.password),
        hasMpin: !!cred.mpinHash,
        lockedMinutes: lockMinutesLeft(cred),
    }
}

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const input = searchParams.get("input") || ""

    const result: any = { input, checks: [] }

    // 1. Direct email lookup
    const byEmail = await prisma.user.findUnique({ where: { email: input }, select: userSelect })
    result.checks.push({
        step: "email_lookup",
        found: !!byEmail,
        email: byEmail?.email,
        ...(await describe(byEmail)),
    })

    // 2. Phone lookup
    const rawPhone = input.replace(/@cims\.local$/i, "").replace(/\D/g, "")
    if (rawPhone.length >= 10) {
        const byPhone = await prisma.employee.findFirst({
            where: { phone: { endsWith: rawPhone.slice(-10) } },
            include: { user: { select: userSelect } }
        })
        result.checks.push({
            step: "phone_lookup",
            rawPhone,
            found: !!byPhone,
            employeeName: byPhone ? `${byPhone.firstName} ${byPhone.lastName}` : null,
            employeeId: byPhone?.employeeId,
            userId: byPhone?.userId,
            userEmail: byPhone?.user?.email,
            ...(await describe(byPhone?.user)),
        })
    }

    // 3. EmployeeId lookup
    const byEmpId = await prisma.employee.findFirst({
        where: { employeeId: { equals: input, mode: "insensitive" } },
        include: { user: { select: userSelect } }
    })
    result.checks.push({
        step: "employeeId_lookup",
        found: !!byEmpId,
        employeeName: byEmpId ? `${byEmpId.firstName} ${byEmpId.lastName}` : null,
        userId: byEmpId?.userId,
        userEmail: byEmpId?.user?.email,
        ...(await describe(byEmpId?.user)),
    })

    return NextResponse.json(result)
}

// POST /api/debug-login { input } — reset the login for an employee by phone or
// employee id: makes sure an active account exists and is linked, then wipes
// its password + MPIN so the employee signs in with an OTP and starts fresh.
// No password is ever chosen or shown here.
export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { input } = await req.json()

    // Find employee by phone or employeeId — include customRoleId to set correct system role
    const rawPhone = (input || "").replace(/\D/g, "")
    let employee: any = null

    if (rawPhone.length >= 10) {
        employee = await prisma.employee.findFirst({
            where: { phone: { endsWith: rawPhone.slice(-10) } },
            include: { user: { select: { id: true, customRoleId: true } } }
        })
    }
    if (!employee) {
        employee = await prisma.employee.findFirst({
            where: { employeeId: { equals: input, mode: "insensitive" } },
            include: { user: { select: { id: true, customRoleId: true } } }
        })
    }

    if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 })

    const email = buildLoginEmail({ email: employee.email, phone: employee.phone, employeeId: employee.employeeId })
    const name = `${employee.firstName} ${employee.lastName}`.trim()

    // The base system role is vestigial — access comes from the custom role's
    // permissions, so every fixed login gets MANAGER regardless.
    const existingCustomRoleId = employee.user?.customRoleId || null
    const systemRole = "MANAGER"
    const select = { id: true, email: true, role: true, isActive: true, customRoleId: true } as const

    let user
    if (employee.userId) {
        user = await prisma.user.update({
            where: { id: employee.userId },
            data: { isActive: true, name, role: systemRole as any },
            select,
        })
    } else {
        // Check if user with this email already exists
        const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
        if (existing) {
            user = await prisma.user.update({
                where: { id: existing.id },
                data: { isActive: true, name, role: systemRole as any },
                select,
            })
            await prisma.employee.update({ where: { id: employee.id }, data: { userId: existing.id } })
        } else {
            user = await prisma.user.create({
                data: { email, name, role: systemRole as any, isActive: true, password: NO_PASSWORD, plainPassword: null, phone: employee.phone || null },
                select,
            })
            await prisma.employee.update({ where: { id: employee.id }, data: { userId: user.id } })
        }
    }
    await resetLogin([user.id])

    const customRoleName = existingCustomRoleId
        ? (await prisma.customRole.findUnique({ where: { id: existingCustomRoleId }, select: { name: true } }))?.name
        : null

    return NextResponse.json({
        success: true,
        user: { ...user, customRoleName },
        loginInput: user.email,
        next: "Employee signs in with an OTP to their mobile, then sets an MPIN.",
    })
}
