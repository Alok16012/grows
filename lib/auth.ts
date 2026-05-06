
import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { Role } from "@prisma/client"

// Normalize a phone-like string to last 10 digits
const phoneDigits = (s: string | null | undefined): string => {
    if (!s) return ""
    const d = s.replace(/\D/g, "")
    return d.length >= 10 ? d.slice(-10) : d
}

export const authOptions: NextAuthOptions = {
    adapter: PrismaAdapter(prisma),
    session: {
        strategy: "jwt",
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
                console.log("[AUTH] Attempt for:", credentials?.email)

                if (!credentials?.email || !credentials?.password) {
                    throw new Error("Invalid credentials")
                }

                const passwordRaw = credentials.password
                const passwordDigits = passwordRaw.replace(/\D/g, "")

                // Demo Mode
                const demoUsers: Record<string, { name: string, role: string }> = {
                    "admin@cims.com": { name: "Admin User", role: "ADMIN" },
                    "manager@cims.com": { name: "Manager User", role: "MANAGER" },
                    "hr@cims.com": { name: "HR Manager", role: "HR_MANAGER" },
                    "inspector@cims.com": { name: "Inspection Boy", role: "INSPECTION_BOY" },
                    "client@cims.com": { name: "Client User", role: "CLIENT" }
                }
                if (demoUsers[credentials.email] && passwordRaw === "demo123") {
                    try {
                        const realUser = await prisma.user.findUnique({
                            where: { email: credentials.email },
                            include: { customRole: { select: { permissions: true, isActive: true } } }
                        })
                        if (realUser) {
                            return {
                                id: realUser.id, name: realUser.name, email: realUser.email,
                                role: realUser.role,
                                permissions: realUser.customRole?.isActive ? realUser.customRole.permissions : [],
                            }
                        }
                    } catch (e) { console.error("[AUTH] Demo error:", e) }
                    return {
                        id: `demo-${credentials.email}`,
                        name: demoUsers[credentials.email].name,
                        email: credentials.email,
                        role: demoUsers[credentials.email].role as any,
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
                        include: { customRole: { select: { permissions: true, isActive: true } } }
                    })
                    if (user) {
                        console.log("[AUTH] Found via email:", user.email)
                        // Try to find linked employee for password fallback hints
                        matchedEmployee = await prisma.employee.findFirst({
                            where: { userId: user.id },
                            select: { id: true, firstName: true, lastName: true, phone: true, employeeId: true }
                        })
                    }

                    // Step 2: Phone lookup via Employee
                    if (!user && inputDigits.length === 10) {
                        console.log("[AUTH] Phone fallback:", inputDigits)
                        matchedEmployee = await prisma.employee.findFirst({
                            where: { phone: { endsWith: inputDigits } },
                            include: {
                                user: { include: { customRole: { select: { permissions: true, isActive: true } } } }
                            }
                        })
                        if (matchedEmployee?.user) {
                            user = matchedEmployee.user
                            console.log("[AUTH] Found user via phone:", user.email)
                        }
                    }

                    // Step 3: EmployeeId lookup
                    if (!user) {
                        console.log("[AUTH] EmployeeId fallback:", inputClean)
                        const emp = await prisma.employee.findFirst({
                            where: { employeeId: { equals: inputClean, mode: "insensitive" } },
                            include: {
                                user: { include: { customRole: { select: { permissions: true, isActive: true } } } }
                            }
                        })
                        if (emp) {
                            matchedEmployee = emp
                            if (emp.user) {
                                user = emp.user
                                console.log("[AUTH] Found user via employeeId:", user.email)
                            }
                        }
                    }

                    // Determine if password matches the employee phone (digits-only comparison)
                    const empPhoneDigits = matchedEmployee ? phoneDigits(matchedEmployee.phone) : ""
                    const passwordIsPhone = empPhoneDigits.length === 10 && passwordDigits === empPhoneDigits

                    // AUTO-HEAL #1: Employee found but no User account → create one if password is phone
                    if (!user && matchedEmployee && passwordIsPhone) {
                        console.log("[AUTH] Auto-heal: creating user for employee", matchedEmployee.id)
                        const email = `${empPhoneDigits}@cims.local`
                        const hash = await bcrypt.hash(passwordRaw, 10)
                        const name = `${matchedEmployee.firstName} ${matchedEmployee.lastName}`.trim()

                        const existing = await prisma.user.findUnique({
                            where: { email },
                            include: { customRole: { select: { permissions: true, isActive: true } } }
                        })
                        if (existing) {
                            user = await prisma.user.update({
                                where: { id: existing.id },
                                data: { isActive: true, password: hash, name },
                                include: { customRole: { select: { permissions: true, isActive: true } } }
                            })
                        } else {
                            user = await prisma.user.create({
                                data: { email, name, role: "INSPECTION_BOY", isActive: true, password: hash },
                                include: { customRole: { select: { permissions: true, isActive: true } } }
                            })
                        }
                        await prisma.employee.update({
                            where: { id: matchedEmployee.id },
                            data: { userId: user.id }
                        })
                    }

                    if (!user) {
                        console.log("[AUTH] No account found for:", credentials.email)
                        throw new Error("Invalid credentials")
                    }

                    // Verify password
                    let passwordOk = false
                    if (user.password) {
                        try {
                            passwordOk = await bcrypt.compare(passwordRaw, user.password)
                        } catch (e) {
                            console.error("[AUTH] bcrypt error:", e)
                        }
                    }

                    // AUTO-HEAL #2: Password missing/wrong but matches phone → reset to typed password
                    if (!passwordOk && passwordIsPhone) {
                        console.log("[AUTH] Auto-heal: resetting password for", user.email)
                        const hash = await bcrypt.hash(passwordRaw, 10)
                        user = await prisma.user.update({
                            where: { id: user.id },
                            data: { password: hash, isActive: true },
                            include: { customRole: { select: { permissions: true, isActive: true } } }
                        })
                        passwordOk = true
                    }

                    if (!passwordOk) {
                        console.log("[AUTH] Password mismatch for:", user.email)
                        throw new Error("Invalid credentials")
                    }

                    // AUTO-HEAL #3: Activate inactive accounts (password already verified)
                    if (!user.isActive) {
                        console.log("[AUTH] Auto-heal: activating", user.email)
                        user = await prisma.user.update({
                            where: { id: user.id },
                            data: { isActive: true },
                            include: { customRole: { select: { permissions: true, isActive: true } } }
                        })
                    }

                    console.log("[AUTH] Login successful for:", user.email)
                    return {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        role: user.role,
                        permissions: user.customRole?.isActive ? user.customRole.permissions : [],
                    }
                } catch (error) {
                    console.error("[AUTH] Error:", error)
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
            }
            if (token.id && !user) {
                try {
                    const dbUser = await prisma.user.findUnique({
                        where: { id: token.id as string },
                        select: { role: true, isActive: true, customRole: { select: { permissions: true, isActive: true } } }
                    })
                    if (dbUser) {
                        token.role = dbUser.role
                        token.permissions = dbUser.customRole?.isActive ? dbUser.customRole.permissions : []
                    }
                } catch { }
            }
            return token
        },
        async session({ session, token }) {
            if (token) {
                session.user.id = token.id
                session.user.role = token.role as Role
                session.user.permissions = (token.permissions as string[]) || []
            }
            return session
        },
    },
}
