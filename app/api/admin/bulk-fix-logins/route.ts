import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import bcrypt from "bcryptjs"

// POST /api/admin/bulk-fix-logins
// Server-side bulk: creates/activates user accounts for ALL employees in one DB round-trip
export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        // Fetch all employees that have a phone number
        const employees = await prisma.employee.findMany({
            where: { phone: { not: "" } },
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
                const hash = await bcrypt.hash(phone, 10)

                if (emp.userId) {
                    // Update existing linked user
                    await prisma.user.update({
                        where: { id: emp.userId },
                        data: { isActive: true, password: hash, name },
                    })
                    fixed++
                } else {
                    // Upsert user by email, then link to employee
                    const existing = await prisma.user.findUnique({ where: { email } })
                    let userId: string
                    if (existing) {
                        await prisma.user.update({
                            where: { id: existing.id },
                            data: { isActive: true, password: hash, name },
                        })
                        userId = existing.id
                    } else {
                        const created = await prisma.user.create({
                            data: {
                                email,
                                name,
                                role: "INSPECTION_BOY",
                                isActive: true,
                                password: hash,
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
            message: `${fixed} employees ka login fix ho gaya. Password = phone number.`,
        })
    } catch (e: any) {
        console.error("[BULK_FIX_LOGINS]", e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
