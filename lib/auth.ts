
import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { Role } from "@prisma/client"
// Normalize a phone-like string to last 10 digits
const phoneDigits = (s: string | null | undefined): string => {
    if (!s) return ""
    const d = s.replace(/\D/g, "")
    return d.length >= 10 ? d.slice(-10) : d
}

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

// Demo users + phone-as-password auto-heal are only enabled in development
// or when ENABLE_DEMO_LOGIN=true is explicitly set on the server. They MUST
// be off in production to prevent trivial account takeover.
const DEMO_ENABLED = process.env.NODE_ENV !== "production" || process.env.ENABLE_DEMO_LOGIN === "true"
const DEV_LOG = process.env.NODE_ENV !== "production"
const dlog = (...args: unknown[]) => { if (DEV_LOG) console.log(...args) }

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
            credentials: {
                email: { label: "Email", type: "text" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    throw new Error("Invalid credentials")
                }

                const passwordRaw = credentials.password
                const passwordDigits = passwordRaw.replace(/\D/g, "")

                // Demo Mode — DEV ONLY. Disabled by default in production
                if (DEMO_ENABLED) {
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
                    const inputClean = inputRaw.replace(/@cims\.local$/i, "").trim()
                    const inputDigits = phoneDigits(inputClean)

                    let user: any = null
                    let matchedEmployee: any = null

                    // Step 1: Direct email lookup
                    user = await prisma.user.findUnique({
                        where: { email: inputRaw },
                        include: { customRole: { select: { name: true, color: true, permissions: true, isActive: true } } }
                    })
                    if (user) {
                        matchedEmployee = await prisma.employee.findFirst({
                            where: { userId: user.id },
                            select: { id: true, firstName: true, lastName: true, phone: true, employeeId: true }
                        })
                    }

                    // Step 2: Phone lookup via Employee
                    if (!user && inputDigits.length === 10) {
                        matchedEmployee = await prisma.employee.findFirst({
                            where: { phone: { endsWith: inputDigits } },
                            include: {
                                user: { include: { customRole: { select: { name: true, color: true, permissions: true, isActive: true } } } }
                            }
                        })
                        if (matchedEmployee?.user) user = matchedEmployee.user
                    }

                    // Step 3: EmployeeId lookup
                    if (!user) {
                        const emp = await prisma.employee.findFirst({
                            where: { employeeId: { equals: inputClean, mode: "insensitive" } },
                            include: {
                                user: { include: { customRole: { select: { name: true, color: true, permissions: true, isActive: true } } } }
                            }
                        })
                        if (emp) {
                            matchedEmployee = emp
                            if (emp.user) user = emp.user
                        }
                    }

                    const empPhoneDigits = matchedEmployee ? phoneDigits(matchedEmployee.phone) : ""
                    const passwordIsPhone = empPhoneDigits.length === 10 && passwordDigits === empPhoneDigits

                    // AUTO-HEAL #1 (DEV ONLY): Employee found but no User account → create one if password is phone
                    // This is a major attack vector in production: anyone with an employee's phone number
                    // could create an account with arbitrary password. Disabled outside development.
                    if (DEMO_ENABLED && !user && matchedEmployee && passwordIsPhone) {
                        dlog("[AUTH] Auto-heal: creating user for employee", matchedEmployee.id)
                        const email = `${empPhoneDigits}@cims.local`
                        const hash = await bcrypt.hash(passwordRaw, 10)
                        const name = `${matchedEmployee.firstName} ${matchedEmployee.lastName}`.trim()

                        const existing = await prisma.user.findUnique({
                            where: { email },
                            include: { customRole: { select: { name: true, color: true, permissions: true, isActive: true } } }
                        })
                        if (existing) {
                            user = await prisma.user.update({
                                where: { id: existing.id },
                                data: { isActive: true, password: hash, name },
                                include: { customRole: { select: { name: true, color: true, permissions: true, isActive: true } } }
                            })
                        } else {
                            user = await prisma.user.create({
                                data: { email, name, role: "INSPECTION_BOY", isActive: true, password: hash },
                                include: { customRole: { select: { name: true, color: true, permissions: true, isActive: true } } }
                            })
                        }
                        await prisma.employee.update({
                            where: { id: matchedEmployee.id },
                            data: { userId: user.id }
                        })
                    }

                    if (!user) throw new Error("Invalid credentials")

                    // Verify password
                    let passwordOk = false
                    if (user.password) {
                        try {
                            passwordOk = await bcrypt.compare(passwordRaw, user.password)
                        } catch { /* invalid hash format */ }
                    }

                    // AUTO-HEAL #2 (DEV ONLY): Password missing/wrong but matches employee phone → reset.
                    // CRITICAL: Anyone with knowledge of an employee's phone number could reset
                    // their password to anything they want. NEVER enable this in production.
                    if (DEMO_ENABLED && !passwordOk && passwordIsPhone) {
                        dlog("[AUTH] Auto-heal: resetting password for", user.email)
                        const hash = await bcrypt.hash(passwordRaw, 10)
                        user = await prisma.user.update({
                            where: { id: user.id },
                            data: { password: hash, isActive: true },
                            include: { customRole: { select: { name: true, color: true, permissions: true, isActive: true } } }
                        })
                        passwordOk = true
                    }

                    if (!passwordOk) throw new Error("Invalid credentials")

                    // Deactivated accounts stay locked out. Users are deactivated
                    // when their employee is terminated or deleted — a correct
                    // password must NOT silently revive the account.
                    if (!user.isActive) {
                        throw new Error("Your account is inactive. Please contact HR.")
                    }

                    // Look up employee record (photo + employment status)
                    const employee = await prisma.employee.findFirst({
                        where: { userId: user.id },
                        select: { photo: true, status: true }
                    }).catch(() => null)

                    // Only current staff may sign in: terminated / inactive
                    // employees are blocked even if their User row is active
                    // (e.g. status was changed before user-sync existed).
                    if (employee && (employee.status === "TERMINATED" || employee.status === "INACTIVE" || employee.status === "RESIGNED")) {
                        throw new Error("Your account is inactive. Please contact HR.")
                    }

                    return {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        role: user.role,
                        permissions: resolvePermissions(user),
                        customRoleName: user.customRole?.isActive ? user.customRole.name : null,
                        customRoleColor: user.customRole?.isActive ? user.customRole.color : null,
                        photo: employee?.photo || null,
                    } as any
                } catch (error) {
                    // Never log raw credentials — only the bare error for ops debugging
                    if (DEV_LOG) console.error("[AUTH] Error:", error)
                    throw error
                }
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
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
            }
            return session
        },
    },
}
