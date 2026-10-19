
import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import prisma from "@/lib/prisma"
import { Role } from "@prisma/client"
import {
    getCredential, verifyLogin, parseLoginMethod,
    AUTH_INVALID, AUTH_INACTIVE, AUTH_LOCKED, AUTH_USE_OTP, AUTH_NO_MPIN,
} from "@/lib/login-security"

// Resolve effective permissions for a user object from the DB.
// Permissions come EXCLUSIVELY from an assigned custom role (Admin → Roles).
// System roles like MANAGER / HR_MANAGER no longer carry any hardcoded default
// permissions — the custom roles configured in the app are the single source of
// truth. ADMIN remains a superuser (handled separately in checkAccess / can()).
function resolvePermissions(user: { role: string; customRole?: { isActive: boolean; permissions: string[] } | null }): string[] {
    // Every authenticated user gets employee self-service by default — access to
    // their OWN data only (profile, payslip, leaves, attendance, helpdesk). This
    // is a universal baseline, NOT a privilege bypass, so it needs no manual role
    // assignment. All other access still comes solely from the custom role.
    const base = ["self.view"]
    if (user.customRole?.isActive) {
        return Array.from(new Set([...base, ...user.customRole.permissions]))
    }
    return base
}

// Demo users are only enabled in development or when ENABLE_DEMO_LOGIN=true is
// explicitly set on the server. They MUST be off in production.
const DEMO_ENABLED = process.env.NODE_ENV !== "production" || process.env.ENABLE_DEMO_LOGIN === "true"

// ─── Login failure reporting ─────────────────────────────────────────────────
// The client is deliberately told only a coarse code: "inactive", "locked",
// "use OTP", "no MPIN" or a generic invalid-credentials message. It is NOT told
// whether the account exists, because the login form would otherwise let an
// anonymous caller enumerate which phone numbers and employee IDs are registered.
//
// The precise reason is logged server-side instead — in production too, since
// previously every login failure was silent there and the only way to diagnose
// one was to query the database by hand. The codes themselves live in
// lib/login-security so the mobile API answers with the same ones.

// Enough of the identifier to match against a support ticket, not enough for
// the log stream to become a directory of employee phone numbers.
function maskLoginId(v: string | null | undefined): string {
    const s = (v ?? "").trim()
    if (!s) return "(empty)"
    if (s.length <= 4) return `${s.slice(0, 1)}***(len ${s.length})`
    return `${s.slice(0, 2)}***${s.slice(-2)}(len ${s.length})`
}

// Log the real reason, then throw the coarse code the client is allowed to see.
function authFail(clientCode: string, reason: string, loginId?: string | null): never {
    console.warn(`[AUTH] login failed — reason=${reason} id=${maskLoginId(loginId)}`)
    throw new Error(clientCode)
}

