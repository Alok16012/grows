import { NextResponse } from "next/server"
import { encode } from "next-auth/jwt"
import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"

// Mobile (native app) login. Validates credentials against the same User /
// Employee records the web app uses, then mints a NextAuth-compatible JWT with
// `encode` + NEXTAUTH_SECRET. The token is verified later by lib/apiSession's
// `decode`, so the same secret is the only shared dependency. No auto-heal /
// demo shortcuts here — those are dev-only and irrelevant to production mobile.

const secret = process.env.NEXTAUTH_SECRET
const MAX_AGE = 30 * 24 * 60 * 60 // 30 days, matches web session

const phoneDigits = (s: string | null | undefined): string => {
    if (!s) return ""
    const d = s.replace(/\D/g, "")
    return d.length >= 10 ? d.slice(-10) : d
}

function resolvePermissions(user: { customRole?: { isActive: boolean; permissions: string[] } | null }): string[] {
    const base = ["self.view"]
    if (user.customRole?.isActive) {
        return Array.from(new Set([...base, ...user.customRole.permissions]))
    }
    return base
}

export async function POST(req: Request) {
    if (!secret) {
        return NextResponse.json({ error: "Server auth is not configured" }, { status: 500 })
    }

    let body: { identifier?: string; password?: string; email?: string } = {}
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const identifier = (body.identifier ?? body.email ?? "").trim()
    const password = body.password ?? ""
    if (!identifier || !password) {
        return NextResponse.json({ error: "Employee ID / email and password are required" }, { status: 400 })
    }

    const roleInclude = { customRole: { select: { name: true, color: true, permissions: true, isActive: true } } }
    const inputClean = identifier.replace(/@cims\.local$/i, "").trim()
    const inputDigits = phoneDigits(inputClean)

    try {
        let user: any = null

        // 1. Direct email match
        user = await prisma.user.findUnique({ where: { email: identifier }, include: roleInclude })

        // 2. Phone match via Employee
        if (!user && inputDigits.length === 10) {
            const emp = await prisma.employee.findFirst({
                where: { phone: { endsWith: inputDigits } },
                include: { user: { include: roleInclude } },
            })
            if (emp?.user) user = emp.user
        }

        // 3. Employee ID match
        if (!user) {
            const emp = await prisma.employee.findFirst({
                where: { employeeId: { equals: inputClean, mode: "insensitive" } },
                include: { user: { include: roleInclude } },
            })
            if (emp?.user) user = emp.user
        }

        if (!user || !user.password) {
            return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
        }

        let passwordOk = false
        try {
            passwordOk = await bcrypt.compare(password, user.password)
        } catch {
            passwordOk = false
        }
        if (!passwordOk) {
            return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
        }
        if (!user.isActive) {
            return NextResponse.json({ error: "Your account is inactive. Contact HR." }, { status: 403 })
        }

        const employee = await prisma.employee
            .findFirst({
                where: { userId: user.id },
                select: { id: true, employeeId: true, firstName: true, lastName: true, designation: true, photo: true },
            })
            .catch(() => null)

        const permissions = resolvePermissions(user)
        const customRoleName = user.customRole?.isActive ? user.customRole.name : null
        const customRoleColor = user.customRole?.isActive ? user.customRole.color : null
        const photo = employee?.photo || null

        const token = await encode({
            secret,
            maxAge: MAX_AGE,
            token: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                permissions,
                customRoleName,
                customRoleColor,
                photo,
            },
        })

        return NextResponse.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                permissions,
                customRoleName,
                customRoleColor,
                photo,
                employee: employee
                    ? {
                          id: employee.id,
                          employeeId: employee.employeeId,
                          firstName: employee.firstName,
                          lastName: employee.lastName,
                          designation: employee.designation,
                      }
                    : null,
            },
        })
    } catch (err) {
        if (process.env.NODE_ENV !== "production") console.error("[MOBILE_LOGIN]", err)
        return NextResponse.json({ error: "Login failed. Please try again." }, { status: 500 })
    }
}
