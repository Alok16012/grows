import { NextResponse } from "next/server"
import { encode } from "next-auth/jwt"
import prisma from "@/lib/prisma"
import { resolveAccess, accessVersion } from "@/lib/access-session"
import { recordLogin, recordLoginFailure, requestMetaOf } from "@/lib/access-audit"
import {
    verifyLogin, parseLoginMethod,
    AUTH_INVALID, AUTH_INACTIVE, AUTH_LOCKED, AUTH_USE_OTP, AUTH_NO_MPIN,
} from "@/lib/login-security"

// Mobile (native app) login. Validates credentials against the same User /
// Employee records the web app uses — through the very same verifyLogin as
// lib/auth.ts, so lockout and the no-default-password rule can't drift — then
// mints a NextAuth-compatible JWT with `encode` + NEXTAUTH_SECRET. The token is
// verified later by lib/apiSession's `decode`, so the same secret is the only
// shared dependency.
//
// Body: { identifier, password, method?: "password" | "mpin" | "otp" }. The
// secret always travels in `password`; `method` says what it is (default
// "password"). An OTP is requested first via POST /api/login/otp.
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
}

const roleInclude = { customRole: { select: { name: true, color: true, permissions: true, isActive: true } } }

// Mint the token + user payload from a (real or synthetic) user object.
async function mintResponse(user: any, extra: { needsMpin?: boolean } = {}) {
    const employee = await prisma.employee
        .findFirst({
            where: { userId: user.id },
            select: { id: true, employeeId: true, firstName: true, lastName: true, designation: true, photo: true, status: true },
        })
        .catch(() => null)

    // Only current staff may sign in — terminated / inactive employees are
    // locked out of the mobile app just like the web (see lib/auth.ts).
    if (employee && (employee.status === "TERMINATED" || employee.status === "INACTIVE" || employee.status === "RESIGNED")) {
        return NextResponse.json({ error: "Your account is inactive. Please contact HR." }, { status: 403 })
    }

    // Same resolution as the web session (lib/auth): catalogue permissions
    // expanded into the earlier keys, plus the role's data scope and sites.
    const access = String(user.id).startsWith("demo-")
        ? { permissions: user.permissions ?? ["self.view"], scope: null, siteIds: [] as string[] }
        : await resolveAccess(user)
    const permissions = access.permissions
    const accessVersionNow = String(user.id).startsWith("demo-") ? 0 : await accessVersion(user.id)
    const customRoleName = user.customRoleName ?? (user.customRole?.isActive ? user.customRole.name : null)
    const customRoleColor = user.customRoleColor ?? (user.customRole?.isActive ? user.customRole.color : null)
    const photo = employee?.photo || user.photo || null

    const token = await encode({
        secret: secret!,
        maxAge: MAX_AGE,
        token: {
            id: user.id, name: user.name, email: user.email, role: user.role, permissions, customRoleName, customRoleColor, photo,
            scope: access.scope, siteIds: access.siteIds, accessVersion: accessVersionNow,
        },
    })

    return NextResponse.json({
        token,
        // The app should send the user to set an MPIN when this is true.
        needsMpin: !!extra.needsMpin,
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

// Same codes as the web login (lib/login-security), as JSON with an HTTP status.
function failResponse(code: string) {
    if (code.startsWith(AUTH_LOCKED)) {
        const mins = Number(code.split(":")[1]) || 15
        return NextResponse.json({ error: `Too many wrong attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`, code: AUTH_LOCKED, minutesLeft: mins }, { status: 423 })
    }
    switch (code) {
        case AUTH_INACTIVE:
            return NextResponse.json({ error: "Your account is inactive. Contact HR.", code }, { status: 403 })
        case AUTH_USE_OTP:
            return NextResponse.json({ error: AUTH_USE_OTP, message: "No password set for this account yet — sign in with an OTP, then set your MPIN." }, { status: 403 })
        case AUTH_NO_MPIN:
            return NextResponse.json({ error: AUTH_NO_MPIN, message: "No MPIN set yet — sign in with an OTP first, then set your MPIN." }, { status: 403 })
        case AUTH_INVALID:
        default:
            return NextResponse.json({ error: "Invalid credentials", code: AUTH_INVALID }, { status: 401 })
    }
}

export async function POST(req: Request) {
    if (!secret) {
        return NextResponse.json({ error: "Server auth is not configured" }, { status: 500 })
    }

    let body: { identifier?: string; password?: string; email?: string; method?: string } = {}
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const identifier = (body.identifier ?? body.email ?? "").trim()
    const password = body.password ?? ""
    const method = parseLoginMethod(body.method)
    if (!identifier || !password) {
        return NextResponse.json({ error: `Employee ID / mobile and ${method === "password" ? "password" : method.toUpperCase()} are required` }, { status: 400 })
    }

    try {
        // 0. Demo login — mirrors the web NextAuth provider exactly.
        if (DEMO_ENABLED && method === "password" && DEMO_USERS[identifier] && password === "demo123") {
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

        const result = await verifyLogin({ identifier, secret: password, method })
        const meta = requestMetaOf(req)
        if (!result.ok) {
            console.warn(`[MOBILE_LOGIN] login failed — reason=${result.reason} method=${method}`)
            recordLoginFailure({ loginId: identifier.length > 4 ? `${identifier.slice(0, 2)}***${identifier.slice(-2)}` : "***", method, reason: result.code, ...meta })
            return failResponse(result.code)
        }
        recordLogin({ userId: result.user.id, name: result.user.name, method: `${method} (app)`, ...meta })
        return await mintResponse(result.user, { needsMpin: result.needsMpin })
    } catch (err) {
        if (process.env.NODE_ENV !== "production") console.error("[MOBILE_LOGIN]", err)
        return NextResponse.json({ error: "Login failed. Please try again." }, { status: 500 })
    }
}
