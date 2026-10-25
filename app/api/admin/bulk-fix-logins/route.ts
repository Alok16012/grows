import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NO_PASSWORD } from "@/lib/credentials"

// POST /api/admin/bulk-fix-logins
// Server-side bulk: makes sure every ACTIVE / ON_LEAVE employee with a phone has an ACTIVE login
// linked. Creates missing accounts (with no password — they sign in with an
// OTP), links unclaimed ones, re-activates linked ones. Never touches a
// password or MPIN.
export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        // Fetch all employees that have a phone number
        // Only people who work here now. A joiner gets a login when HR approves
        // their onboarding; someone who has left must not have theirs re-activated.
        const employees = await prisma.employee.findMany({
            where: { phone: { not: "" }, status: { in: ["ACTIVE", "ON_LEAVE"] } },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                employeeId: true,
                userId: true,
            },
        })

        let fixed = 0, skipped = 0, failed = 0
        const errors: string[] = []

        for (const emp of employees) {
            try {
                const phone = emp.phone?.trim()
                if (!phone) { skipped++; continue }

                const name = `${emp.firstName} ${emp.lastName}`.trim()
                const email = `${phone}@cims.local`

                if (emp.userId) {
                    // Update existing linked user
                    await prisma.user.update({
                        where: { id: emp.userId },
                        data: { isActive: true, name },
                    })
                    fixed++
                } else {
                    // Upsert user by email, then link to employee
                    const existing = await prisma.user.findUnique({ where: { email } })
                    let userId: string
                    if (existing) {
                        await prisma.user.update({
                            where: { id: existing.id },
                            data: { isActive: true, name },
                        })
                        userId = existing.id
                    } else {
                        const created = await prisma.user.create({
                            data: {
                                email,
                                name,
                                // Base role is vestigial; access comes from the custom role.
                                role: "MANAGER",
                                isActive: true,
                                password: NO_PASSWORD,
                                plainPassword: null,
                            },
                        })
                        userId = created.id
                    }
                    await prisma.employee.update({
                        where: { id: emp.id },
                        data: { userId },
                    })
                    fixed++
                }
            } catch (e: any) {
                failed++
                errors.push(`${emp.firstName} ${emp.lastName} (${emp.phone}): ${e.message}`)
            }
        }

        return NextResponse.json({
            success: true,
            total: employees.length,
            fixed,
            skipped,
            failed,
            errors: errors.slice(0, 20),
            message: `${fixed} employees ka login fix ho gaya. Employees OTP se sign in karke MPIN set karenge.`,
        })
    } catch (e: any) {
        console.error("[BULK_FIX_LOGINS]", e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
