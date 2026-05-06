
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
                email: { label: "Email", type: "text" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                console.log("Authorize attempt for:", credentials?.email)

                if (!credentials?.email || !credentials?.password) {
                    throw new Error("Invalid credentials")
                }

                // Demo Mode Handling
                const demoUsers: Record<string, { name: string, role: string }> = {
                    "admin@cims.com": { name: "Admin User", role: "ADMIN" },
                    "manager@cims.com": { name: "Manager User", role: "MANAGER" },
                    "hr@cims.com": { name: "HR Manager", role: "HR_MANAGER" },
                    "inspector@cims.com": { name: "Inspection Boy", role: "INSPECTION_BOY" },
                    "client@cims.com": { name: "Client User", role: "CLIENT" }
                }

                if (demoUsers[credentials.email] && credentials.password === "demo123") {
                    try {
                        const realUser = await prisma.user.findUnique({
                            where: { email: credentials.email },
                            include: { customRole: { select: { permissions: true, isActive: true } } }
                        })
                        if (realUser) {
                            return {
                                id: realUser.id,
                                name: realUser.name,
                                email: realUser.email,
                                role: realUser.role,
                                permissions: realUser.customRole?.isActive ? realUser.customRole.permissions : [],
                            }
                        }
                    } catch (e) { console.error("Demo DB error:", e) }
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
                    const rawPhone = inputClean.replace(/\D/g, "")

                    let user = await prisma.user.findUnique({
                        where: { email: inputRaw },
                        include: { customRole: { select: { permissions: true, isActive: true } } }
                    })

                    let matchedEmployee: any = null

                    // Fallback 1: Phone lookup via Employee
                    if (!user && rawPhone.length >= 10) {
                        console.log("Phone fallback:", rawPhone)
                        matchedEmployee = await prisma.employee.findFirst({
                            where: { phone: { endsWith: rawPhone.slice(-10) } },
                            include: {
                                user: { include: { customRole: { select: { permissions: true, isActive: true } } } }
                            }
                        })
                        if (matchedEmployee?.user) {
                            user = matchedEmployee.user as any
                            console.log("Found user via phone:", user!.email)
                        }
                    }

                    // Fallback 2: EmployeeId lookup
                    if (!user) {
                        console.log("EmployeeId fallback:", inputClean)
                        const emp = await prisma.employee.findFirst({
                            where: { employeeId: { equals: inputClean, mode: "insensitive" } },
                            include: {
                                user: { include: { customRole: { select: { permissions: true, isActive: true } } } }
                            }
                        })
                        if (emp) {
                            matchedEmployee = emp
                            if (emp.user) {
                                user = emp.user as any
                                console.log("Found user via employeeId:", user!.email)
                            }
                        }
                    }

                    // AUTO-HEAL: Employee exists but no User account → create one if password = phone (default)
                    if (!user && matchedEmployee && matchedEmployee.phone) {
                        const expectedPwd = matchedEmployee.phone.trim()
                        if (credentials.password === expectedPwd) {
                            console.log("Auto-healing: creating user account for employee", matchedEmployee.id)
                            const email = `${matchedEmployee.phone}@cims.local`
                            const hash = await bcrypt.hash(credentials.password, 10)
                            const name = `${matchedEmployee.firstName} ${matchedEmployee.lastName}`.trim()

                            // Check if a user exists with this generated email already
                            const existing = await prisma.user.findUnique({
                                where: { email },
                                include: { customRole: { select: { permissions: true, isActive: true } } }
                            })
                            if (existing) {
                                user = await prisma.user.update({
                                    where: { id: existing.id },
                                    data: { isActive: true, password: hash, name },
                                    include: { customRole: { select: { permissions: true, isActive: true } } }
                                }) as any
                            } else {
                                user = await prisma.user.create({
                                    data: { email, name, role: "INSPECTION_BOY", isActive: true, password: hash },
                                    include: { customRole: { select: { permissions: true, isActive: true } } }
                                }) as any
                            }
                            await prisma.employee.update({
                                where: { id: matchedEmployee.id },
                                data: { userId: user!.id }
                            })
                            console.log("Auto-heal complete for:", email)
                        }
                    }

                    if (!user) {
                        console.log("No user found for:", credentials.email)
                        throw new Error("Invalid credentials")
                    }

                    // AUTO-HEAL: User has no password set → set to phone if matches
                    if (!user.password && matchedEmployee?.phone && credentials.password === matchedEmployee.phone.trim()) {
                        console.log("Auto-healing: setting password for user", user.id)
                        const hash = await bcrypt.hash(credentials.password, 10)
                        user = await prisma.user.update({
                            where: { id: user.id },
                            data: { password: hash, isActive: true },
                            include: { customRole: { select: { permissions: true, isActive: true } } }
                        }) as any
                    }

                    if (!user!.password) {
                        console.log("User has no password:", credentials.email)
                        throw new Error("Invalid credentials")
                    }

                    const isCorrectPassword = await bcrypt.compare(credentials.password, user!.password)

                    // AUTO-HEAL: Wrong password but matches phone → reset to phone
                    if (!isCorrectPassword && matchedEmployee?.phone && credentials.password === matchedEmployee.phone.trim()) {
                        console.log("Auto-healing: resetting password to phone for user", user!.id)
                        const hash = await bcrypt.hash(credentials.password, 10)
                        user = await prisma.user.update({
                            where: { id: user!.id },
                            data: { password: hash, isActive: true },
                            include: { customRole: { select: { permissions: true, isActive: true } } }
                        }) as any
                    } else if (!isCorrectPassword) {
                        console.log("Password mismatch for:", credentials.email)
                        throw new Error("Invalid credentials")
                    }

                    // AUTO-HEAL: Inactive account → activate if password matched
                    if (!user!.isActive) {
                        console.log("Auto-healing: activating account for", user!.email)
                        user = await prisma.user.update({
                            where: { id: user!.id },
                            data: { isActive: true },
                            include: { customRole: { select: { permissions: true, isActive: true } } }
                        }) as any
                    }

                    console.log("Login successful for:", user!.email)
                    return {
                        id: user!.id,
                        name: user!.name,
                        email: user!.email,
                        role: user!.role,
                        permissions: user!.customRole?.isActive ? user!.customRole.permissions : [],
                    }
                } catch (error) {
                    console.error("Auth error:", error)
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
