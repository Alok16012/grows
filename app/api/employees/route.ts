import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import bcrypt from "bcryptjs"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const branchId = searchParams.get("branchId")
        const departmentId = searchParams.get("departmentId")
        const status = searchParams.get("status")
        const search = searchParams.get("search")
        const employmentType = searchParams.get("employmentType")
        const companyId = searchParams.get("companyId")

        const where: Record<string, unknown> = {}
        if (branchId) where.branchId = branchId
        if (departmentId) where.departmentId = departmentId
        if (status) where.status = status
        if (employmentType) where.employmentType = employmentType
        if (companyId) {
            // filter via branch -> company
            where.branch = { companyId }
        }
        if (search) {
            where.OR = [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { employeeId: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } },
                { designation: { contains: search, mode: "insensitive" } },
            ]
        }

        const employees = await prisma.employee.findMany({
            where,
            include: {
                branch: { select: { id: true, name: true } },
                department: { select: { id: true, name: true } },
                _count: { select: { attendances: true, leaves: true } },
            },
            orderBy: { createdAt: "desc" },
        })

        return NextResponse.json(employees)
    } catch (error) {
        console.error("[EMPLOYEES_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const {
            firstName, lastName, email, phone, alternatePhone,
            dateOfBirth, gender, address, city, state, pincode,
            aadharNumber, panNumber, bankAccountNumber, bankIFSC, bankName,
            photo, designation, departmentId, branchId,
            dateOfJoining, status, employmentType, basicSalary, notes,
        } = body

        if (!firstName || !lastName || !phone || !branchId) {
            return new NextResponse("firstName, lastName, phone and branchId are required", { status: 400 })
        }

        // Auto-generate employeeId as EMP-NNNN
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

        // Check uniqueness (race condition safety)
        const existing = await prisma.employee.findUnique({ where: { employeeId } })
        const finalId = existing
            ? `EMP-${String(nextNum + 1).padStart(4, "0")}`
            : employeeId

        // ── Auto-create User account ──────────────────────────────────────────
        // Email: use provided email, else phone@cims.local
        // Password: phone number (employee can change later)
        // Role: INSPECTION_BOY by default
        const userEmail = email || `${phone}@cims.local`
        const passwordHash = await bcrypt.hash(phone, 10)

        // Check if user already exists with this email
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

        const employee = await prisma.employee.create({
            data: {
                employeeId: finalId,
                firstName,
                lastName,
                email,
                phone,
                alternatePhone,
                dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
                gender,
                address,
                city,
                state,
                pincode,
                aadharNumber,
                panNumber,
                bankAccountNumber,
                bankIFSC,
                bankName,
                photo,
                designation,
                departmentId: departmentId || null,
                branchId,
                dateOfJoining: dateOfJoining ? new Date(dateOfJoining) : null,
                status: status || "ACTIVE",
                employmentType: employmentType || "Full-time",
                basicSalary: basicSalary ? parseFloat(basicSalary) : 0,
                userId,
            },
        })

        return NextResponse.json({
            ...employee,
            _userCreated: !existingUser,
            _loginEmail: userEmail,
            _loginPassword: phone,
        })
    } catch (error) {
        console.error("[EMPLOYEES_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