export const authOptions: NextAuthOptions = {
    // PrismaAdapter removed — we use Credentials provider with JWT strategy,
    // so the adapter is not required. Removing it also eliminates a major
    // failure mode where a bad DATABASE_URL surfaces as a generic
    // "server configuration" error during NextAuth init.
    session: {
        strategy: "jwt",
        maxAge: 30 * 24 * 60 * 60, // 30 days
    },
    pages: {
        signIn: "/login",
    },
    providers: [
        CredentialsProvider({
            name: "credentials",
            // `email` is whatever was typed in the login box (login id, mobile
            // number or employee code). `method` picks the secret: the account
            // password, the 4-digit MPIN, or a 6-digit SMS OTP — all in `password`.
            credentials: {
                email: { label: "Email", type: "text" },
                password: { label: "Password", type: "password" },
                method: { label: "Method", type: "text" },
            },
            async authorize(credentials) {
                const method = parseLoginMethod(credentials?.method)
                if (!credentials?.email || !credentials?.password) {
                    authFail(AUTH_INVALID, `missing login id or ${method}`, credentials?.email)
                }

                const passwordRaw = credentials.password

                // Demo Mode — DEV ONLY. Disabled by default in production
                if (DEMO_ENABLED && method === "password") {
                    const demoUsers: Record<string, { name: string, role: string }> = {
                        "admin@cims.com":     { name: "Admin User",      role: "ADMIN" },
                        "manager@cims.com":   { name: "Manager User",    role: "MANAGER" },
                        "hr@cims.com":        { name: "HR Manager",      role: "HR_MANAGER" },
                        "inspector@cims.com": { name: "Inspection Boy",  role: "INSPECTION_BOY" },
                    }
                    if (demoUsers[credentials.email] && passwordRaw === "demo123") {
                        try {
                            const realUser = await prisma.user.findUnique({
                                where: { email: credentials.email },
                                include: { customRole: { select: { name: true, color: true, permissions: true, isActive: true } } }
                            })
                            if (realUser) {
                                return {
                                    id: realUser.id, name: realUser.name, email: realUser.email,
                                    role: realUser.role,
                                    permissions: resolvePermissions(realUser),
                                    customRoleName: realUser.customRole?.isActive ? realUser.customRole.name : null,
                                    customRoleColor: realUser.customRole?.isActive ? realUser.customRole.color : null,
                                } as any
                            }
                        } catch { /* fall through */ }
                        return {
                            id: `demo-${credentials.email}`,
                            name: demoUsers[credentials.email].name,
                            email: credentials.email,
                            role: demoUsers[credentials.email].role as any,
                        }
                    }
                }

                try {
                    const inputRaw = credentials.email.trim()
                    // Lookup, lockout, secret check and inactive checks are
                    // shared with /api/mobile/login — see verifyLogin.
                    const result = await verifyLogin({ identifier: inputRaw, secret: passwordRaw, method })
                    if (!result.ok) authFail(result.code, result.reason, inputRaw)
                    const { user, employee, needsMpin } = result

                    return {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        role: user.role,
                        permissions: resolvePermissions(user),
                        customRoleName: user.customRole?.isActive ? user.customRole.name : null,
                        customRoleColor: user.customRole?.isActive ? user.customRole.color : null,
                        photo: employee?.photo || null,
                        needsMpin,
                        loginMethod: method,
                    } as any
                } catch (error) {
                    // Expected outcomes (wrong password, inactive account) have
                    // already been logged with their reason by authFail. Anything
                    // else is a real fault — a database that is unreachable or out
                    // of connections, a schema mismatch — and must be visible in
                    // production, where this used to be logged only in dev and so
                    // surfaced to the user as an indistinguishable
                    // "invalid credentials".
                    const msg = error instanceof Error ? error.message : String(error)
                    const expected = [AUTH_INVALID, AUTH_INACTIVE, AUTH_USE_OTP, AUTH_NO_MPIN]
                    if (!expected.includes(msg) && !msg.startsWith(AUTH_LOCKED)) {
                        // Never log raw credentials — only the error itself.
                        console.error("[AUTH] unexpected error during sign-in:", error)
                    }
                    throw error
                }
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user, trigger }) {
            if (user) {
                ;(token as any).needsMpin = !!(user as any).needsMpin
                ;(token as any).loginMethod = (user as any).loginMethod || "password"
                token.id = user.id
                token.role = user.role
                token.permissions = (user as any).permissions || []
                ;(token as any).customRoleName = (user as any).customRoleName || null
                ;(token as any).customRoleColor = (user as any).customRoleColor || null
                ;(token as any).photo = (user as any).photo || null
            }
            // Refresh user role/permissions from DB at most once every 3 minutes.
            // These two queries used to run every 30s on virtually EVERY API
            // request (getServerSession runs this callback), which added two DB
            // round-trips of latency across the whole app. 3 min still propagates
            // permission changes quickly enough, at ~1/6th the DB load.
            // After /setup-mpin the client calls session.update(); re-read the
            // MPIN state from the DB rather than trusting anything it sends.
            if (trigger === "update" && token.id && (token as any).needsMpin) {
                try {
                    const c = await getCredential(token.id as string)
                    if (!c.installed || c.mpinHash) (token as any).needsMpin = false
                } catch { /* keep the flag; the page will retry */ }
            }

            const REFRESH_INTERVAL_MS = 3 * 60 * 1000
            const lastRefresh = (token as { roleRefreshedAt?: number }).roleRefreshedAt ?? 0
            const needsRefresh = token.id && !user && (Date.now() - lastRefresh > REFRESH_INTERVAL_MS)

            if (needsRefresh) {
                try {
                    // Run both lookups in parallel — this path is on the critical
                    // request latency path.
                    const [dbUser, employee] = await Promise.all([
                        prisma.user.findUnique({
                            where: { id: token.id as string },
                            select: { role: true, isActive: true, customRole: { select: { name: true, color: true, permissions: true, isActive: true } } }
                        }),
                        prisma.employee.findFirst({
                            where: { userId: token.id as string },
                            select: { photo: true, status: true }
                        }).catch(() => null),
                    ])
                    // Kill live sessions of users who were deleted, deactivated,
                    // or whose employee was terminated after they logged in.
                    // (Demo users have no DB row — skip them in dev.)
                    const isDemo = String(token.id).startsWith("demo-")
                    const lockedOut = !isDemo && (
                        !dbUser || !dbUser.isActive ||
                        (employee ? (employee.status === "TERMINATED" || employee.status === "INACTIVE" || employee.status === "RESIGNED") : false)
                    )
                    if (lockedOut) {
                        ;(token as any).invalidated = true
                    } else if (dbUser) {
                        token.role = dbUser.role
                        token.permissions = resolvePermissions(dbUser)
                        ;(token as any).customRoleName = dbUser.customRole?.isActive ? dbUser.customRole.name : null
                        ;(token as any).customRoleColor = dbUser.customRole?.isActive ? dbUser.customRole.color : null
                        ;(token as any).photo = employee?.photo || null
                        ;(token as { roleRefreshedAt?: number }).roleRefreshedAt = Date.now()
                    }
                } catch { /* keep stale token rather than crash */ }
            } else if (token.id && !user && !lastRefresh) {
                // First request after this fix lands — mark refresh time so the
                // interval kicks in. Don't hit the DB; the token already has
                // role/permissions from the authorize() callback at login.
                ;(token as { roleRefreshedAt?: number }).roleRefreshedAt = Date.now()
            }
            return token
        },
        async session({ session, token }) {
            // Token was invalidated (user deleted/deactivated/terminated) —
            // report no session so the client is treated as signed out.
            if ((token as any)?.invalidated) {
                return null as any
            }
            if (token) {
                session.user.id = token.id
                session.user.role = token.role as Role
                session.user.permissions = (token.permissions as string[]) || []
                ;(session.user as any).customRoleName = (token as any).customRoleName || null
                ;(session.user as any).customRoleColor = (token as any).customRoleColor || null
                ;(session.user as any).photo = (token as any).photo || null
                ;(session.user as any).needsMpin = !!(token as any).needsMpin
                ;(session.user as any).loginMethod = (token as any).loginMethod || "password"
            }
            return session
        },
    },
}
