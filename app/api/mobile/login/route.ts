import { NextResponse } from "next/server"
import { encode } from "next-auth/jwt"
import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"

// Mobile (native app) login. Validates credentials against the same User /
// Employee records the web app uses, then mints a NextAuth-compatible JWT with
// `encode` + NEXTAUTH_SECRET. The token is verified later by lib/apiSession's
// `decode`, so the same secret is the only shared dependency.
//
// Demo logins (admin@cims.com / demo123 etc.) mirror the web's NextAuth
// behavior and are gated by the SAME flag (DEMO_ENABLED) so the two stay in
// lockstep — off in production unless ENABLE_DEMO_LOGIN=true.

const secret = process.env.NEXTAUTH_SECRET
const MAX_AGE = 30 * 24 * 60 * 60 // 30 days, matches web session

// Same gate as lib/auth.ts — demo creds work in dev, or in prod only when
// ENABLE_DEMO_LOGIN=true is explicitly set.
const DEMO_ENABLED = process.env.NODE_ENV !== "production" || process.env.ENABLE_DEMO_LOGIN === "true"
const DEMO_USERS: Record<string, { name: string; role: string }> = {
    "admin@cims.com": { name: "Admin User", role: "ADMIN" },
    "manager@cims.com": { name: "Manager User", role: "MANAGER" },
    "hr@cims.com": { name: "HR Manager", role: "HR_MANAGER" },
    "inspector@cims.com": { name: "Inspection Boy", role: "INSPECTION_BOY" },
    "client@cims.com": { name: "Client User", role: "CLIENT" },
}

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

const roleInclude = { customRole: { select: { name: true, color: true, permissions: true, isActive: true } } }

// Mint the token + user payload from a (real or synthetic) user object.
async function mintResponse(user: any) {
    const employee = await prisma.employee
        .findFirst({
            where: { userId: user.id },
            select: { id: true, employeeId: true, firstName: true, lastName: true, designation: true, photo: true },
        })
        .catch(() => null)

    const permissions = user.permissions ?? resolvePermissions(user)
    const customRoleName = user.customRoleName ?? (user.customRole?.isActive ? user.customRole.name : null)
    const customRoleColor = user.customRoleColor ?? (user.customRole?.isActive ? user.customRole.color : null)
    const photo = employee?.photo || user.photo || null

    const token = await encode({
        secret: secret!,
        maxAge: MAX_AGE,
        token: { id: user.id, name: user.name, email: user.email, role: user.role, permissions, customRoleName, customRoleColor, photo },
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

    const inputClean = identifier.replace(/@cims\.local$/i, "").trim()
    const inputDigits = phoneDigits(inputClean)

    try {
        // 0. Demo login — mirrors the web NextAuth provider exactly.
        if (DEMO_ENABLED && DEMO_USERS[identifier] && password === "demo123") {
            const realUser = await prisma.user.findUnique({ where: { email: identifier }, include: roleInclude })
            if (realUser) return await mintResponse(realUser)
            // No DB row — issue a synthetic demo session like the web does.
            return await mintResponse({
                id: `demo-${identifier}`,
                name: DEMO_USERS[identifier].name,
                email: identifier,
                role: DEMO_USERS[identifier].role,
                permissions: ["self.view"],
            })
        }

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

        return await mintResponse(user)
    } catch (err) {
        if (process.env.NODE_ENV !== "production") console.error("[MOBILE_LOGIN]", err)
        return NextResponse.json({ error: "Login failed. Please try again." }, { status: 500 })
    }
}
