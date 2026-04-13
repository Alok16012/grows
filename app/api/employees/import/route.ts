import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"

interface ImportRow {
    firstName?: string
    lastName?: string
    phone?: string
    email?: string
    designation?: string
    branchName?: string
    employmentType?: string
    basicSalary?: string | number
    city?: string
    dateOfJoining?: string
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json()
    const rows: ImportRow[] = body.rows ?? []

    let imported = 0
    let skipped = 0
    const errors: { row: number; reason: string }[] = []

    // Fetch all branches once for lookup
    const allBranches = await prisma.branch.findMany({ select: { id: true, name: true } })

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const rowNum = i + 2

        const firstName = String(row.firstName ?? "").trim()
        const lastName = String(row.lastName ?? "").trim()
        const phone = String(row.phone ?? "").trim()
        const branchName = String(row.branchName ?? "").trim()

        if (!firstName || !lastName || !phone || !branchName) {
            errors.push({ row: rowNum, reason: "Missing required fields (First Name, Last Name, Phone, Branch Name)" })
            skipped++
            continue
        }

        // Case-insensitive branch lookup
        const branch = allBranches.find(b => b.name.toLowerCase() === branchName.toLowerCase())
        if (!branch) {
            errors.push({ row: rowNum, reason: `Branch not found: "${branchName}"` })
            skipped++
            continue
        }

        try {
            // Auto-generate employee ID
            const lastEmployee = await prisma.employee.findFirst({
                orderBy: { createdAt: "desc" },
                select: { employeeId: true },
            })
            let nextNum = 1
            if (lastEmployee?.employeeId) {
                const match = lastEmployee.employeeId.match(/\d+$/)
                if (match) nextNum = parseInt(match[0]) + 1
            }
            const employeeId = `EMP-${String(nextNum).padStart(4, "0")}`
            const existing = await prisma.employee.findUnique({ where: { employeeId } })
            const finalId = existing ? `EMP-${String(nextNum + 1).padStart(4, "0")}` : employeeId

            // Auto-create user
            const userEmail = row.email ? String(row.email).trim() : `${phone}@cims.local`
            const passwordHash = await bcrypt.hash(phone, 10)

            const existingUser = await prisma.user.findUnique({ where: { email: userEmail } })
            let userId: string
            if (existingUser) {
                userId = existingUser.id
            } else {
                const newUser = await prisma.user.create({
                    data: {
                        name: `${firstName} ${lastName}`,
                        email: userEmail,
                        password: passwordHash,
                        role: "INSPECTION_BOY",
                    },
                })
                userId = newUser.id
            }

            const salaryVal = row.basicSalary !== undefined && row.basicSalary !== "" ? parseFloat(String(row.basicSalary)) : 0

            await prisma.employee.create({
                data: {
                    employeeId: finalId,
                    firstName,
                    lastName,
                    phone,
                    email: row.email ? String(row.email).trim() : null,
                    designation: row.designation ? String(row.designation).trim() : null,
                    branchId: branch.id,
                    employmentType: row.employmentType ? String(row.employmentType).trim() : "Full-time",
                    basicSalary: salaryVal,
                    city: row.city ? String(row.city).trim() : null,
                    dateOfJoining: row.dateOfJoining ? new Date(String(row.dateOfJoining)) : null,
                    status: "ACTIVE",
                    userId,
                },
            })

            imported++
        } catch (err) {
            errors.push({ row: rowNum, reason: `DB error: ${(err as Error).message}` })
            skipped++
        }
    }

    return NextResponse.json({ imported, skipped, errors })
}
