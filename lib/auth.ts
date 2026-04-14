
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
                            where: { email: credentials.email }
                        })

                        if (realUser) {
                            console.log("Demo login successful (with real DB ID) for:", credentials.email)
                            return {
                                id: realUser.id,
                                name: realUser.name,
                                email: realUser.email,
                                role: realUser.role,
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
                    const user = await prisma.user.findUnique({
                        where: {
                            email: credentials.email,
                        },
                    })

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
            }
            // Re-fetch role from DB on each token refresh so role changes take effect immediately
            if (token.id && !user) {
                try {
                    const dbUser = await prisma.user.findUnique({
                        where: { id: token.id as string },
                        select: { role: true, isActive: true }
                    })
                    if (dbUser) {
                        token.role = dbUser.role
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
            }
            return session
        },
    },
}
