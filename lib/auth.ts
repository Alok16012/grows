
import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { Role } from "@prisma/client"

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
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                console.log("Authorize attempt for:", credentials?.email)

                // Demo Mode Handling
                const demoUsers: Record<string, { name: string, role: string }> = {
                    "admin@cims.com": { name: "Admin User", role: "ADMIN" },
                    "manager@cims.com": { name: "Manager User", role: "MANAGER" },
                    "hr@cims.com": { name: "HR Manager", role: "HR_MANAGER" },
                    "inspector@cims.com": { name: "Inspection Boy", role: "INSPECTION_BOY" },
                    "client@cims.com": { name: "Client User", role: "CLIENT" }
                }

                if (credentials?.email && demoUsers[credentials.email] && credentials.password === "demo123") {
                    console.log("Demo login attempt for:", credentials.email)

                    try {
                        // Fetch real user from DB to get the actual ID
                        const realUser = await prisma.user.findUnique({
                            where: { email: credentials.email },
                            include: { customRole: { select: { permissions: true, isActive: true } } }
                        })

                        if (realUser) {
                            console.log("Demo login successful (with real DB ID) for:", credentials.email)
                            return {
                                id: realUser.id,
                                name: realUser.name,
                                email: realUser.email,
                                role: realUser.role,
                                permissions: realUser.customRole?.isActive ? realUser.customRole.permissions : [],
                            }
                        }
                    } catch (dbError) {
                        console.error("Database error during demo login:", dbError)
                    }

                    // Fallback to mock ID if DB is down or user not found
                    console.warn("Demo user fallback to mock ID for:", credentials.email)
                    return {
                        id: `demo-${credentials.email}`,
                        name: demoUsers[credentials.email].name,
                        email: credentials.email,
                        role: demoUsers[credentials.email].role as any,
                    }
                }

                if (!credentials?.email || !credentials?.password) {
                    console.log("Missing email or password")
                    throw new Error("Invalid credentials")
                }

                try {
                    let user = await prisma.user.findUnique({
                        where: {
                            email: credentials.email,
                        },
                        include: { customRole: { select: { permissions: true, isActive: true } } }
                    })

                    // Fallback 1: Phone-number — try finding via Employee.phone
                    if (!user) {
                        // Strip @cims.local suffix and non-digits to get the raw phone number
                        const rawPhone = credentials.email.replace(/@cims\.local$/i, "").replace(/\D/g, "")
                        if (rawPhone.length >= 10) {
                            console.log("Email lookup failed — trying phone-number fallback for:", rawPhone)
                            const employee = await prisma.employee.findFirst({
                                where: { phone: { endsWith: rawPhone.slice(-10) } },
                                include: {
                                    user: {
                                        include: { customRole: { select: { permissions: true, isActive: true } } }
                                    }
                                }
                            })
                            if (employee?.user) {
                                console.log("Found user via phone lookup:", employee.user.email)
                                user = employee.user as any
                            }
                        }
                    }

                    // Fallback 2: Employee ID (e.g. EMP001) — try finding via Employee.employeeId
                    if (!user) {
                        const loginInput = credentials.email.replace(/@cims\.local$/i, "").trim()
                        console.log("Trying employeeId fallback for:", loginInput)
                        const employee = await prisma.employee.findFirst({
                            where: { employeeId: { equals: loginInput, mode: "insensitive" } },
                            include: {
                                user: {
                                    include: { customRole: { select: { permissions: true, isActive: true } } }
                                }
                            }
                        })
                        if (employee?.user) {
                            console.log("Found user via employeeId lookup:", employee.user.email)
                            user = employee.user as any
                        }
                    }

                    if (!user) {
                        console.log("User not found in database:", credentials.email)
                        throw new Error("Invalid credentials")
                    }

                    if (!user.password) {
                        console.log("User has no password set:", credentials.email)
                        throw new Error("Invalid credentials")
                    }

                    const isCorrectPassword = await bcrypt.compare(
                        credentials.password,
                        user.password
                    )

                    if (!isCorrectPassword) {
                        console.log("Password comparison failed for:", credentials.email)
                        throw new Error("Invalid credentials")
                    }

                    if (!user.isActive) {
                        console.log("User account is inactive:", credentials.email)
                        throw new Error("Account is inactive")
                    }

                    console.log("Login successful for:", credentials.email)
                    return {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        role: user.role,
                        permissions: user.customRole?.isActive ? user.customRole.permissions : [],
                    }
                } catch (error) {
                    console.error("Auth error details:", error)
                    throw error
                }
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user, trigger }) {
            if (user) {
                token.id = user.id
                token.role = user.role
                token.permissions = (user as any).permissions || []
            }
            // Re-fetch role + permissions from DB on each token refresh so changes take effect immediately
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
                } catch {
                    // Keep existing token if DB is unreachable
                }
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
