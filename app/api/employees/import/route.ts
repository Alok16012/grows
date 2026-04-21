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
    if (rows.length === 0) return NextResponse.json({ imported: 0, skipped: 0, errors: [] })

    let imported = 0
    let skipped = 0
    const errors: { row: number; reason: string }[] = []

    try {
        // Fetch all branches once for lookup
        const allBranches = await prisma.branch.findMany({ select: { id: true, name: true } })

        // Auto-generate employee ID starting block
        const lastEmployee = await prisma.employee.findFirst({
            orderBy: { createdAt: "desc" },
            select: { employeeId: true },
        })
        let nextNum = 1
        if (lastEmployee?.employeeId) {
            const match = lastEmployee.employeeId.match(/\d+$/)
            if (match) nextNum = parseInt(match[0]) + 1
        }

        // Pre-fetch existing records to drastically reduce DB queries and prevent Vercel Timeouts (504)
        const allPhones = rows.map(r => String(r.phone ?? "").trim()).filter(Boolean)
        const allEmails = rows.map(r => {
            const p = String(r.phone ?? "").trim()
            return r.email ? String(r.email).trim() : `${p}@cims.local`
        }).filter(Boolean)

        const existingPhones = await prisma.employee.findMany({
            where: { phone: { in: allPhones } },
            select: { phone: true }
        }).then(res => new Set(res.map(r => r.phone)))

        const existingUsers = await prisma.user.findMany({
            where: { email: { in: allEmails } },
            select: { id: true, email: true, employeeProfile: { select: { id: true } } }
        })
        const userMap = new Map(existingUsers.map(u => [u.email.toLowerCase(), u as any]))

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i]
            const rowNum = i + 2

            const firstName = String(row.firstName ?? "").trim()
            const lastName = String(row.lastName ?? "").trim()
            const phone = String(row.phone ?? "").trim()
            const branchName = String(row.branchName ?? "").trim()

            if (!firstName || !lastName || !phone) {
                errors.push({ row: rowNum, reason: "Missing required fields (First Name, Last Name, Phone)" })
                skipped++
                continue
            }

            if (existingPhones.has(phone)) {
                errors.push({ row: rowNum, reason: `Duplicate: Employee with phone ${phone} already exists` })
                skipped++
                continue
            }

            const userEmail = row.email ? String(row.email).trim() : `${phone}@cims.local`
            const userEmailLower = userEmail.toLowerCase()
            
            const existingUser = userMap.get(userEmailLower)
            if (existingUser && existingUser.employeeProfile) {
                errors.push({ row: rowNum, reason: `Duplicate: Employee already exists for email/phone ${userEmail}` })
                skipped++
                continue
            }

            // Optional branch lookup (only if provided)
            let branchId: string | null = null
            if (branchName) {
                const branch = allBranches.find(b => b.name.toLowerCase() === branchName.toLowerCase())
                if (branch) branchId = branch.id
            }

            try {
                // Ensure unique Employee ID
                let finalId = `EMP-${String(nextNum).padStart(4, "0")}`
                
                // Confirm no overlap
                let existingEmpCheck = await prisma.employee.findUnique({ where: { employeeId: finalId } })
                while(existingEmpCheck) {
                    nextNum++
                    finalId = `EMP-${String(nextNum).padStart(4, "0")}`
                    existingEmpCheck = await prisma.employee.findUnique({ where: { employeeId: finalId } })
                }
                nextNum++ // Prepare for next iteration

                // Auto-create user
                let userId: string
                if (existingUser) {
                    userId = existingUser.id
                } else {
                    const passwordHash = await bcrypt.hash(phone, 10)
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
                        branchId,
                        employmentType: row.employmentType ? String(row.employmentType).trim() : "Full-time",
                        basicSalary: salaryVal,
                        city: row.city ? String(row.city).trim() : null,
                        dateOfJoining: row.dateOfJoining ? new Date(String(row.dateOfJoining)) : null,
                        status: "ACTIVE",
                        userId,
                    },
                })
                
                // To prevent duplicates inside the same batch upload
                existingPhones.add(phone)
                userMap.set(userEmailLower, { id: userId, email: userEmailLower, employeeProfile: { id: "new" } })
                
                imported++
            } catch (err) {
                errors.push({ row: rowNum, reason: `DB error: ${(err as Error).message}` })
                skipped++
            }
        }
    } catch (err) {
        return NextResponse.json({ error: "Failed to process import" }, { status: 500 })
    }

    return NextResponse.json({ imported, skipped, errors })
}
