import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import bcrypt from "bcryptjs"

export const maxDuration = 60
export const dynamic = "force-dynamic"

const tenDigit = (phone?: string | null) => {
    const d = (phone || "").replace(/\D/g, "")
    return d.length >= 10 ? d.slice(-10) : ""
}

// POST /api/admin/employee-logins/reset-mobile
// One-shot: force EVERY employee's login id AND password to their mobile number.
// Creates a login if missing, otherwise overwrites the id + password. Employees
// without a 10-digit phone are skipped (can't derive mobile credentials).
export async function POST() {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== Role.ADMIN) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const employees = await prisma.employee.findMany({
            select: { id: true, firstName: true, lastName: true, phone: true, userId: true },
        })

        let updated = 0
        let created = 0
        let skipped = 0
        let failed = 0

        for (const e of employees) {
            const mobile = tenDigit(e.phone)
            if (!mobile) { skipped++; continue }

            try {
                const hashed = await bcrypt.hash(mobile, 8)

                if (e.userId) {
                    // Overwrite the linked account's login id + password.
                    await prisma.user.update({
                        where: { id: e.userId },
                        data: { email: mobile, password: hashed, plainPassword: mobile },
                    })
                    updated++
                    continue
                }

                // No linked account — reuse one already on this mobile, else create.
                const existing = await prisma.user.findUnique({
                    where: { email: mobile },
                    include: { employeeProfile: { select: { id: true } } },
                })
                if (existing && !existing.employeeProfile) {
                    await prisma.user.update({
                        where: { id: existing.id },
                        data: { password: hashed, plainPassword: mobile },
                    })
                    await prisma.employee.update({ where: { id: e.id }, data: { userId: existing.id } })
                    updated++
                } else if (!existing) {
                    const user = await prisma.user.create({
                        data: {
                            name: `${e.firstName} ${e.lastName || ""}`.trim(),
                            email: mobile,
                            password: hashed,
                            plainPassword: mobile,
                            phone: e.phone || null,
                            role: "INSPECTION_BOY",
                        },
                    })
                    await prisma.employee.update({ where: { id: e.id }, data: { userId: user.id } })
                    created++
                } else {
                    // mobile already taken by another employee's account
                    failed++
                }
            } catch (err) {
                console.error("[RESET_MOBILE] failed for", e.id, err)
                failed++
            }
        }

        return NextResponse.json({ updated, created, skipped, failed, total: employees.length })
    } catch (error) {
        console.error("RESET_MOBILE_ERROR", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}
